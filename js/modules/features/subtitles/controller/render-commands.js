import { resolveSubtitleFontWeight } from '../../../subtitles-workflow.mjs';
import { buildSubtitlePreviewPresentationRuntime, parseSubtitleTimeToMsRuntime } from '../runtime/index.js';

export function createSubtitleRenderCommands(ctx, callbacks = {}) {
  const { state, el, api: ttsApi, ui, helpers, browser } = ctx;
  const toast = ui.toast;
  const getErrorMessage = helpers.getErrorMessage;
  const downloadBlob = helpers.downloadBlob;
  const hasDraftRows = callbacks.hasDraftRows || (() => false);
  const ensureRowsCoverDuration = callbacks.ensureRowsCoverDuration || (() => false);
  const refreshRemoteStatus = callbacks.refreshRemoteStatus || (() => {});
  const pollRenderStatus = callbacks.pollRenderStatus || (() => {});
  const renderDoneCard = callbacks.renderDoneCard || (() => {});
  const updateButtonsByPhase = callbacks.updateButtonsByPhase || (() => {});
  const reportPresence = callbacks.reportPresence || (() => {});

  async function onSaveClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota activa para guardar');
      return;
    }
    if (!state.subtitles2.dirty) {
      toast('No hay cambios para guardar');
      return;
    }
    if (hasDraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de guardar');
      return;
    }
    try {
      await reportPresence({ mode: 'editing' });
      await enqueueSave('manual');
      toast('Cambios guardados');
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error guardando Subtítulos 2'));
    } finally {
      updateButtonsByPhase();
    }
  }

  async function awaitPreviewFontsReady(documentRef) {
    await documentRef?.fonts?.ready?.catch?.(() => undefined);
  }

  function extractMeasuredLines(measurer) {
    const textNode = measurer.firstChild;
    if (!textNode || textNode.nodeType !== 3) return [];
    const documentRef = measurer.ownerDocument;
    const range = documentRef.createRange();
    const words = [];
    const text = textNode.nodeValue || '';
    for (const match of text.matchAll(/\S+/g)) {
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      const rect = Array.from(range.getClientRects()).find((item) => item.width > 0 && item.height > 0);
      if (rect) words.push({ text: match[0], top: rect.top });
    }
    range.detach?.();
    const lines = [];
    const tolerancePx = 2;
    for (const word of words) {
      const line = lines.find((item) => Math.abs(item.top - word.top) <= tolerancePx);
      if (line) {
        line.words.push(word.text);
        continue;
      }
      lines.push({ top: word.top, words: [word.text] });
    }
    return lines
      .sort((a, b) => a.top - b.top)
      .map((line) => line.words.join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  async function capturePreviewLayoutLines(rows) {
    const documentRef = browser?.document || globalThis.document;
    if (!documentRef?.body) return new Map();
    await awaitPreviewFontsReady(documentRef);
    const stageRect = el.subtitle2PreviewStage?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const measurer = documentRef.createElement('div');
    measurer.className = 'subtitle-preview-cue';
    measurer.setAttribute('aria-hidden', 'true');
    measurer.style.position = 'fixed';
    measurer.style.left = '-10000px';
    measurer.style.top = '-10000px';
    measurer.style.visibility = 'hidden';
    measurer.style.pointerEvents = 'none';
    measurer.style.transition = 'none';
    documentRef.body.appendChild(measurer);
    const linesByRowId = new Map();
    try {
      for (const row of rows) {
        const presentation = buildSubtitlePreviewPresentationRuntime({
          activeCue: row,
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
        });
        if (!presentation.hasCue || !presentation.text) continue;
        measurer.textContent = presentation.text;
        measurer.style.color = presentation.color;
        measurer.style.fontFamily = presentation.fontFamily;
        measurer.style.fontWeight = presentation.fontWeight;
        measurer.style.fontSize = `${presentation.fontSizePx}px`;
        measurer.style.width = `${presentation.cueWidthPx}px`;
        const lines = extractMeasuredLines(measurer);
        if (lines.length) linesByRowId.set(row.id, lines);
      }
    } finally {
      measurer.remove();
    }
    return linesByRowId;
  }

  function buildSegmentPayload(row, layoutLines = []) {
    const segment = {
      id: row.id,
      start_ms: parseSubtitleTimeToMsRuntime(row.start),
      end_ms: parseSubtitleTimeToMsRuntime(row.end),
      source_text: row.sourceText,
      translated_text: row.phrase,
      style: {
        font_size: Number(row.size),
        font_family: row.fontFamily,
        font_weight: row.fontWeight || resolveSubtitleFontWeight(row.fontFamily),
        color: row.color,
        align: row.align,
        max_width_px: Number(row.maxWidthPx || 1080),
        text_transform: 'uppercase',
        text_align: 'center',
        line_height: 1.02,
        padding_x_px: 22,
        padding_y_px: 14,
        stripe_enabled: true,
        stripe_thickness_px: 3,
        text_shadow: 'none',
      },
    };
    if (layoutLines.length) {
      segment.layout = {
        lines: layoutLines,
        source: 'browser-preview',
      };
    }
    return segment;
  }

  async function enqueueSave(saveMode) {
    if (hasDraftRows()) {
      throw new Error('Ubicá el subtítulo fantasma antes de guardar');
    }
    ensureRowsCoverDuration();
    const layoutLinesByRowId = await capturePreviewLayoutLines(state.subtitles2.rows);
    const response = await ttsApi.updateSubtitleSegments(state.subtitles2.sessionId, {
      base_version: state.subtitles2.snapshotVersion,
      save_mode: saveMode,
      segments: state.subtitles2.rows.map((row) => buildSegmentPayload(row, layoutLinesByRowId.get(row.id) || [])),
    });
    state.subtitles2.snapshotVersion = Number(response?.version || 0);
    state.subtitles2.savedVersion = Math.max(state.subtitles2.savedVersion, state.subtitles2.changeVersion);
    state.subtitles2.dirty = false;
    await refreshRemoteStatus();
    return response;
  }

  async function onReadyClicked() {
    if (!state.subtitles2.sessionId || state.subtitles2.snapshotVersion < 1) {
      toast('Necesitás una sesión remota lista antes de renderizar');
      return;
    }
    if (hasDraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de renderizar');
      return;
    }
    await enqueueSave('manual');
    state.subtitles2.renderStatus = 'queued';
    state.subtitles2.renderProgressPct = 0;
    state.subtitles2.renderArtifactReady = false;
    state.subtitles2.renderFailureReason = null;
    renderDoneCard();
    updateButtonsByPhase();
    try {
      const response = await ttsApi.startSubtitleRender(state.subtitles2.sessionId, {
        base_version: state.subtitles2.snapshotVersion,
        request_id: `sub-render-${Date.now()}`,
      });
      state.subtitles2.renderJobId = (response?.job?.id || '').toString();
      state.subtitles2.renderStatus = (response?.job?.status || 'queued').toString();
      state.subtitles2.renderArtifactReady = Boolean(response?.download?.ready);
      await pollRenderStatus(state.subtitles2.sessionId);
      await refreshRemoteStatus();
    } catch (error) {
      console.error(error);
      state.subtitles2.renderStatus = 'failed';
      state.subtitles2.renderArtifactReady = false;
      state.subtitles2.renderFailureReason = getErrorMessage(error, 'El render remoto falló');
      renderDoneCard();
      updateButtonsByPhase();
    }
  }

  async function onDownloadClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota para descargar');
      return;
    }
    const blob = await ttsApi.downloadSubtitleRender(state.subtitles2.sessionId);
    downloadBlob(blob, `${state.subtitles2.sessionId}.mp4`);
  }

  return {
    onSaveClicked,
    enqueueSave,
    onReadyClicked,
    onDownloadClicked,
  };
}

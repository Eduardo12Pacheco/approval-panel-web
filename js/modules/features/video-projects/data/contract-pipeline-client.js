import { DEFAULT_MUSIC_VOLUME } from '../domain/editor-state.js';
import { normalizeRowMotionForPreview } from '../domain/motion-presets.js';
import { applyAlternatingBoundaryTransitionDefaults } from '../domain/boundary-transitions.js';
import { resolveServiceConfig } from '../../../core/state/app-store.js';

function resolveVideoProjectKey(row = {}) {
  return (row.project_id || row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

function resolveVideoProjectTitle(row = {}, fallback = 'Proyecto sin título') {
  return [row.title, row.tema_principal, row.jugador, row.draft_id]
    .map((part) => (part || '').toString().trim())
    .find(Boolean) || fallback;
}

export function normalizePreparedContractRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  const normalizedRows = rows.map((row, index) => {
    const isVideoSegment = row?.media?.kind === 'video-segment';
    const mediaMode = !isVideoSegment && row?.mediaMode === 'newspaper' ? 'newspaper' : 'image';
    const dustType = row?.dust?.type || 'dust-1';
    const dustEnabled = isVideoSegment ? false : (row?.dust?.enabled !== undefined ? Boolean(row.dust.enabled) : true);
    const motion = normalizeRowMotionForPreview(row);

    return {
      id: (row?.id || row?.rowId || `row-${index + 1}`).toString(),
      rowId: (row?.rowId || row?.id || `row-${index + 1}`).toString(),
      index: Number(row?.index ?? index),
      phrase: (row?.phrase || row?.caption || '').toString(),
      startTime: Number(row?.startTime ?? 0),
      endTime: Number(row?.endTime ?? 0),
      selectedAssetId: isVideoSegment ? null : (row?.selectedAssetId || null),
      mediaMode,
      media: isVideoSegment ? { ...row.media } : { kind: 'image' },
      motionPresetId: motion.motionPresetId,
      motion: motion.motion,
      dust: { enabled: dustEnabled, type: dustType, assetId: dustEnabled ? (row?.dust?.assetId || dustType) : null, opacity: row?.dust?.opacity ?? 0.36, blendMode: row?.dust?.blendMode || 'screen' },
      logo: { enabled: row?.logo?.enabled !== false, source: row?.logo?.source || 'logo-alpha.webm' },
      filter: { enabled: Boolean(row?.filter?.enabled), mode: row?.filter?.mode || 'cover' },
      transition: row?.transition || 'none',
      ...(row?.transitionSource === 'auto' || row?.transitionSource === 'manual' ? { transitionSource: row.transitionSource } : {}),
      ...(row?.paragraphBoundaryAfter === true ? { paragraphBoundaryAfter: true } : {}),
      ...(row?.nextRowId ? { nextRowId: row.nextRowId.toString() } : {}),
      ...(row?.transitionConfig ? { transitionConfig: { ...row.transitionConfig } } : {}),
      ...(Object.prototype.hasOwnProperty.call(row || {}, 'sfx') ? { sfx: row.sfx } : {}),
    };
  }).filter((row) => row.id);
  return applyAlternatingBoundaryTransitionDefaults(normalizedRows);
}

function applyPreparedEditorDustDefaults(rows = []) {
  return rows.map((row) => {
    if (row?.media?.kind === 'video-segment') return { ...row, dust: { ...(row.dust || {}), enabled: false, type: row.dust?.type || 'dust-1', assetId: null } };
    const dustType = row?.dust?.type || 'dust-1';
    return {
      ...row,
      dust: {
        ...(row.dust || {}),
        enabled: true,
        type: dustType,
        assetId: row?.dust?.assetId || dustType,
        opacity: row?.dust?.opacity ?? 0.36,
        blendMode: row?.dust?.blendMode || 'screen',
      },
    };
  });
}

function buildApprovalSeedPayload(project = {}, settings = {}) {
  const draftId = resolveVideoProjectKey(project);
  const selectedImages = Array.isArray(project.selected_images) ? project.selected_images : [];
  const segments = Array.isArray(project.segments)
    ? project.segments.map((segment, index) => ({
      id: segment?.id || `row-${index + 1}`,
      phrase: (segment?.text || segment?.phrase || '').toString().trim(),
    })).filter((segment) => segment.phrase)
    : [];

  return {
    draft_id: draftId,
    project_id: draftId,
    title: resolveVideoProjectTitle(project),
    guion_piped: (project.guion_piped || '').toString(),
    segments,
    selected_images: selectedImages,
    voice_audio: project.voice_audio || null,
    background_audio: project.background_audio || null,
    brandChannel: settings?.brandChannel || project?.editor_state?.brandChannel || project?.editor_state?.brand_channel || 'pelotazo-ecuador',
    defaults: {
      fps: 30,
      preview: { width: 1280, height: 720 },
      final: { width: 1920, height: 1080 },
    },
  };
}

function validateContractPreparationInputs(project = {}) {
  const voiceUrl = (project?.voice_audio?.public_url || '').toString().trim();
  const backgroundUrl = (project?.background_audio?.public_url || '').toString().trim();
  if (!voiceUrl) {
    throw new Error('Falta el audio de voz (voice_audio.public_url). Subí y guardá el audio antes de preparar la preview.');
  }
  if (!backgroundUrl) {
    throw new Error('Falta la música de fondo (background_audio.public_url). Subí y guardá el audio antes de preparar la preview.');
  }
}

function resolveEditorPipelineClient({ api, settings }) {
  const remotionConfig = resolveServiceConfig(settings, 'remotion');
  const approvalConfig = resolveServiceConfig(settings, 'approvalPipeline');
  const remotionClient = api.createRemotionClient({
    resolveBaseUrl: () => remotionConfig.baseUrl || '',
  });
  const approvalBaseUrl = (approvalConfig.baseUrl || '').toString().trim();

  const remotionProvider = {
    client: remotionClient,
    providerId: 'remotion',
    providerMetadata: {
      id: 'remotion',
      baseUrl: (remotionConfig.baseUrl || '').toString().trim(),
      fallbackFrom: '',
      health: null,
    },
  };

  if (!approvalBaseUrl || typeof api?.createApprovalPipelineClient !== 'function') {
    return remotionProvider;
  }

  const approvalClient = api.createApprovalPipelineClient({ resolveBaseUrl: () => approvalBaseUrl });
  return {
    remotionProvider,
    approvalClient,
    approvalBaseUrl,
  };
}

function isHealthyApprovalResponse(healthPayload = {}) {
  const okFlag = healthPayload?.ok;
  const status = (healthPayload?.status || '').toString().trim().toLowerCase();
  if (okFlag !== true) return false;
  if (status && status !== 'ready' && status !== 'ok' && status !== 'healthy' && status !== 'up') return false;
  return true;
}

function sanitizeProviderHealthMetadata(healthPayload) {
  if (!healthPayload || typeof healthPayload !== 'object') return null;
  const sanitized = {};
  if (typeof healthPayload.ok === 'boolean') sanitized.ok = healthPayload.ok;
  const status = (healthPayload.status || '').toString().trim();
  if (status) sanitized.status = status;
  return Object.keys(sanitized).length ? sanitized : null;
}

export async function prepareVideoCompositionContract({ project, settings, api }) {
  validateContractPreparationInputs(project);

  const seed = buildApprovalSeedPayload(project, settings);
  const resolvedProvider = resolveEditorPipelineClient({ api, settings });

  const executePreparation = async ({ client, providerId, providerMetadata }) => {
    const created = await client.createFromApproval(seed);
    if (created?.alignmentStatus?.status !== 'ready') {
      const detail = created?.alignmentStatus?.details || created?.alignmentStatus?.warning || '';
      throw new Error(`Alineación de audio pendiente. Esperando Whisper...${detail ? ` (${detail})` : ''}`);
    }

    const canonicalSnapshot = created?.snapshot?.contractVersion === 'approval-editor-service-v1'
      ? created.snapshot
      : null;
    const compositionProjectId = created?.projectId || canonicalSnapshot?.projectId || created?.snapshot?.project?.projectId;
    if (!compositionProjectId) throw new Error('Remotion no devolvió projectId');

    const createdRows = normalizePreparedContractRows(canonicalSnapshot?.rows || created?.snapshot?.project?.rows);
    const status = await client.status(compositionProjectId);
    const statusSnapshot = status?.snapshot?.contractVersion === 'approval-editor-service-v1' ? status.snapshot : null;
    const statusRows = normalizePreparedContractRows(statusSnapshot?.rows || status?.project?.rows);
    const timedRows = applyPreparedEditorDustDefaults(createdRows.length ? createdRows : statusRows);
    if (!timedRows.length) throw new Error('Remotion no devolvió filas cronometradas para el editor.');

    return {
      compositionProjectId,
      timedRows,
      previewAssets: status?.previewAssets || created?.previewAssets || null,
      globalAudio: canonicalSnapshot?.audio || statusSnapshot?.audio || { voice: { volume: 1, muted: false }, music: { volume: DEFAULT_MUSIC_VOLUME, muted: false } },
      approvalContractSnapshot: canonicalSnapshot || statusSnapshot || null,
      snapshotId: created?.snapshotId || canonicalSnapshot?.snapshotId || statusSnapshot?.snapshotId || '',
      snapshotHash: created?.snapshotHash || canonicalSnapshot?.snapshotHash || statusSnapshot?.snapshotHash || '',
      provider: providerId,
      providerMetadata,
      client,
    };
  };

  if (resolvedProvider?.providerId === 'remotion') {
    return executePreparation(resolvedProvider);
  }

  const { approvalClient, approvalBaseUrl, remotionProvider } = resolvedProvider;
  let approvalHealth = null;
  let sanitizedApprovalHealth = null;
  try {
    approvalHealth = await approvalClient.health();
    sanitizedApprovalHealth = sanitizeProviderHealthMetadata(approvalHealth);
    if (!isHealthyApprovalResponse(approvalHealth)) {
      throw new Error('Approval health no está lista');
    }
  } catch {
    return executePreparation({
      ...remotionProvider,
      providerMetadata: {
        ...remotionProvider.providerMetadata,
        fallbackFrom: 'approval',
        health: sanitizeProviderHealthMetadata(approvalHealth),
      },
    });
  }

  try {
    return await executePreparation({
      client: approvalClient,
      providerId: 'approval',
      providerMetadata: {
        id: 'approval',
        baseUrl: approvalBaseUrl,
        fallbackFrom: '',
        health: sanitizedApprovalHealth,
      },
    });
  } catch (error) {
    const message = (error?.message || '').toString();
    const shouldFallbackToRemotion = /failed to fetch|no se pudo conectar|cors|network/i.test(message);
    if (!shouldFallbackToRemotion) throw error;
    return executePreparation({
      ...remotionProvider,
      providerMetadata: {
        ...remotionProvider.providerMetadata,
        fallbackFrom: 'approval',
        health: sanitizedApprovalHealth,
      },
    });
  }
}

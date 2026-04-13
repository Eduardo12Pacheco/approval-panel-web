const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';

function defaultSettings() {
  return {
    baseUrl: 'http://localhost:5678',
    secret: '',
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: '',
    ttsBasicUser: '',
    ttsBasicPass: '',
    ttsUserEmail: '',
  };
}

const state = {
  settings: loadSettings(),
  items: [],
  queue: [],
  selectedCardId: null,
  selectedTopic: null,
  deletingSource: false,
  currentView: 'approval',
  scriptDrafts: [],
  selectedScript: null,
  savingScript: false,
  publishingScript: false,
  audioJobId: null,
  audioPollingTimer: null,
  audioPollingToken: null,
  audioPollingInFlight: false,
  audioPollingErrorStreak: 0,
  audioStreamController: null,
  audioTerminalStatus: null,
  audioRunning: false,
};

let toastTimer = null;

const el = {
  authGate: document.getElementById('authGate'),
  appShell: document.getElementById('appShell'),
  authForm: document.getElementById('authForm'),
  authUser: document.getElementById('authUser'),
  authPass: document.getElementById('authPass'),
  stats: document.getElementById('stats'),
  cards: document.getElementById('cards'),
  searchInput: document.getElementById('searchInput'),
  countryFilter: document.getElementById('countryFilter'),
  sourcesFilter: document.getElementById('sourcesFilter'),
  openQueueBtn: document.getElementById('openQueueBtn'),
  queueDialog: document.getElementById('queueDialog'),
  closeQueueBtn: document.getElementById('closeQueueBtn'),
  queueMeta: document.getElementById('queueMeta'),
  queueList: document.getElementById('queueList'),
  refreshQueueBtn: document.getElementById('refreshQueueBtn'),
  runQueueBtn: document.getElementById('runQueueBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  topicDialog: document.getElementById('topicDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogBody: document.getElementById('dialogBody'),
  closeDialog: document.getElementById('closeDialog'),
  settingsDialog: document.getElementById('settingsDialog'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  secretInput: document.getElementById('secretInput'),
  ttsBaseUrlInput: document.getElementById('ttsBaseUrlInput'),
  ttsApiKeyInput: document.getElementById('ttsApiKeyInput'),
  ttsBasicUserInput: document.getElementById('ttsBasicUserInput'),
  ttsBasicPassInput: document.getElementById('ttsBasicPassInput'),
  ttsUserEmailInput: document.getElementById('ttsUserEmailInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  closeSettings: document.getElementById('closeSettings'),
  toast: document.getElementById('toast'),
  sidebarNav: document.getElementById('sidebarNav'),
  viewApproval: document.getElementById('viewApproval'),
  viewScripts: document.getElementById('viewScripts'),
  viewAudio: document.getElementById('viewAudio'),
  refreshScriptsBtn: document.getElementById('refreshScriptsBtn'),
  scriptStats: document.getElementById('scriptStats'),
  scriptCards: document.getElementById('scriptCards'),
  scriptEditorDialog: document.getElementById('scriptEditorDialog'),
  closeScriptEditor: document.getElementById('closeScriptEditor'),
  scriptEditorTitle: document.getElementById('scriptEditorTitle'),
  scriptEditorMeta: document.getElementById('scriptEditorMeta'),
  scriptEditedWordCount: document.getElementById('scriptEditedWordCount'),
  scriptEditedArea: document.getElementById('scriptEditedArea'),
  viewOriginalBtn: document.getElementById('viewOriginalBtn'),
  saveDraftBtn: document.getElementById('saveDraftBtn'),
  publishDraftBtn: document.getElementById('publishDraftBtn'),
  scriptOriginalDialog: document.getElementById('scriptOriginalDialog'),
  closeOriginalDialog: document.getElementById('closeOriginalDialog'),
  scriptOriginalTitle: document.getElementById('scriptOriginalTitle'),
  scriptOriginalMeta: document.getElementById('scriptOriginalMeta'),
  scriptOriginalWordCount: document.getElementById('scriptOriginalWordCount'),
  scriptOriginalArea: document.getElementById('scriptOriginalArea'),
  publishConfirmDialog: document.getElementById('publishConfirmDialog'),
  cancelPublishBtn: document.getElementById('cancelPublishBtn'),
  confirmPublishBtn: document.getElementById('confirmPublishBtn'),
  audioPresetSelect: document.getElementById('audioPresetSelect'),
  audioTextArea: document.getElementById('audioTextArea'),
  audioWordCount: document.getElementById('audioWordCount'),
  audioClearBtn: document.getElementById('audioClearBtn'),
  audioRunBtn: document.getElementById('audioRunBtn'),
  audioJobCard: document.getElementById('audioJobCard'),
  audioJobId: document.getElementById('audioJobId'),
  audioStatusLine: document.getElementById('audioStatusLine'),
  audioProgressLine: document.getElementById('audioProgressLine'),
  audioDownloadBtn: document.getElementById('audioDownloadBtn'),
};

export function bootApp() {
  bindEvents();
  hydrateSettingsForm();
  boot();
}

function boot() {
  const session = localStorage.getItem(sessionKey);
  if (session === 'ok') {
    el.authGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
    setView('approval');
    refreshAll();
    return;
  }
  el.authGate.classList.remove('hidden');
  el.appShell.classList.add('hidden');
}

function loadSettings() {
  const raw = localStorage.getItem(storageKey);
  const defaults = defaultSettings();
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveSettings(next) {
  state.settings = next;
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function bindEvents() {
  el.authForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const user = el.authUser.value.trim();
    const pass = el.authPass.value;

    if (user === AUTH_USER && pass === AUTH_PASS) {
      localStorage.setItem(sessionKey, 'ok');
      el.authGate.classList.add('hidden');
      el.appShell.classList.remove('hidden');
      el.authPass.value = '';
      setView('approval');
      toast('Sesión iniciada');
      refreshAll();
      return;
    }

    toast('Usuario o contraseña incorrectos');
  });

  el.sidebarNav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.nav-item[data-view]');
    if (!btn) return;
    setView(btn.dataset.view);
  });

  el.refreshBtn.addEventListener('click', refreshAll);
  el.refreshScriptsBtn.addEventListener('click', refreshScriptDrafts);
  el.openQueueBtn.addEventListener('click', () => {
    refreshQueue();
    el.queueDialog.showModal();
  });
  el.closeQueueBtn.addEventListener('click', () => el.queueDialog.close());
  el.refreshQueueBtn.addEventListener('click', refreshQueue);
  el.runQueueBtn.addEventListener('click', runQueue);
  el.settingsBtn.addEventListener('click', () => el.settingsDialog.showModal());
  el.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(sessionKey);
    location.reload();
  });
  el.closeSettings.addEventListener('click', () => el.settingsDialog.close());
  el.closeDialog.addEventListener('click', () => el.topicDialog.close());

  el.closeScriptEditor.addEventListener('click', () => {
    state.selectedScript = null;
    el.scriptEditorDialog.close();
  });

  el.scriptEditedArea.addEventListener('input', () => {
    updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  });

  el.viewOriginalBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.scriptOriginalTitle.textContent = `${state.selectedScript.jugador || 'Sin jugador'} · ${state.selectedScript.tema_principal || 'Sin tema'} (original)`;
    el.scriptOriginalMeta.textContent = `Estado: ${state.selectedScript.estado || 'borrador_generado'}`;
    el.scriptOriginalArea.value = (state.selectedScript.guion_draft || '').toString();
    updateWordCounter(el.scriptOriginalArea.value, el.scriptOriginalWordCount);
    el.scriptOriginalDialog.showModal();
  });

  el.closeOriginalDialog.addEventListener('click', () => el.scriptOriginalDialog.close());

  el.cancelPublishBtn.addEventListener('click', () => el.publishConfirmDialog.close());
  el.confirmPublishBtn.addEventListener('click', publishSelectedScript);
  el.saveDraftBtn.addEventListener('click', saveSelectedScript);
  el.publishDraftBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  el.audioTextArea.addEventListener('input', () => {
    updateWordCounter(el.audioTextArea.value, el.audioWordCount);
  });

  el.audioClearBtn.addEventListener('click', () => {
    el.audioTextArea.value = '';
    updateWordCounter('', el.audioWordCount);
  });

  el.audioRunBtn.addEventListener('click', runAudioGeneration);

  el.audioDownloadBtn.addEventListener('click', downloadAudioJob);

  el.saveSettingsBtn.addEventListener('click', () => {
    saveSettings({
      baseUrl: el.baseUrlInput.value.trim() || defaultSettings().baseUrl,
      secret: el.secretInput.value.trim(),
      ttsBaseUrl: el.ttsBaseUrlInput.value.trim() || defaultSettings().ttsBaseUrl,
      ttsApiKey: el.ttsApiKeyInput.value.trim(),
      ttsBasicUser: el.ttsBasicUserInput.value.trim(),
      ttsBasicPass: el.ttsBasicPassInput.value,
      ttsUserEmail: el.ttsUserEmailInput.value.trim(),
    });
    el.settingsDialog.close();
    toast('Configuración guardada');
    refreshAll();
  });

  [el.searchInput, el.countryFilter, el.sourcesFilter].forEach((i) => i.addEventListener('input', renderCards));

  el.dialogBody.addEventListener('click', async (ev) => {
    const actionBtn = ev.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'open-source') {
      const encodedUrl = actionBtn.dataset.url || '';
      const url = decodeURIComponent(encodedUrl);
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'delete-source') {
      const index = Number(actionBtn.dataset.index || 0);
      if (!Number.isInteger(index) || index < 1) return;
      await removeSourceFromTopic(index);
    }
  });
}

function setView(view) {
  state.currentView = view;
  const isApproval = view === 'approval';
  const isScripts = view === 'scripts';
  const isAudio = view === 'audio';
  el.viewApproval.classList.toggle('hidden', !isApproval);
  el.viewScripts.classList.toggle('hidden', !isScripts);
  el.viewAudio.classList.toggle('hidden', !isAudio);
  el.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  if (
    isAudio
    && state.audioJobId
    && !state.audioTerminalStatus
    && !state.audioPollingTimer
    && !state.audioStreamController
  ) {
    startAudioTracking(state.audioJobId);
  }
}

function hydrateSettingsForm() {
  el.baseUrlInput.value = state.settings.baseUrl;
  el.secretInput.value = state.settings.secret;
  el.ttsBaseUrlInput.value = state.settings.ttsBaseUrl;
  el.ttsApiKeyInput.value = state.settings.ttsApiKey;
  el.ttsBasicUserInput.value = state.settings.ttsBasicUser;
  el.ttsBasicPassInput.value = state.settings.ttsBasicPass;
  el.ttsUserEmailInput.value = state.settings.ttsUserEmail;
}

async function refreshAll() {
  await Promise.all([refreshPending(), refreshQueue(), refreshScriptDrafts()]);
}

async function refreshPending() {
  try {
    const data = await apiGet('/webhook/approval/pending/v1');
    state.items = (data.items || []).map((item) => ({
      ...item,
      resumen_cluster: (item.resumen_cluster ?? item.resumen ?? '').toString(),
    }));
    renderStats();
    renderCountryFilter();
    renderCards();
  } catch (err) {
    console.error(err);
    toast('Error cargando pendientes');
  }
}

async function refreshQueue() {
  try {
    const data = await apiGet('/webhook/approval/queue/v1');
    state.queue = data.items || [];
    renderQueue();
  } catch (err) {
    console.error(err);
    toast('Error cargando cola de aprobados');
  }
}

async function refreshScriptDrafts() {
  try {
    const data = await apiGet('/webhook/mvp-script-drafts-pending-v1');
    state.scriptDrafts = data.drafts || [];
    renderScriptStats();
    renderScriptCards();
  } catch (err) {
    console.error(err);
    toast('Error cargando borradores');
  }
}

async function runAudioGeneration() {
  if (state.audioRunning) return;

  const ttsBaseUrl = (state.settings.ttsBaseUrl || '').trim();
  const ttsApiKey = (state.settings.ttsApiKey || '').trim();
  if (!ttsBaseUrl) {
    toast('Configurá Base URL Audio API antes de ejecutar');
    return;
  }
  if (!ttsApiKey) {
    toast('Configurá x-api-key Audio API antes de ejecutar');
    return;
  }

  const text = el.audioTextArea.value.trim();
  if (text.length < 20) {
    toast('El texto es demasiado corto para generar audio');
    return;
  }

  const preset = (el.audioPresetSelect.value || 'balanced_default').trim();
  const requestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    state.audioRunning = true;
    state.audioTerminalStatus = null;
    state.audioPollingErrorStreak = 0;
    el.audioRunBtn.disabled = true;
    el.audioDownloadBtn.classList.add('hidden');

    const data = await ttsPost('/api/tts/jobs', {
      text,
      voice_profile: preset,
      request_id: requestId,
      title: 'manual-ui',
    });

    state.audioJobId = data.job_id;
    el.audioJobCard.classList.remove('hidden');
    el.audioJobId.textContent = `Job: ${data.job_id}`;
    el.audioStatusLine.textContent = `Estado: ${data.status || 'queued'}`;
    el.audioProgressLine.textContent = 'Progreso: en cola';

    toast('Job enviado. Comienza el procesamiento...');
    startAudioTracking(data.job_id);
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error enviando job de audio'));
  } finally {
    state.audioRunning = false;
    el.audioRunBtn.disabled = false;
  }
}

function startAudioTracking(jobId) {
  const streamStarted = startAudioStatusStream(jobId);
  if (!streamStarted) {
    startAudioPolling(jobId);
  }
}

function applyAudioJobStatus(jobId, data) {
  const status = (data?.status || 'queued').toString().toLowerCase();
  const stage = data?.progress?.stage || status || 'queued';
  const isTerminal = status === 'done' || status === 'error' || status === 'cancelled';

  if (state.audioTerminalStatus && !isTerminal) {
    return { terminal: false, status };
  }

  el.audioJobCard.classList.remove('hidden');
  el.audioJobId.textContent = `Job: ${jobId}`;
  el.audioStatusLine.textContent = `Estado: ${status || 'queued'}`;
  el.audioProgressLine.textContent = `Progreso: ${stage}`;

  if (status === 'done') {
    state.audioTerminalStatus = 'done';
    stopAudioTracking();
    el.audioDownloadBtn.classList.remove('hidden');
    toast('Audio listo para descarga');
    return { terminal: true, status };
  }

  if (status === 'error' || status === 'cancelled') {
    state.audioTerminalStatus = status;
    stopAudioTracking();
    const msg = data?.error?.message || `El job terminó en estado ${status}`;
    toast(msg);
    return { terminal: true, status };
  }

  return { terminal: false, status };
}

function startAudioStatusStream(jobId) {
  if (typeof AbortController === 'undefined') return false;

  stopAudioTracking();
  state.audioJobId = jobId;
  state.audioPollingErrorStreak = 0;

  const trackingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.audioPollingToken = trackingToken;

  const controller = new AbortController();
  state.audioStreamController = controller;

  const baseUrl = (state.settings.ttsBaseUrl || '').trim();
  if (!baseUrl) {
    state.audioStreamController = null;
    return false;
  }

  let headers;
  try {
    headers = buildTtsHeaders();
  } catch {
    state.audioStreamController = null;
    return false;
  }

  const url = `${baseUrl}/api/tts/jobs/${encodeURIComponent(jobId)}/events`;

  (async () => {
    let shouldFallbackToPolling = false;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        shouldFallbackToPolling = true;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (state.audioPollingToken === trackingToken) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const parsed = parseSseEventChunk(chunk);
          if (!parsed) continue;

          if (parsed.event === 'status') {
            try {
              const payload = JSON.parse(parsed.data || '{}');
              const result = applyAudioJobStatus(jobId, payload);
              if (!result.terminal) {
                state.audioPollingErrorStreak = 0;
              }
            } catch {
              // ignorar evento mal formado
            }
          } else if (parsed.event === 'error') {
            try {
              const payload = JSON.parse(parsed.data || '{}');
              const msg = payload?.message || 'Error en stream de estado';
              toast(msg);
            } catch {
              toast('Error en stream de estado');
            }
            shouldFallbackToPolling = true;
          }
        }
      }

      if (!state.audioTerminalStatus && state.audioPollingToken === trackingToken) {
        shouldFallbackToPolling = true;
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error(err);
        if (!state.audioTerminalStatus && state.audioPollingToken === trackingToken) {
          shouldFallbackToPolling = true;
        }
      }
    } finally {
      if (state.audioStreamController === controller) {
        state.audioStreamController = null;
      }

      if (shouldFallbackToPolling && !state.audioTerminalStatus && state.audioPollingToken === trackingToken) {
        startAudioPolling(jobId);
      }
    }
  })();

  return true;
}

function parseSseEventChunk(chunk) {
  const lines = (chunk || '').split(/\r?\n/);
  let event = 'message';
  const dataParts = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataParts.push(line.slice('data:'.length).trim());
    }
  }

  if (!dataParts.length && event === 'message') return null;
  return { event, data: dataParts.join('\n') };
}

function startAudioPolling(jobId) {
  stopAudioPolling();
  state.audioJobId = jobId;
  state.audioPollingErrorStreak = 0;
  state.audioPollingInFlight = false;

  const pollingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.audioPollingToken = pollingToken;

  const tick = async () => {
    if (state.audioPollingToken !== pollingToken) return;
    if (state.audioPollingInFlight) return;
    state.audioPollingInFlight = true;

    try {
      const data = await ttsGet(`/api/tts/jobs/${encodeURIComponent(jobId)}`);
      if (state.audioPollingToken !== pollingToken) return;

      const result = applyAudioJobStatus(jobId, data);
      state.audioPollingErrorStreak = 0;

      if (result.terminal) {
        return;
      }
    } catch (err) {
      if (state.audioPollingToken !== pollingToken) return;

      console.error(err);
      state.audioPollingErrorStreak += 1;

      if (state.audioPollingErrorStreak >= 3) {
        stopAudioPolling();
        toast(getErrorMessage(err, 'No se pudo consultar estado del job (3 intentos fallidos)'));
      }
    } finally {
      state.audioPollingInFlight = false;
    }
  };

  void tick();
  state.audioPollingTimer = setInterval(() => {
    void tick();
  }, 4000);
}

function stopAudioPolling() {
  state.audioPollingInFlight = false;
  if (state.audioPollingTimer) {
    clearInterval(state.audioPollingTimer);
    state.audioPollingTimer = null;
  }
}

function stopAudioStatusStream() {
  if (state.audioStreamController) {
    state.audioStreamController.abort();
    state.audioStreamController = null;
  }
}

function stopAudioTracking() {
  state.audioPollingToken = null;
  stopAudioPolling();
  stopAudioStatusStream();
}

async function downloadAudioJob() {
  if (!state.audioJobId) {
    toast('No hay job para descargar');
    return;
  }

  try {
    const blob = await ttsGetBlob(`/api/tts/jobs/${encodeURIComponent(state.audioJobId)}/download`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.audioJobId}.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error descargando audio'));
  }
}

function renderQueue() {
  const queue = state.queue;
  el.queueMeta.textContent = queue.length
    ? `${queue.length} tema(s) aprobado(s) esperando generación.`
    : 'Sin elementos en cola.';

  if (!queue.length) {
    el.queueList.innerHTML = '';
    return;
  }

  el.queueList.innerHTML = queue.map((item) => `
    <article class="queue-item">
      <strong>${escapeHtml(item.jugador || 'Sin jugador')}</strong>
      <div class="meta">${escapeHtml(item.tema_principal || 'Sin tema')}</div>
      <div class="meta">Fuentes: ${Number(item.cantidad_fuentes || 0)}</div>
    </article>
  `).join('');
}

function renderStats() {
  const total = state.items.length;
  const countries = new Set(state.items.map((i) => i.seleccion).filter(Boolean)).size;
  const avgSources = total ? (state.items.reduce((a, b) => a + Number(b.cantidad_fuentes || 0), 0) / total).toFixed(1) : 0;

  el.stats.innerHTML = `
    <div class="stat"><small>Pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>Países</small><strong>${countries}</strong></div>
    <div class="stat"><small>Promedio fuentes</small><strong>${avgSources}</strong></div>
  `;
}

function renderScriptStats() {
  const total = state.scriptDrafts.length;
  const inReview = state.scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'en_revision').length;
  const generated = state.scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'borrador_generado').length;

  el.scriptStats.innerHTML = `
    <div class="stat"><small>Borradores pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>En revisión</small><strong>${inReview}</strong></div>
    <div class="stat"><small>Recién generados</small><strong>${generated}</strong></div>
  `;
}

function renderCountryFilter() {
  const current = el.countryFilter.value;
  const countries = [...new Set(state.items.map((i) => i.seleccion).filter(Boolean))].sort();
  el.countryFilter.innerHTML = '<option value="">Todos los países</option>' +
    countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  el.countryFilter.value = current;
}

function filteredItems() {
  const q = el.searchInput.value.trim().toLowerCase();
  const country = el.countryFilter.value;
  const minSources = Number(el.sourcesFilter.value || 0);

  return state.items.filter((item) => {
    const searchMatch = !q || `${item.jugador} ${item.tema_principal}`.toLowerCase().includes(q);
    const countryMatch = !country || item.seleccion === country;
    const sourcesMatch = Number(item.cantidad_fuentes || 0) >= minSources;
    return searchMatch && countryMatch && sourcesMatch;
  });
}

function getEditorialTagLabel(rawTag) {
  const normalized = (rawTag || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  const labels = {
    elogio_prensa: 'Elogio Prensa',
    elogio_director_tecnico: 'Elogio Director Técnico',
    emotividad: 'Emotividad',
  };

  return labels[normalized] || '';
}

function renderCards() {
  const list = filteredItems();
  if (!list.length) {
    el.cards.innerHTML = '<p class="meta">No hay temas para mostrar con esos filtros.</p>';
    return;
  }

  el.cards.innerHTML = list.map((item) => {
    const tagLabel = getEditorialTagLabel(item.tag_editorial);
    const tagChip = tagLabel
      ? `<span class="chip chip--tag">${escapeHtml(tagLabel)}</span>`
      : '';

    return `
    <article class="card" data-card-id="${encodeURIComponent(item.cluster_id)}">
      <div class="meta">${escapeHtml(item.seleccion || 'Sin país')} · ${escapeHtml(item.jugador || 'Sin jugador')}</div>
      <div class="topic">${escapeHtml(item.tema_principal || 'Sin tema')}</div>
      <p class="summary">${escapeHtml((item.resumen_cluster || '').trim() || 'Sin resumen disponible para este tema.')}</p>
      <div>
        <span class="chip">Fuentes: ${Number(item.cantidad_fuentes || 0)}</span>
        ${tagChip}
      </div>
      <div class="card-actions">
        <button class="secondary" data-action="detail" data-id="${encodeURIComponent(item.cluster_id)}">Ver fuentes</button>
        <button class="approve" data-action="approve" data-id="${encodeURIComponent(item.cluster_id)}">Aprobar</button>
        <button class="reject" data-action="reject" data-id="${encodeURIComponent(item.cluster_id)}">Rechazar</button>
      </div>
    </article>
  `;
  }).join('');

  el.cards.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', async (ev) => {
      const interactive = ev.target.closest('button, a');
      if (interactive) return;
      const id = decodeURIComponent(card.dataset.cardId);
      await openDetail(id);
    });
  });

  el.cards.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = decodeURIComponent(btn.dataset.id);
      const action = btn.dataset.action;
      if (action === 'detail') return openDetail(id);
      await decision(id, action);
    });
  });
}

function renderScriptCards() {
  if (!state.scriptDrafts.length) {
    el.scriptCards.innerHTML = '<p class="meta">No hay guiones pendientes de edición/publicación.</p>';
    return;
  }

  el.scriptCards.innerHTML = state.scriptDrafts.map((item) => {
    const tagLabel = getEditorialTagLabel(item.tag_editorial);
    const tagChip = tagLabel ? `<span class="chip chip--tag">${escapeHtml(tagLabel)}</span>` : '';
    const status = (item.estado || 'borrador_generado').toString();

    return `
      <article class="card" data-script-id="${encodeURIComponent(item.cluster_id)}">
        <div class="meta">${escapeHtml(item.seleccion || 'Sin país')} · ${escapeHtml(item.jugador || 'Sin jugador')}</div>
        <div class="topic">${escapeHtml(item.tema_principal || 'Sin tema')}</div>
        <p class="summary">${escapeHtml((item.guion_editado || item.guion_draft || '').trim().slice(0, 260) || 'Sin guion disponible.')}</p>
        <div>
          <span class="chip">Estado: ${escapeHtml(status)}</span>
          ${tagChip}
        </div>
        <div class="card-actions">
          <button class="secondary" data-action="edit-script" data-id="${encodeURIComponent(item.cluster_id)}">Editar guion</button>
        </div>
      </article>
    `;
  }).join('');

  el.scriptCards.querySelectorAll('button[data-action="edit-script"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = decodeURIComponent(btn.dataset.id);
      await openScriptEditor(id);
    });
  });
}

async function openDetail(clusterId) {
  try {
    const data = await apiGet(`/webhook/approval/topic/v1?cluster_id=${encodeURIComponent(clusterId)}`);
    const item = data.item;
    state.selectedCardId = clusterId;
    state.selectedTopic = item;
    renderTopicDetail();
    el.topicDialog.showModal();
  } catch (err) {
    console.error(err);
    toast('No pude abrir el detalle');
  }
}

function renderTopicDetail() {
  const item = state.selectedTopic;
  if (!item) return;

  el.dialogTitle.textContent = `${item.jugador} · ${item.tema_principal}`;
  el.dialogBody.innerHTML = `
    <p><strong>Resumen:</strong> ${escapeHtml(item.resumen_cluster || 'Sin resumen')}</p>
    <p class="meta">Fuentes detectadas: ${item.sources?.length || 0}</p>
    ${(item.sources || []).map((s) => `
      <div class="source-item">
        <div class="source-content">
          <div><strong>${s.index}. ${escapeHtml(s.titular || 'Sin titular')}</strong></div>
          <div class="meta">${escapeHtml(s.fuente || 'Sin fuente')}</div>
        </div>
        <div class="source-actions">
          <button
            type="button"
            class="secondary"
            data-action="open-source"
            data-url="${encodeURIComponent(s.url || '')}"
          >Ver fuente</button>
          <button
            type="button"
            class="reject"
            data-action="delete-source"
            data-index="${s.index}"
            ${state.deletingSource ? 'disabled' : ''}
          >Eliminar</button>
        </div>
      </div>
    `).join('')}
  `;
}

async function openScriptEditor(clusterId) {
  await refreshScriptDrafts();
  const row = state.scriptDrafts.find((item) => (item.cluster_id || '').toString() === clusterId);
  if (!row) {
    toast('Ese borrador ya no existe o cambió. Actualizá la lista.');
    return;
  }
  state.selectedScript = row;
  el.scriptEditorTitle.textContent = `${row.jugador || 'Sin jugador'} · ${row.tema_principal || 'Sin tema'}`;
  el.scriptEditorMeta.textContent = `Estado: ${row.estado || 'borrador_generado'}`;
  el.scriptEditedArea.value = (row.guion_editado || row.guion_draft || '').toString();
  updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  el.scriptEditorDialog.showModal();
}

async function saveSelectedScript() {
  if (!state.selectedScript || state.savingScript) return;
  const edited = el.scriptEditedArea.value.trim();
  if (edited.length < 20) {
    toast('El guion editado es demasiado corto');
    return;
  }

  try {
    state.savingScript = true;
    el.saveDraftBtn.disabled = true;
    await apiPost('/webhook/mvp-script-draft-save-v1', {
      cluster_id: state.selectedScript.cluster_id,
      guion_editado: edited,
    });
    toast('Cambios guardados');
    await refreshScriptDrafts();
    if (state.selectedScript?.cluster_id) {
      const refreshed = state.scriptDrafts.find((item) => item.cluster_id === state.selectedScript.cluster_id);
      if (refreshed) state.selectedScript = refreshed;
    }
    el.scriptEditorMeta.textContent = 'Estado: en_revision';
  } catch (err) {
    console.error(err);
    if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
      toast('El borrador cambió o ya no existe. Actualizá la lista.');
      await refreshScriptDrafts();
      el.scriptEditorDialog.close();
      return;
    }
    toast('Error guardando cambios');
  } finally {
    state.savingScript = false;
    el.saveDraftBtn.disabled = false;
  }
}

async function publishSelectedScript() {
  if (!state.selectedScript || state.publishingScript) return;
  const edited = el.scriptEditedArea.value.trim();
  if (edited.length < 20) {
    toast('Guardá un guion válido antes de publicar');
    return;
  }

  try {
    state.publishingScript = true;
    el.confirmPublishBtn.disabled = true;
    await apiPost('/webhook/mvp-script-draft-save-v1', {
      cluster_id: state.selectedScript.cluster_id,
      guion_editado: edited,
    });
    await apiPost('/webhook/mvp-script-publish-v1', {
      cluster_id: state.selectedScript.cluster_id,
    });
    el.publishConfirmDialog.close();
    el.scriptEditorDialog.close();
    state.selectedScript = null;
    toast('Guion publicado correctamente');
    await refreshScriptDrafts();
  } catch (err) {
    console.error(err);
    if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
      toast('El borrador cambió o ya no existe. Actualizá la lista.');
      await refreshScriptDrafts();
      el.publishConfirmDialog.close();
      el.scriptEditorDialog.close();
      return;
    }
    toast('Error publicando guion');
  } finally {
    state.publishingScript = false;
    el.confirmPublishBtn.disabled = false;
  }
}

async function removeSourceFromTopic(removeIndex) {
  if (!state.selectedTopic || !state.selectedTopic.cluster_id) return;
  if (state.deletingSource) return;

  const confirmDelete = window.confirm('¿Eliminar esta fuente de la noticia?');
  if (!confirmDelete) return;

  const clusterId = state.selectedTopic.cluster_id;
  const currentSources = Array.isArray(state.selectedTopic.sources) ? state.selectedTopic.sources : [];
  const optimistic = currentSources
    .filter((source) => Number(source.index) !== removeIndex)
    .map((source, idx) => ({ ...source, index: idx + 1 }));

  state.selectedTopic = {
    ...state.selectedTopic,
    sources: optimistic,
    cantidad_fuentes: optimistic.length,
  };
  state.deletingSource = true;
  renderTopicDetail();

  try {
    await apiPost('/webhook/approval/sources/v1', {
      cluster_id: clusterId,
      remove_index: removeIndex,
    });

    toast('Fuente eliminada');
    await refreshPending();
    await openDetail(clusterId);
  } catch (err) {
    console.error(err);
    toast('Error eliminando fuente');
    await openDetail(clusterId);
  } finally {
    state.deletingSource = false;
    renderTopicDetail();
  }
}

async function decision(clusterId, action) {
  try {
    await apiPost('/webhook/approval/decision/v1', { cluster_id: clusterId, action });
    toast(`Tema ${action === 'approve' ? 'aprobado' : 'rechazado'}`);
    await refreshAll();
  } catch (err) {
    console.error(err);
    toast('Error al registrar decisión');
  }
}

async function runQueue() {
  try {
    el.runQueueBtn.disabled = true;
    el.runQueueBtn.textContent = 'Ejecutando...';

    const result = await apiPost('/webhook/approval/run-queue/v1', { max_items: 20 });
    toast(`Cola ejecutada: ${result.processed || 0} OK · ${result.failed || 0} error(es)`);
    await refreshAll();
  } catch (err) {
    console.error(err);
    toast('Error ejecutando cola');
  } finally {
    el.runQueueBtn.disabled = false;
    el.runQueueBtn.textContent = 'Ejecutar cola';
  }
}

async function apiGet(path) {
  const res = await fetch(`${state.settings.baseUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return res.json();
}

async function apiPost(path, payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.settings.secret) headers['x-approval-secret'] = state.settings.secret;

  const res = await fetch(`${state.settings.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `POST ${path} ${res.status}`;
    throw new Error(message);
  }

  if (data?.error || data?.status === 'error') {
    const message = data?.message || data?.error || `POST ${path} failed`;
    throw new Error(message);
  }

  return data;
}

async function ttsGet(path) {
  const baseUrl = (state.settings.ttsBaseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('Configuración de Audio API incompleta');
  }

  const headers = buildTtsHeaders();

  const res = await fetch(`${baseUrl}${path}`, { headers });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!res.ok || data?.error) {
    const message = data?.error?.message || data?.message || `GET ${path} ${res.status}`;
    throw new Error(message);
  }

  return data;
}

async function ttsPost(path, payload) {
  const baseUrl = (state.settings.ttsBaseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('Configuración de Audio API incompleta');
  }

  const headers = buildTtsHeaders('application/json');

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!res.ok || data?.error) {
    const message = data?.error?.message || data?.message || `POST ${path} ${res.status}`;
    throw new Error(message);
  }

  return data;
}

async function ttsGetBlob(path) {
  const baseUrl = (state.settings.ttsBaseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('Configuración de Audio API incompleta');
  }

  const headers = buildTtsHeaders();

  const res = await fetch(`${baseUrl}${path}`, { headers });
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const message = data?.error?.message || `GET ${path} ${res.status}`;
    throw new Error(message);
  }
  return res.blob();
}

function getErrorMessage(err, fallback) {
  const msg = (err?.message || '').toString().trim();
  return msg || fallback;
}

function buildTtsHeaders(contentType = null) {
  const apiKey = (state.settings.ttsApiKey || '').trim();
  if (!apiKey) {
    throw new Error('Configuración de Audio API incompleta');
  }

  const headers = {
    'x-api-key': apiKey,
    Authorization: getTtsBasicAuthHeader(),
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const devUserEmail = (state.settings.ttsUserEmail || '').trim();
  if (devUserEmail) headers['x-user-email'] = devUserEmail;

  return headers;
}

function getTtsBasicAuthHeader() {
  const user = (state.settings.ttsBasicUser || '').trim();
  const pass = (state.settings.ttsBasicPass || '').toString();
  if (!user || !pass) {
    throw new Error('Configurá usuario y contraseña de Audio API');
  }
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

function toast(message) {
  if (!el.toast) return;

  el.toast.textContent = message;

  if (typeof el.toast.showPopover === 'function') {
    el.toast.showPopover();
  }

  el.toast.classList.add('show');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');

    if (typeof el.toast.hidePopover === 'function') {
      el.toast.hidePopover();
    }

    toastTimer = null;
  }, 3000);
}

function updateWordCounter(text, targetEl) {
  if (!targetEl) return;
  const words = (text || '').trim().match(/\S+/g);
  const count = words ? words.length : 0;
  targetEl.textContent = `Palabras: ${count}`;
}

function escapeHtml(str) {
  return (str || '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

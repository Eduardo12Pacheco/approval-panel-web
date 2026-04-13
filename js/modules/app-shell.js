const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';

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
};

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
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  closeSettings: document.getElementById('closeSettings'),
  toast: document.getElementById('toast'),
  sidebarNav: document.getElementById('sidebarNav'),
  viewApproval: document.getElementById('viewApproval'),
  viewScripts: document.getElementById('viewScripts'),
  refreshScriptsBtn: document.getElementById('refreshScriptsBtn'),
  scriptStats: document.getElementById('scriptStats'),
  scriptCards: document.getElementById('scriptCards'),
  scriptEditorDialog: document.getElementById('scriptEditorDialog'),
  closeScriptEditor: document.getElementById('closeScriptEditor'),
  scriptEditorTitle: document.getElementById('scriptEditorTitle'),
  scriptEditorMeta: document.getElementById('scriptEditorMeta'),
  scriptDraftArea: document.getElementById('scriptDraftArea'),
  scriptEditedArea: document.getElementById('scriptEditedArea'),
  saveDraftBtn: document.getElementById('saveDraftBtn'),
  publishDraftBtn: document.getElementById('publishDraftBtn'),
  publishConfirmDialog: document.getElementById('publishConfirmDialog'),
  cancelPublishBtn: document.getElementById('cancelPublishBtn'),
  confirmPublishBtn: document.getElementById('confirmPublishBtn'),
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
  if (!raw) return { baseUrl: 'http://localhost:5678', secret: '' };
  try { return JSON.parse(raw); } catch { return { baseUrl: 'http://localhost:5678', secret: '' }; }
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

  el.cancelPublishBtn.addEventListener('click', () => el.publishConfirmDialog.close());
  el.confirmPublishBtn.addEventListener('click', publishSelectedScript);
  el.saveDraftBtn.addEventListener('click', saveSelectedScript);
  el.publishDraftBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  el.saveSettingsBtn.addEventListener('click', () => {
    saveSettings({
      baseUrl: el.baseUrlInput.value.trim() || 'http://localhost:5678',
      secret: el.secretInput.value.trim(),
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
  el.viewApproval.classList.toggle('hidden', !isApproval);
  el.viewScripts.classList.toggle('hidden', isApproval);
  el.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function hydrateSettingsForm() {
  el.baseUrlInput.value = state.settings.baseUrl;
  el.secretInput.value = state.settings.secret;
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
  el.scriptEditorMeta.textContent = `Estado: ${row.estado || 'borrador_generado'} · Cluster: ${row.cluster_id || '-'}`;
  el.scriptDraftArea.value = (row.guion_draft || '').toString();
  el.scriptEditedArea.value = (row.guion_editado || row.guion_draft || '').toString();
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
    el.scriptEditorMeta.textContent = `Estado: en_revision · Cluster: ${state.selectedScript?.cluster_id || '-'}`;
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

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 1800);
}

function escapeHtml(str) {
  return (str || '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

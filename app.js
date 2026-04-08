const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';

const state = {
  settings: loadSettings(),
  items: [],
  queue: [],
  selectedCardId: null,
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
};

bindEvents();
hydrateSettingsForm();
boot();

function boot() {
  const session = localStorage.getItem(sessionKey);
  if (session === 'ok') {
    el.authGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
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
      toast('Sesión iniciada');
      refreshAll();
      return;
    }

    toast('Usuario o contraseña incorrectos');
  });

  el.refreshBtn.addEventListener('click', refreshAll);
  el.refreshQueueBtn.addEventListener('click', refreshQueue);
  el.runQueueBtn.addEventListener('click', runQueue);
  el.settingsBtn.addEventListener('click', () => el.settingsDialog.showModal());
  el.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(sessionKey);
    location.reload();
  });
  el.closeSettings.addEventListener('click', () => el.settingsDialog.close());
  el.closeDialog.addEventListener('click', () => el.topicDialog.close());

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
}

function hydrateSettingsForm() {
  el.baseUrlInput.value = state.settings.baseUrl;
  el.secretInput.value = state.settings.secret;
}

async function refreshAll() {
  await Promise.all([refreshPending(), refreshQueue()]);
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

function renderCards() {
  const list = filteredItems();
  if (!list.length) {
    el.cards.innerHTML = '<p class="meta">No hay temas para mostrar con esos filtros.</p>';
    return;
  }

  el.cards.innerHTML = list.map((item) => `
    <article class="card" data-card-id="${encodeURIComponent(item.cluster_id)}">
      <div class="meta">${escapeHtml(item.seleccion || 'Sin país')} · ${escapeHtml(item.jugador || 'Sin jugador')}</div>
      <div class="topic">${escapeHtml(item.tema_principal || 'Sin tema')}</div>
      <p class="summary">${escapeHtml((item.resumen_cluster || '').trim() || 'Sin resumen disponible para este tema.')}</p>
      <div>
        <span class="chip">Fuentes: ${Number(item.cantidad_fuentes || 0)}</span>
      </div>
      <div class="card-actions">
        <button class="secondary" data-action="detail" data-id="${encodeURIComponent(item.cluster_id)}">Ver fuentes</button>
        <button class="approve" data-action="approve" data-id="${encodeURIComponent(item.cluster_id)}">Aprobar</button>
        <button class="reject" data-action="reject" data-id="${encodeURIComponent(item.cluster_id)}">Rechazar</button>
      </div>
    </article>
  `).join('');

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

async function openDetail(clusterId) {
  try {
    const data = await apiGet(`/webhook/approval/topic/v1?cluster_id=${encodeURIComponent(clusterId)}`);
    const item = data.item;
    state.selectedCardId = clusterId;
    el.dialogTitle.textContent = `${item.jugador} · ${item.tema_principal}`;
    el.dialogBody.innerHTML = `
      <p><strong>Resumen:</strong> ${escapeHtml(item.resumen_cluster || 'Sin resumen')}</p>
      <p class="meta">Fuentes detectadas: ${item.sources?.length || 0}</p>
      ${(item.sources || []).map((s) => `
        <div class="source-item">
          <div><strong>${s.index}. ${escapeHtml(s.titular || 'Sin titular')}</strong></div>
          <div class="meta">${escapeHtml(s.fuente || 'Sin fuente')}</div>
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">Abrir fuente</a>
        </div>
      `).join('')}
    `;
    el.topicDialog.showModal();
  } catch (err) {
    console.error(err);
    toast('No pude abrir el detalle');
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
  if (!res.ok) throw new Error(`POST ${path} ${res.status}`);
  return res.json();
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

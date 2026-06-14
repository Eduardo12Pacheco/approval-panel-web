import { fileURLToPath } from 'node:url';
import { createRadarApiClient } from '../api-client.js';
import { createRadarController } from '../controller.js';
import {
  formatMentionsCopy,
  formatTranscriptCopy,
  renderRadarMonitor,
  renderRadarHistory,
  renderRadarResults,
} from '../render.js';
import {
  buildRadarJobPayload,
  createRadarState,
  filterMonitorCards,
  getVisibleMonitorCards,
  mapMonitorCard,
  normalizeMonitorSummary,
  parseRadarKeywords,
} from '../state.js';

const __filename = fileURLToPath(import.meta.url);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function makeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
    contains(value) { return values.has(value); },
  };
}

function makeElement({ value = '', textContent = '' } = {}) {
  return {
    value,
    textContent,
    innerHTML: '',
    disabled: false,
    hidden: false,
    dataset: {},
    classList: makeClassList(),
    listeners: new Map(),
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
  };
}

async function runApiClientCheck() {
  const calls = [];
  const api = createRadarApiClient({
    getSettings: () => ({
      apiProfileMode: 'unified',
      apiOrigin: 'https://api.example.test',
      sharedApiKey: 'secret-token',
      transcriptServiceBaseUrl: 'https://legacy-radar.local/',
      channelMonitorBaseUrl: 'https://legacy-monitor.local/',
      channelMonitorApiKey: 'legacy-monitor-secret',
    }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/api/monitor/cards')) return new Response(JSON.stringify({ items: [{ video_id: 'video-1' }] }), { status: 200 });
      if (url.endsWith('/api/monitor/cards?limit=200&offset=0')) return new Response(JSON.stringify({ items: [{ video_id: 'video-1' }], pagination: { limit: 200, offset: 0, total: 1, has_more: false } }), { status: 200 });
      if (url.endsWith('/api/monitor/cards?target_country=important')) return new Response(JSON.stringify({ items: [{ video_id: 'important-1', target_country: 'important' }] }), { status: 200 });
      if (url.endsWith('/api/monitor/cards?target_country=important&limit=200&offset=0')) return new Response(JSON.stringify({ items: [{ video_id: 'important-1', target_country: 'important' }], pagination: { limit: 200, offset: 0, total: 1, has_more: false } }), { status: 200 });
      if (url.endsWith('/api/monitor/summary')) return new Response(JSON.stringify({ basura_count: 2, targets: [] }), { status: 200 });
      if (url.endsWith('/api/monitor/card-dismissals') && options.method === 'POST') return new Response(JSON.stringify({ status: 'dismissed', context_key: 'monitor-card:ecuador:video-1' }), { status: 200 });
      if (url.endsWith('/api/monitor/basura')) return new Response(JSON.stringify({ total: 2, items: [{ video_id: 'trash-1' }] }), { status: 200 });
      if (url.endsWith('/api/monitor/basura?limit=200&offset=0')) return new Response(JSON.stringify({ total: 2, items: [{ video_id: 'trash-1' }], pagination: { limit: 200, offset: 0, total: 2, has_more: false } }), { status: 200 });
      if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      if (url.endsWith('/jobs/job-1/summary')) return new Response(JSON.stringify({ items: [{ label: 'Argentina', count: 1, timestamps: ['00:12'] }] }), { status: 200 });
      if (url.endsWith('/jobs/job-1/export.txt')) return new Response('TXT backend', { status: 200, headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/jobs/job-1/cancel')) return new Response(JSON.stringify({ job_id: 'job-1', status: 'cancelled' }), { status: 200 });
      if (url.endsWith('/jobs/job-1') && options.method === 'DELETE') return new Response(JSON.stringify({ job_id: 'job-1', status: 'deleted' }), { status: 200 });
      if (url.endsWith('/jobs/job-1')) return new Response(JSON.stringify({ job_id: 'job-1', status: 'succeeded' }), { status: 200 });
      if (url.endsWith('/jobs') && options.method === 'POST') return new Response(JSON.stringify({ job_id: 'job-1', status: 'queued' }), { status: 201 });
      if (url.endsWith('/jobs')) return new Response(JSON.stringify({ items: [{ job_id: 'job-1' }] }), { status: 200 });
      return new Response(JSON.stringify({ message: 'bad secret-token failure' }), { status: 401 });
    },
  });

  await api.health();
  await api.createJob({ url: 'https://youtu.be/1', countries: ['argentina'], extra_keywords: ['Messi'] });
  await api.getJob('job-1');
  await api.history();
  await api.getSummary('job-1');
  await api.downloadExportText('job-1');
  await api.cancelJob('job-1');
  await api.deleteJob('job-1');
  const monitorPayload = await api.monitorCards();
  const importantMonitorPayload = await api.monitorCards('important');
  const pagedMonitorPayload = await api.monitorCards('', { limit: 200, offset: 0 });
  const monitorSummary = await api.monitorSummary();
  const basuraPayload = await api.monitorBasura({ limit: 200, offset: 0 });
  const dismissPayload = await api.dismissCard({ targetContext: 'Ecuador', videoId: 'video-1' });

  assertEqual(calls[0].url, 'https://api.example.test/radar/api/radar/health', 'health URL drift');
  assertEqual(calls[0].options.headers['x-api-key'], 'secret-token', 'health api key header drift');
  assertEqual(calls[1].url, 'https://api.example.test/radar/api/radar/jobs', 'create URL drift');
  assertEqual(calls[1].options.method, 'POST', 'create method drift');
  assertEqual(calls[1].options.headers['x-api-key'], 'secret-token', 'api key header drift');
  assertEqual(JSON.parse(calls[1].options.body).countries[0], 'argentina', 'create payload country drift');
  assertEqual(calls[2].url, 'https://api.example.test/radar/api/radar/jobs/job-1', 'detail URL drift');
  assertEqual(calls[3].url, 'https://api.example.test/radar/api/radar/jobs', 'history URL drift');
  assertEqual(calls[4].url, 'https://api.example.test/radar/api/radar/jobs/job-1/summary', 'summary URL drift');
  assertEqual(calls[5].url, 'https://api.example.test/radar/api/radar/jobs/job-1/export.txt', 'export URL drift');
  assertEqual(calls[6].url, 'https://api.example.test/radar/api/radar/jobs/job-1/cancel', 'cancel URL drift');
  assertEqual(calls[7].options.method, 'DELETE', 'delete method drift');
  assertEqual(calls[8].url, 'https://api.example.test/monitor/api/monitor/cards', 'monitor cards URL drift');
  assertEqual(calls[8].options.method, 'GET', 'monitor cards must be read-only GET');
  assertEqual(calls[8].options.headers['x-api-key'], 'secret-token', 'monitor cards shared api key header drift');
  assertDeepEqual(monitorPayload.items, [{ video_id: 'video-1' }], 'monitor cards payload drift');
  assertEqual(calls[9].url, 'https://api.example.test/monitor/api/monitor/cards?target_country=important', 'important monitor cards URL drift');
  assertDeepEqual(importantMonitorPayload.items, [{ video_id: 'important-1', target_country: 'important' }], 'important monitor cards payload drift');
  assertEqual(calls[10].url, 'https://api.example.test/monitor/api/monitor/cards?limit=200&offset=0', 'paged monitor cards URL drift');
  assertDeepEqual(pagedMonitorPayload.pagination, { limit: 200, offset: 0, total: 1, has_more: false }, 'paged monitor cards payload drift');
  assertEqual(calls[11].url, 'https://api.example.test/monitor/api/monitor/summary', 'monitor summary URL drift');
  assertEqual(calls[12].url, 'https://api.example.test/monitor/api/monitor/basura?limit=200&offset=0', 'monitor basura paged URL drift');
  assertEqual(monitorSummary.basura_count, 2, 'monitor summary basura counter drift');
  assertEqual(basuraPayload.total, 2, 'monitor basura payload drift');
  assertEqual(calls[13].url, 'https://api.example.test/monitor/api/monitor/card-dismissals', 'monitor dismissal URL drift');
  assertEqual(calls[13].options.method, 'POST', 'monitor dismissal must be an action POST');
  assertDeepEqual(JSON.parse(calls[13].options.body), {
    surface: 'monitor-card',
    target_context: 'ecuador',
    video_id: 'video-1',
    reason: 'operator-dismissed',
    dismissed_by: 'control-panel',
  }, 'monitor dismissal payload drift');
  assertDeepEqual(dismissPayload, { status: 'dismissed', context_key: 'monitor-card:ecuador:video-1' }, 'dismissal payload drift');

  let authMessage = '';
  try {
    await api.getJob('missing');
  } catch (error) {
    authMessage = error?.message || '';
  }
  if (!authMessage.includes('Autenticación')) throw new Error(`expected actionable auth error, got ${authMessage}`);
  if (authMessage.includes('secret-token')) throw new Error(`auth error leaked secret: ${authMessage}`);

  const unavailableApi = createRadarApiClient({
    getSettings: () => ({ transcriptServiceBaseUrl: 'https://radar.local/', transcriptServiceApiKey: 'secret-token' }),
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  let unavailableMessage = '';
  try {
    await unavailableApi.health();
  } catch (error) {
    unavailableMessage = error?.message || '';
  }
  if (!unavailableMessage.includes('Transcript Service no disponible')) {
    throw new Error(`expected actionable service unavailable error, got ${unavailableMessage}`);
  }

  const unavailableMonitorApi = createRadarApiClient({
    getSettings: () => ({ channelMonitorBaseUrl: 'https://monitor.local/', channelMonitorApiKey: 'monitor-secret' }),
    fetchImpl: async () => { throw new TypeError('fetch failed monitor-secret'); },
  });
  let unavailableMonitorMessage = '';
  try {
    await unavailableMonitorApi.monitorCards();
  } catch (error) {
    unavailableMonitorMessage = error?.message || '';
  }
  if (!unavailableMonitorMessage.includes('Channel Monitor no disponible')) {
    throw new Error(`expected actionable monitor unavailable error, got ${unavailableMonitorMessage}`);
  }
  if (unavailableMonitorMessage.includes('monitor-secret')) throw new Error(`monitor error leaked secret: ${unavailableMonitorMessage}`);

  const blockedCalls = [];
  const blockedApi = createRadarApiClient({
    getSettings: () => ({ transcriptServiceBaseUrl: 'http://127.0.0.1:8765' }),
    locationLike: { hostname: 'approval-panel-web.pages.dev' },
    fetchImpl: async (url) => { blockedCalls.push(url); return new Response('{}'); },
  });
  let blockedMessage = '';
  try {
    await blockedApi.health();
  } catch (error) {
    blockedMessage = error?.message || '';
  }
  if (!blockedMessage.includes('Configurá Transcript Service URL')) throw new Error(`expected local-in-remote guard message, got ${blockedMessage}`);
  assertEqual(blockedCalls.length, 0, 'local-in-remote Radar guard must not call fetch');
}

function runStateAndRenderCheck() {
  assertDeepEqual(parseRadarKeywords('Messi, Di María\nScaloni'), ['Messi', 'Di María', 'Scaloni'], 'keyword parsing drift');
  const payload = buildRadarJobPayload({
    url: ' https://youtu.be/abc ',
    countries: ['colombia', 'argentina', 'paraguay', 'uruguay', 'mexico'],
    extraKeywords: 'Messi, Di María',
  });
  assertDeepEqual(payload, {
    url: 'https://youtu.be/abc',
    countries: ['colombia', 'argentina', 'paraguay', 'uruguay', 'mexico'],
    extra_keywords: ['Messi', 'Di María'],
  }, 'job payload drift');

  let missingCountryMessage = '';
  try { buildRadarJobPayload({
    url: 'https://youtu.be/abc',
    countries: [],
  }); } catch (error) { missingCountryMessage = error.message; }
  if (!missingCountryMessage.includes('Elegí al menos un país')) throw new Error(`missing country validation drift: ${missingCountryMessage}`);

  const state = createRadarState();
  assertEqual(state.status, 'idle', 'initial state drift');
  assertEqual(state.history.length, 0, 'initial history drift');
  assertEqual(state.monitorStatus, 'idle', 'initial monitor status drift');
  assertDeepEqual(state.monitorCards, [], 'initial monitor cards drift');

  const summaryColumns = normalizeMonitorSummary({ items: [
    { label: 'Messi', count: 4 },
    { label: 'Argentina', count: 2 },
    { label: '<script>', count: 1 },
    { label: 'Overflow', count: 99 },
  ] });
  assertDeepEqual(summaryColumns, [
    { label: 'Messi', count: 4, status: 'ready' },
    { label: 'Argentina', count: 2, status: 'ready' },
    { label: '<script>', count: 1, status: 'ready' },
    { label: 'Overflow', count: 99, status: 'ready' },
  ], 'summary column normalization drift');
  assertDeepEqual(filterMonitorCards([
    { video_id: 'a', country: 'argentina' },
    { video_id: 'e', country: 'ecuador' },
    { video_id: 'm', country: 'méxico' },
  ], 'argentina'), [{ video_id: 'a', country: 'argentina' }], 'country filter drift');
  assertDeepEqual(filterMonitorCards([
    { video_id: 'important-source', target_country: 'important' },
    { video_id: 'mx-country', target_country: 'mexico' },
  ], 'important'), [{ video_id: 'important-source', target_country: 'important' }], 'important filter should not replace real country filtering');

  const searchableCards = [
    { video_id: 'mundo-old', title: 'Análisis táctico', target_country: 'ecuador', channel_label: 'Mundo Maldini', published_at: '2026-05-20T12:00:00Z', channel_priority_rank: 11 },
    { video_id: 'normal-new', title: 'Ecuador gana', target_country: 'ecuador', channel_label: 'Normal TV', published_at: '2026-05-22T12:00:00Z' },
    { video_id: 'accent-topic', title: 'Mexico previo', target_country: 'mexico', channel_label: 'Canal MX', topic: 'Selección Sub 20', published_at: '2026-05-21T12:00:00Z' },
  ];
  assertDeepEqual(
    getVisibleMonitorCards(searchableCards, { country: 'ecuador', query: 'mundo maldini', sortMode: 'relevance' }).map((card) => card.video_id),
    ['mundo-old'],
    'monitor search should match channel/source names together with country filter',
  );
  assertDeepEqual(
    getVisibleMonitorCards(searchableCards, { query: 'seleccion', sortMode: 'relevance' }).map((card) => card.video_id),
    ['accent-topic'],
    'monitor search should be accent-insensitive across title/topic text',
  );
  assertDeepEqual(
    getVisibleMonitorCards([
      { video_id: 'normal-new', title: 'Normal new', channel_label: 'Normal TV', published_at: '2026-05-23T12:00:00Z' },
      { video_id: 'priority-old', title: 'Priority old', channel_label: 'Mundo Maldini', channel_priority_rank: 11, published_at: '2026-05-20T12:00:00Z' },
      { video_id: 'priority-new', title: 'Priority new', channel_label: 'NSports', channel_priority_rank: 1, published_at: '2026-05-22T12:00:00Z' },
      { video_id: 'normal-invalid', title: 'Normal invalid', channel_label: 'Normal TV', published_at: 'not-a-date' },
    ], { sortMode: 'recent' }).map((card) => card.video_id),
    ['normal-new', 'priority-new', 'priority-old', 'normal-invalid'],
    'recent sort should be pure date desc with invalid dates last',
  );
  assertDeepEqual(
    getVisibleMonitorCards([
      { video_id: 'first-tie', channel_priority_rank: 5, published_at: '2026-05-22T12:00:00Z' },
      { video_id: 'second-tie', channel_priority_rank: 3, published_at: '2026-05-22T12:00:00Z' },
    ], { sortMode: 'recent' }).map((card) => card.video_id),
    ['first-tie', 'second-tie'],
    'recent sort date ties should preserve existing relevance order',
  );
  assertDeepEqual(
    getVisibleMonitorCards([
      { video_id: 'fallback-created', published_at: 'invalid-date', created_at: '2026-05-24T12:00:00Z' },
      { video_id: 'published-valid', published_at: '2026-05-23T12:00:00Z', created_at: '2026-05-25T12:00:00Z' },
    ], { sortMode: 'recent' }).map((card) => card.video_id),
    ['fallback-created', 'published-valid'],
    'recent sort should fall back to created_at when published_at is invalid',
  );
  assertDeepEqual(
    getVisibleMonitorCards([
      { video_id: 'priority-older', channel_label: 'Mundo Maldini', channel_priority_rank: 1, published_at: '2026-05-21T12:00:00Z' },
      { video_id: 'normal-newer', channel_label: 'Normal TV', published_at: '2026-05-23T12:00:00Z' },
    ], { sortMode: 'recent' }).map((card) => card.video_id),
    ['normal-newer', 'priority-older'],
    'recent sort must not boost priority channels above more-recent normal channels',
  );

  const pendingMexicoCard = mapMonitorCard({ video_id: 'mx-1', country: 'México' }, []);
  assertDeepEqual(pendingMexicoCard.mentionCounts, [
    { label: 'Giménez', count: '—', status: 'pending' },
    { label: 'Ochoa', count: '—', status: 'pending' },
    { label: 'Edson Álvarez', count: '—', status: 'pending' },
    { label: 'México', count: '—', status: 'pending' },
  ], 'country famous-player pending mentions drift');

  const lifecycleTranscribedMexicoCard = mapMonitorCard({ video_id: 'mx-life', country: 'mexico', lifecycle: 'transcrito' }, []);
  assertDeepEqual(lifecycleTranscribedMexicoCard.mentionCounts, [], 'lifecycle transcrito cards should not fake pending dashboard dashes');

  const ecuadorDashboardCard = mapMonitorCard({ video_id: 'ec-1', country: 'ecuador' }, [
    { label: 'Pacho', count: 12, status: 'ready' },
    { label: 'Caicedo', count: 13, status: 'ready' },
    { label: 'Ecuador', count: 20, status: 'ready' },
  ]);
  assertDeepEqual(ecuadorDashboardCard.mentionCounts, [
    { label: 'Caicedo', count: 13, status: 'ready' },
    { label: 'Pacho', count: 12, status: 'ready' },
    { label: 'Hincapié', count: '—', status: 'pending' },
    { label: 'Ecuador', count: 20, status: 'ready' },
  ], 'country dashboard mentions should keep concrete player/country labels');

  const transcribedMexicoCard = mapMonitorCard({ video_id: 'mx-2', country: 'mexico', status: 'transcrito' }, [
    { label: 'México', count: 7, status: 'ready' },
  ]);
  assertDeepEqual(transcribedMexicoCard.mentionCounts, [
    { label: 'México', count: 7, status: 'ready' },
  ], 'transcribed cards should show backend mention counts without pending dashboard dashes');

  const transcribedEmptyMexicoCard = mapMonitorCard({ video_id: 'mx-3', country: 'mexico', status: 'transcrito' }, []);
  assertDeepEqual(transcribedEmptyMexicoCard.mentionCounts, [], 'transcribed cards without backend mentions should not fake pending dashboard dashes');

  const importantPendingCard = mapMonitorCard({ video_id: 'imp-1', target_country: 'important', target_country_label: 'IMPORTANTES', status: 'enqueued' }, []);
  assertDeepEqual(importantPendingCard.mentionCounts, [], 'important view should not render fake country mention dashboards');

  const queueEl = makeElement();
  renderRadarResults({ el: { radarQueueList: queueEl }, state: { currentJob: { job_id: 'job-1', title: 'Video uno', status: 'running', selected_countries: ['argentina'] } } });
  if (!queueEl.innerHTML.includes('Video uno') || !queueEl.innerHTML.includes('Cancelar')) throw new Error(`queue render drift: ${queueEl.innerHTML}`);

  const historyEl = makeElement();
  renderRadarHistory({ el: { radarHistoryList: historyEl }, history: [{ job_id: 'job-1', status: 'succeeded', title: 'Final', selected_countries: ['argentina'], detected_language: 'fr', mention_count: 2, artifacts: { export_txt: true } }] });
  if (!historyEl.innerHTML.includes('Final') || !historyEl.innerHTML.includes('fr') || !historyEl.innerHTML.includes('Descargar TXT')) {
    throw new Error(`history render drift: ${historyEl.innerHTML}`);
  }

  const monitorEl = makeElement();
  const monitorStatusEl = makeElement();
  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'video-1',
        title: '<b>Final peligrosa</b>',
        country: 'argentina',
        channel_label: 'TyC',
        published_at: '2026-05-21T12:00:00Z',
        lifecycle: 'IGNORED_SEEN',
        url: 'https://youtu.be/video-1',
        mentionCounts: [{ label: 'Messi', count: 3, status: 'ready' }],
      }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('&lt;b&gt;Final peligrosa&lt;/b&gt;')) throw new Error(`monitor title should be escaped: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('Destino: Argentina · Canal: TyC · Subido 21 may 2026, 07:00 ECT')) throw new Error(`monitor metadata drift: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('Ya visto · descartado')) throw new Error(`monitor lifecycle label drift: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('data-radar-action="dismiss-monitor-card"') || !monitorEl.innerHTML.includes('aria-label="Ocultar card solo en Argentina"')) throw new Error(`monitor dismiss button should be accessible and context-scoped: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('data-radar-dismiss-surface="monitor-card"') || !monitorEl.innerHTML.includes('data-radar-dismiss-target-context="argentina"') || !monitorEl.innerHTML.includes('data-radar-dismiss-video-id="video-1"')) throw new Error(`monitor dismiss payload attrs drift: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('data-radar-action="open-link"') || !monitorEl.innerHTML.includes('https://youtu.be/video-1')) throw new Error(`monitor link action drift: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('data-radar-action="download-monitor-transcript"') || !monitorEl.innerHTML.includes('disabled')) throw new Error(`pending monitor transcript action should be disabled: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('Menciones:') || !monitorEl.innerHTML.includes('Messi:') || !monitorEl.innerHTML.includes('Argentina:') || !monitorEl.innerHTML.includes('3')) throw new Error(`monitor mentions drift: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'imp-queued', title: 'Importante', target_country: 'important', target_country_label: 'IMPORTANTES', status: 'enqueued' }],
      selectedCountry: 'important',
    },
  });
  if (!monitorEl.innerHTML.includes('En cola prioritaria de transcripción')) throw new Error(`important lifecycle label should be humanized: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('aria-label="Ocultar card solo en IMPORTANTES"') || !monitorEl.innerHTML.includes('data-radar-dismiss-target-context="important"')) throw new Error(`important dismiss should be scoped to important context: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'fallback-time', title: 'Fallback time', country: 'ecuador', uploaded_at: '2026-05-21T05:30:00Z' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('Subido 21 may 2026, 00:30 ECT')) throw new Error(`fallback uploaded_at should use Ecuador time: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('aria-label="Ocultar card solo en Ecuador"') || !monitorEl.innerHTML.includes('data-radar-dismiss-target-context="ecuador"')) throw new Error(`todos view should keep card country dismissal context: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'approved-video', title: 'Aprobado', country: 'ecuador', status: 'aprobado' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('APROBADO') || !monitorEl.innerHTML.includes('is-info')) throw new Error(`approved status chip drift: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'editor-approved-video', title: 'Aprobado editorial', country: 'ecuador', status: 'aprobado', display_status: 'VISTO EDITORIAL', approval_source: 'manual_review' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('VISTO EDITORIAL') || !monitorEl.innerHTML.includes('is-info')) throw new Error(`editorial approved status chip drift: ${monitorEl.innerHTML}`);
  if (monitorEl.innerHTML.includes('TRANSCRIPCIÓN" disabled') && monitorEl.innerHTML.includes('data-radar-action="open-link" disabled')) throw new Error(`editorial approved card should keep approved interactions functional: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'transcribing-video', title: 'Transcribiendo', country: 'ecuador', status: 'transcribiendo', radar_job_id: 'radar-transcribing' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('TRANSCRIBIENDO') || !monitorEl.innerHTML.includes('is-warning')) throw new Error(`transcribing status chip drift: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'geo-video', title: 'Geo bloqueado', country: 'ecuador', status: 'geo_blocked', last_error: 'yt_dlp_geo_blocked' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('GEO-BLOQUEADO') || !monitorEl.innerHTML.includes('is-failed') || monitorEl.innerHTML.includes('>ERROR<')) throw new Error(`geo-blocked status chip drift: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{ video_id: 'legacy-geo-video', title: 'Geo bloqueado legacy', country: 'ecuador', status: 'error', last_error: 'yt_dlp_geo_blocked' }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('GEO-BLOQUEADO') || monitorEl.innerHTML.includes('>ERROR<')) throw new Error(`legacy geo-blocked last_error should not render generic error: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'important-program',
        title: 'Fútbol Picante',
        target_country: 'important',
        target_country_label: 'IMPORTANTES',
        source_country: 'mexico',
        source_country_label: 'México',
        channel_label: 'ESPN MX',
        status: 'geo_blocked',
        display_status: 'GEO-BLOQUEADO',
        important: true,
        important_reason: 'important_program_match',
        important_rule: { op: 'contains', value: 'FUTBOL PICANTE' },
      }],
      selectedCountry: 'important',
    },
  });
  if (!monitorEl.innerHTML.includes('GEO-BLOQUEADO') || !monitorEl.innerHTML.includes('Destino: IMPORTANTES · Fuente: México · Canal: ESPN MX')) throw new Error(`important card should render backend status and labels: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('IMPORTANTE: coincidencia de programa · contains: FUTBOL PICANTE')) throw new Error(`important card should render backend reason/rule: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'transcribed-video',
        title: 'Transcrito',
        country: 'mexico',
        status: 'transcrito',
        radar_job_id: 'radar-transcribed',
        mentionCounts: [{ label: 'México', count: 7, status: 'ready' }],
      }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('TRANSCRITO') || !monitorEl.innerHTML.includes('is-success')) throw new Error(`transcribed status chip drift: ${monitorEl.innerHTML}`);
  if (monitorEl.innerHTML.includes('disabled') || monitorEl.innerHTML.includes('Giménez:') || monitorEl.innerHTML.includes('—')) throw new Error(`transcribed card should enable transcript and show real counts only: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'transcribed-empty-video',
        title: 'Transcrito sin menciones',
        country: 'mexico',
        status: 'transcrito',
        radar_job_id: 'radar-transcribed-empty',
        mentionCounts: [],
      }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('TRANSCRITO') || !monitorEl.innerHTML.includes('Transcripción')) throw new Error(`transcribed empty card should still expose transcript action: ${monitorEl.innerHTML}`);
  if (monitorEl.innerHTML.includes('Giménez:') || monitorEl.innerHTML.includes('—')) throw new Error(`transcribed empty card should not render fake pending mention rows: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'unsafe-url-video',
        title: 'Unsafe URL',
        country: 'ecuador',
        status: 'aprobado',
        url: 'javascript:alert(1)',
      }],
      selectedCountry: '',
    },
  });
  if (monitorEl.innerHTML.includes('javascript:alert') || !monitorEl.innerHTML.includes('https://www.youtube.com/watch?v=unsafe-url-video')) throw new Error(`unsafe monitor URL should be replaced by safe YouTube fallback: ${monitorEl.innerHTML}`);

  renderRadarMonitor({
    el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl },
    state: {
      monitorStatus: 'ready',
      monitorCards: [{
        video_id: 'video-without-radar-job',
        title: 'Sin job Radar todavía',
        country: 'ecuador',
        channel_label: 'Ecuador TV',
        mentionCounts: [],
      }],
      selectedCountry: '',
    },
  });
  if (!monitorEl.innerHTML.includes('video-without-radar-job')) throw new Error(`missing-linkage card should stay visible: ${monitorEl.innerHTML}`);
  if (!monitorEl.innerHTML.includes('Caicedo:') || !monitorEl.innerHTML.includes('Ecuador:') || !monitorEl.innerHTML.includes('—')) throw new Error(`missing-linkage card should render concrete pending mention rows: ${monitorEl.innerHTML}`);

  renderRadarMonitor({ el: { radarMonitorList: monitorEl, radarMonitorStatus: monitorStatusEl }, state: { monitorStatus: 'error', monitorError: 'Monitor caído', monitorCards: [] } });
  if (!monitorEl.innerHTML.includes('Monitor caído')) throw new Error(`monitor error drift: ${monitorEl.innerHTML}`);
}

async function runControllerCheck() {
  const calls = [];
  const copied = [];
  const downloads = [];
  const opened = [];
  const state = createRadarState();
  const el = {
    radarUrlInput: makeElement({ value: 'https://youtu.be/abc' }),
    radarCountryColombia: { checked: false },
    radarCountryEcuador: { checked: false },
    radarCountryArgentina: { checked: true },
    radarCountryParaguay: { checked: true },
    radarCountryUruguay: { checked: false },
    radarCountryMexico: { checked: false },
    radarExtraKeywordsInput: makeElement({ value: 'Messi' }),
    radarSubmitBtn: makeElement(),
    radarHealthStatus: makeElement(),
    radarProgressStatus: makeElement(),
    radarQueueList: makeElement(),
    radarMonitorStatus: makeElement(),
    radarMonitorList: makeElement(),
    radarCountryBar: makeElement(),
    radarMonitorRefreshBtn: makeElement(),
    radarMonitorSearchInput: makeElement(),
    radarMonitorSortSelect: makeElement({ value: 'relevance' }),
    radarNewJobDialog: { showModal() { calls.push('showModal'); }, close() { calls.push('closeModal'); } },
    radarSummaryDialog: { showModal() { calls.push('summaryModal'); }, close() {} },
    radarSummaryBody: makeElement(),
    radarConfirmDialog: {
      open: false,
      listeners: new Map(),
      addEventListener(type, handler) { this.listeners.set(type, handler); },
      showModal() { this.open = true; calls.push('confirmModal'); },
      close() { this.open = false; },
    },
    radarConfirmTitle: makeElement(),
    radarConfirmMessage: makeElement(),
    radarConfirmAcceptBtn: makeElement(),
    radarConfirmCancelBtn: makeElement(),
    radarHistoryList: makeElement(),
  };
  const api = {
    async health() { calls.push('health'); return { status: 'ok' }; },
    async monitorCards(targetCountry = '', page = {}) { calls.push(targetCountry ? { type: 'monitorCards', targetCountry, page } : { type: 'monitorCards', page }); return { status: 'ok', items: [{ video_id: 'video-1', title: 'Final', country: 'argentina', channel_label: 'TyC', radar_job_id: 'job-1' }], pagination: { limit: page.limit, offset: page.offset, total: 1, has_more: false } }; },
    async monitorSummary() { calls.push('monitorSummary'); return { basura_count: 1, targets: [] }; },
    async monitorBasura(page = {}) { calls.push({ type: 'monitorBasura', page }); return { total: 1, items: [{ video_id: 'trash-1', title: 'Trash' }], pagination: { limit: page.limit, offset: page.offset, total: 1, has_more: false } }; },
    async createJob(payload) { calls.push({ type: 'create', payload }); return { job_id: 'job-1', status: 'queued' }; },
    async getJob(jobId) { calls.push({ type: 'getJob', jobId }); return { job_id: jobId, status: 'succeeded', progress: { percent: 100 } }; },
    async getSummary(jobId) { calls.push({ type: 'summary', jobId }); return { items: [{ label: 'Argentina', count: 1, timestamps: ['00:12'] }] }; },
    async downloadExportText(jobId) { calls.push({ type: 'download', jobId }); return 'TXT backend'; },
    async cancelJob(jobId) { calls.push({ type: 'cancel', jobId }); return { status: 'cancelled' }; },
    async deleteJob(jobId) { calls.push({ type: 'delete', jobId }); return { status: 'deleted' }; },
    async dismissCard(payload) { calls.push({ type: 'dismissCard', payload }); return { status: 'dismissed', context_key: `${payload.surface}:${payload.targetContext}:${payload.videoId}` }; },
    async history() { calls.push('history'); return { items: [{ job_id: 'job-1', status: 'succeeded', title: 'Final', selected_countries: ['argentina'], detected_language: 'fr', mention_count: 1, artifacts: { export_txt: true } }] }; },
  };

  const controller = createRadarController({
    state,
    el,
    api,
    ui: { toast() {} },
    browser: {
      setTimeout(callback) { callback(); return 1; },
      clearTimeout() {},
      clipboard: { async writeText(value) { copied.push(value); } },
      document: {
        body: { appendChild(link) { downloads.push({ type: 'append', link }); } },
        createElement(tagName) {
          if (tagName !== 'a') throw new Error(`unexpected download element: ${tagName}`);
          return {
            href: '',
            download: '',
            rel: '',
            click() { downloads.push({ type: 'click', href: this.href, download: this.download, rel: this.rel }); },
            remove() { downloads.push({ type: 'remove' }); },
          };
        },
      },
      URL: {
        createObjectURL(blob) {
          downloads.push({ type: 'blob', blob });
          return 'blob:radar-export';
        },
        revokeObjectURL(href) { downloads.push({ type: 'revoke', href }); },
      },
      window: { open(url, target, features) { opened.push({ url, target, features }); } },
    },
  });

  controller.bindEvents();
  await controller.refreshHealth();
  await controller.refreshMonitor();
  el.radarMonitorSearchInput.value = 'tyc';
  el.radarMonitorSearchInput.listeners.get('input')?.({ target: el.radarMonitorSearchInput });
  if (!el.radarMonitorList.innerHTML.includes('Final')) throw new Error(`search input should keep matching channel cards visible: ${el.radarMonitorList.innerHTML}`);
  el.radarMonitorSortSelect.value = 'recent';
  el.radarMonitorSortSelect.listeners.get('change')?.({ target: el.radarMonitorSortSelect });
  assertEqual(state.monitorSortMode, 'recent', 'sort select should update monitor sort mode');
  state.selectedCountry = 'important';
  await controller.refreshMonitor();
  state.selectedCountry = '';
  await controller.submitCurrentJob();
  await controller.showSummary('job-1');
  await controller.downloadJob('job-1');
  controller.openMonitorLink('https://youtu.be/video-1');
  controller.openMonitorLink('javascript:alert(1)');
  if (!el.radarProgressStatus.textContent.includes('Completado')) throw new Error(`progress status drift before cancel: ${el.radarProgressStatus.textContent}`);
  await controller.confirmJobAction('job-1', 'delete');
  await controller.confirmJobAction('job-1', 'cancel');
  await el.radarConfirmAcceptBtn.onclick();
  const dismissButton = makeElement();
  await controller.confirmMonitorCardDismiss({
    videoId: 'video-1',
    targetContext: 'ecuador',
    targetLabel: 'Ecuador',
    trigger: dismissButton,
  });
  el.radarConfirmDialog.listeners.get('cancel')?.({ preventDefault() { calls.push('cancelPrevented'); } });
  assertEqual(el.radarConfirmDialog.open, false, 'Escape/cancel event should close dismiss confirmation');
  assertEqual(dismissButton.focusCalls, 1, 'Escape/cancel event should restore focus to dismiss trigger');
  if (calls.some((entry) => entry.type === 'dismissCard')) throw new Error(`Escape/cancel event must not persist dismissal: ${JSON.stringify(calls)}`);
  await controller.confirmMonitorCardDismiss({
    videoId: 'video-1',
    targetContext: 'ecuador',
    targetLabel: 'Ecuador',
    trigger: dismissButton,
  });
  el.radarConfirmCancelBtn.onclick?.();
  if (calls.some((entry) => entry.type === 'dismissCard')) throw new Error(`cancel must not persist dismissal: ${JSON.stringify(calls)}`);
  await controller.confirmMonitorCardDismiss({
    videoId: 'video-1',
    targetContext: 'ecuador',
    targetLabel: 'Ecuador',
    trigger: dismissButton,
  });
  if (!el.radarConfirmTitle.textContent.includes('¿Estás seguro?')) throw new Error(`dismiss confirm title drift: ${el.radarConfirmTitle.textContent}`);
  for (const expected of ['no volverá a mostrarse en Ecuador', 'No se borra el video', 'transcripción']) {
    if (!el.radarConfirmMessage.textContent.includes(expected)) throw new Error(`dismiss confirm copy missing ${expected}: ${el.radarConfirmMessage.textContent}`);
  }
  await el.radarConfirmAcceptBtn.onclick();

  assertEqual(calls[0], 'health', 'health call drift');
  assertDeepEqual(calls[1], { type: 'monitorCards', page: { limit: 200, offset: 0 } }, 'monitor refresh should read paged cards');
  assertEqual(calls[2], 'monitorSummary', 'monitor refresh should read summary counters');
  assertDeepEqual(calls[3], { type: 'monitorCards', targetCountry: 'important', page: { limit: 200, offset: 0 } }, 'important monitor refresh should request paged important API view');
  assertEqual(calls[4], 'monitorSummary', 'important monitor refresh should keep summary counters');
  assertEqual(calls[5].type, 'create', 'submit should create a service job');
  assertEqual(calls[5].payload.countries[0], 'argentina', 'controller countries payload drift');
  assertEqual(calls[5].payload.countries[1], 'paraguay', 'controller expanded countries payload drift');
  if (!calls.some((entry) => entry.type === 'getJob')) throw new Error('controller should poll job detail');
  if (!calls.some((entry) => entry.type === 'summary')) throw new Error('controller should fetch backend summary');
  if (!calls.some((entry) => entry.type === 'download')) throw new Error('controller should request backend TXT download');
  if (!downloads.some((entry) => entry.type === 'click' && entry.href === 'blob:radar-export' && entry.download === 'job-1.txt')) {
    throw new Error(`controller should trigger browser TXT download: ${JSON.stringify(downloads)}`);
  }
  if (!downloads.some((entry) => entry.type === 'revoke' && entry.href === 'blob:radar-export')) {
    throw new Error(`controller should revoke TXT download URL: ${JSON.stringify(downloads)}`);
  }
  assertDeepEqual(opened, [{ url: 'https://youtu.be/video-1', target: '_blank', features: 'noopener,noreferrer' }], 'monitor link should open independently of status');
  if (!calls.some((entry) => entry.type === 'cancel')) throw new Error('controller should confirm before cancelling');
  if (calls.some((entry) => entry.type === 'delete')) throw new Error('confirm accept handler should replace stale actions');
  assertDeepEqual(calls.find((entry) => entry.type === 'dismissCard')?.payload, {
    surface: 'monitor-card',
    targetContext: 'ecuador',
    videoId: 'video-1',
  }, 'controller dismissal payload drift');
  const dismissIndex = calls.findIndex((entry) => entry.type === 'dismissCard');
  if (dismissIndex < 0 || !calls.slice(dismissIndex + 1).some((entry) => entry.type === 'monitorCards' && !entry.targetCountry)) throw new Error(`dismissal should refresh current monitor list/counts: ${JSON.stringify(calls)}`);
  assertEqual(dismissButton.focusCalls, 3, 'dismiss confirmation should restore focus to trigger on Escape, cancel, and confirm');
  if (!el.radarProgressStatus.textContent.includes('Listo para investigar')) throw new Error(`progress status drift after cancel: ${el.radarProgressStatus.textContent}`);
  if (!calls.includes('closeModal')) throw new Error(`submit should close the new-job modal after creating a job: ${JSON.stringify(calls)}`);
  if (!calls.includes('history')) throw new Error(`submit should refresh visible history after completed polling: ${JSON.stringify(calls)}`);
}

async function runControllerMonitorFallbackCheck() {
  const calls = [];
  const state = createRadarState();
  const el = {
    radarHealthStatus: makeElement(),
    radarProgressStatus: makeElement(),
    radarQueueList: makeElement(),
    radarMonitorStatus: makeElement(),
    radarMonitorList: makeElement(),
    radarHistoryList: makeElement(),
  };
  const controller = createRadarController({
    state,
    el,
    api: {
      async monitorCards(_targetCountry = '', page = {}) {
        calls.push({ type: 'monitorCards', page });
        return { items: [
          { video_id: 'without-radar-link', title: 'No Radar link', country: 'argentina', channel_label: 'TyC' },
          { video_id: 'summary-failed', title: 'Summary failed', country: 'ecuador', channel_label: 'Ecuador TV', radar_job_id: 'job-failed-summary' },
        ], pagination: { limit: page.limit, offset: page.offset, total: 2, has_more: false } };
      },
      async getSummary(jobId) {
        calls.push({ type: 'summary', jobId });
        throw new Error('summary backend down');
      },
    },
    ui: { toast() {} },
  });

  await controller.refreshMonitor();

  assertDeepEqual(calls[0], { type: 'monitorCards', page: { limit: 200, offset: 0 } }, 'monitor fallback check should read paged monitor cards first');
  assertDeepEqual(calls.filter((entry) => entry?.type === 'summary'), [], 'monitor cards should not fetch per-card Transcript summaries');
  assertDeepEqual(state.monitorCards[0].mentionCounts, [
    { label: 'Messi', count: '—', status: 'pending' },
    { label: 'Álvarez', count: '—', status: 'pending' },
    { label: 'Di María', count: '—', status: 'pending' },
    { label: 'Argentina', count: '—', status: 'pending' },
  ], 'unlinked card should show famous-player pending mentions');
  assertDeepEqual(state.monitorCards[1].mentionCounts, [
    { label: 'Caicedo', count: '—', status: 'pending' },
    { label: 'Pacho', count: '—', status: 'pending' },
    { label: 'Hincapié', count: '—', status: 'pending' },
    { label: 'Ecuador', count: '—', status: 'pending' },
  ], 'failed summary fallback should keep concrete country dashboard labels');
  if (!el.radarMonitorList.innerHTML.includes('without-radar-link')) throw new Error(`unlinked monitor card disappeared: ${el.radarMonitorList.innerHTML}`);
  if (!el.radarMonitorList.innerHTML.includes('Summary failed')) throw new Error(`failed-summary monitor card disappeared: ${el.radarMonitorList.innerHTML}`);
  if (!el.radarMonitorList.innerHTML.includes('Ecuador:')) throw new Error(`failed-summary card should render country dashboard fallback: ${el.radarMonitorList.innerHTML}`);
}

function runControllerRemoteGuardCheck() {
  const calls = [];
  const state = createRadarState();
  const el = {
    radarHealthStatus: makeElement(),
    radarProgressStatus: makeElement(),
    radarQueueList: makeElement(),
    radarMonitorList: makeElement(),
    radarMonitorStatus: makeElement(),
    radarHistoryList: makeElement(),
  };
  const controller = createRadarController({
    state,
    el,
    api: {
      isBlockedByRemoteContext: () => true,
      getRemoteLocalServiceMessage: () => 'Configurá Transcript Service URL en settings',
      async health() { calls.push('health'); },
      async history() { calls.push('history'); },
    },
  });

  const canRefresh = controller.activate();
  assertEqual(canRefresh, false, 'remote local Radar activation should block automatic refreshes');
  assertEqual(calls.length, 0, 'remote local Radar activation should not call API methods');
  if (!el.radarProgressStatus.textContent.includes('Configurá Transcript Service URL')) {
    throw new Error(`expected actionable remote guard status, got ${el.radarProgressStatus.textContent}`);
  }
}

export async function runRadarPanelCheck() {
  await runApiClientCheck();
  runStateAndRenderCheck();
  await runControllerCheck();
  await runControllerMonitorFallbackCheck();
  runControllerRemoteGuardCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  runRadarPanelCheck()
    .then(() => console.log('radar-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

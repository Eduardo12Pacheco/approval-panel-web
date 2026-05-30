import { fileURLToPath } from 'node:url';
import { createAiRescueApiClient } from '../api-client.js';
import { createAiRescueController } from '../controller.js';
import {
  renderAiRescueCandidates,
  renderAiRescueDetail,
  renderAiRescueQueue,
  renderAiRescueRejections,
} from '../render.js';
import {
  AI_RESCUE_COUNTRY_TABS,
  createAiRescueState,
  getAiRescueVisibleCandidates,
  normalizeAiRescueCandidate,
  normalizeAiRescueQueue,
  normalizeAiRescueRejection,
} from '../state.js';
import { normalizeShellView } from '../../../app-shell/navigation.js';

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

function assertIncludes(value, expected, message) {
  if (!value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(value, expected, message) {
  if (value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} not to include ${JSON.stringify(expected)}`);
  }
}

function countOccurrences(value, expected) {
  return value.split(expected).length - 1;
}

function makeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, force) { force ? values.add(value) : values.delete(value); },
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
    open: false,
    dataset: {},
    classList: makeClassList(),
    listeners: new Map(),
    onclick: null,
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    focus() { this.focused = true; },
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
}

const sampleCandidates = [
  {
    id: 2,
    video_id: 'v-high',
    title: '<b>Final de crack</b>',
    target_country: 'argentina',
    target_country_label: 'Argentina',
    source_country: 'ecuador',
    source_country_label: 'Ecuador',
    score: 91,
    summary_es: 'Gran actuación en el segundo tiempo.',
    angle_es: 'Enfoque editorial sugerido.',
    risk: 'low',
    risks: ['Sin riesgo fuerte'],
    url: 'https://youtu.be/v-high',
    published_at: '2026-05-22T10:30:00Z',
    evidence_count: 2,
  },
  {
    id: 1,
    video_id: 'v-low',
    title: 'Promesa colombiana',
    target_country: 'colombia',
    target_country_label: 'Colombia',
    source_country: 'ecuador',
    source_country_label: 'Ecuador',
    score: 54,
    summary_es: 'Elogio suave para calibración.',
    angle_es: 'Ángulo menor.',
    risk: 'medium',
    risks: ['Evidencia débil'],
    submitted_at: '2026-05-22T05:30:00Z',
    evidence_count: 1,
  },
];

function runStateCheck() {
  assertEqual(normalizeShellView('ai-rescue'), 'ai-rescue', 'AI Rescue must be a top-level shell view');
  assertDeepEqual(AI_RESCUE_COUNTRY_TABS.map((tab) => tab.value), [
    'ecuador', 'colombia', 'argentina', 'uruguay', 'paraguay', 'mexico', 'rejected',
  ], 'AI Rescue tab order drift');

  const state = createAiRescueState();
  assertEqual(state.status, 'idle', 'initial status drift');
  assertEqual(state.selectedTab, 'ecuador', 'initial selected tab drift');
  assertDeepEqual(state.candidates, [], 'initial candidate list drift');

  const normalized = normalizeAiRescueCandidate({ ...sampleCandidates[0], score: '91' });
  assertEqual(normalized.score, 91, 'candidate score should normalize to number');
  assertEqual(normalized.targetLabel, 'Argentina', 'candidate target label drift');
  assertEqual(normalized.sourceLabel, 'Ecuador', 'candidate source label drift');

  const sorted = getAiRescueVisibleCandidates({ candidates: sampleCandidates, selectedTab: '' });
  assertDeepEqual(sorted.map((item) => item.id), [2, 1], 'candidate order must preserve descending score');
  const argentinaOnly = getAiRescueVisibleCandidates({ candidates: sampleCandidates, selectedTab: 'argentina' });
  assertDeepEqual(argentinaOnly.map((item) => item.id), [2], 'country filter drift');

  const queue = normalizeAiRescueQueue({
    current: { video_id: 'now', status: 'processing', source_country_label: 'Ecuador' },
    upcoming: [{ video_id: 'retry', status: 'retry', attempt_count: 2, next_attempt_at: '2026-05-22T12:00:00Z' }],
    counts: { waiting: 3, retry: 1 },
  });
  assertEqual(queue.current.videoId, 'now', 'current queue normalization drift');
  assertEqual(queue.upcoming[0].statusLabel, 'Reintento', 'retry queue label drift');
  assertEqual(queue.counts.retry, 1, 'queue counts drift');

  const rejection = normalizeAiRescueRejection({
    id: 8,
    video_id: 'abc123',
    source: 'human',
    reason: 'weak-evidence',
    created_at: '2026-05-22T13:00:00Z',
    details: { explanation_es: 'Explicación editorial en español', note: 'No alcanza' },
    target_country_label: 'México',
  });
  assertEqual(rejection.sourceLabel, 'Humano', 'human rejection source label drift');
  assertEqual(rejection.detailText, 'Explicación editorial en español', 'rejection detail text should prefer explanation_es');
  assertEqual(rejection.url, 'https://www.youtube.com/watch?v=abc123', 'rejection should generate a safe YouTube URL from video id');
  assertEqual(rejection.createdAt, '2026-05-22T13:00:00Z', 'rejection created_at normalization drift');

  const rawOnlyRejection = normalizeAiRescueRejection({
    id: 9,
    reason: 'analysis-error',
    details: { raw: { leaked: true } },
  });
  assertEqual(rawOnlyRejection.detailText, '', 'rejection details must not stringify raw JSON objects');
}

function runRenderCheck() {
  const listEl = makeElement();
  const tabsEl = makeElement();
  const statusEl = makeElement();
  renderAiRescueCandidates({
    el: { aiRescueTabs: tabsEl, aiRescueList: listEl, aiRescueStatus: statusEl },
    state: { status: 'ready', selectedTab: '', candidates: sampleCandidates, rejections: [] },
  });
  assertIncludes(tabsEl.innerHTML, 'Rechazados IA', 'tabs should include rejected view');
  assertIncludes(listEl.innerHTML, 'Score 91', 'card should show visible score');
  assertIncludes(listEl.innerHTML, '&lt;b&gt;Final de crack&lt;/b&gt;', 'card title must be escaped');
  assertIncludes(listEl.innerHTML, 'Destino: Argentina · Fuente excluida: Ecuador', 'card metadata should show target and excluded source');
  assertIncludes(listEl.innerHTML, '22 may 2026, 05:30 ECT', 'candidate published time should render in Ecuador local time');
  assertIncludes(listEl.innerHTML, '22 may 2026, 00:30 ECT', 'candidate submitted fallback time should render in Ecuador local time');
  assertIncludes(listEl.innerHTML, 'aria-label="Ocultar candidato Prensa IA para Argentina"', 'dismiss button should have accessible candidate-context label');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-action="dismiss-candidate"', 'candidate dismiss action should be present');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-dismiss-surface="ai-rescue-candidate"', 'candidate dismiss surface should be explicit');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-dismiss-target-context="argentina"', 'candidate dismiss target context should be explicit');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-dismiss-video-id="v-high"', 'candidate dismiss video id should be explicit');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-dismiss-candidate-id="2"', 'candidate dismiss candidate id should be explicit');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-action="open-link"', 'card link action drift');
  assertIncludes(listEl.innerHTML, 'data-ai-rescue-action="summary"', 'summary action should be present');
  assertNotIncludes(listEl.innerHTML, 'data-ai-rescue-action="summary" disabled', 'summary action must stay enabled for candidate tabs');
  if (listEl.innerHTML.indexOf('Score 91') > listEl.innerHTML.indexOf('Score 54')) {
    throw new Error(`candidate cards are not rendered by descending score: ${listEl.innerHTML}`);
  }

  const rejectedEl = makeElement();
  renderAiRescueRejections({
    el: { aiRescueList: rejectedEl },
    rejections: [
      { id: 1, video_id: 'vid-777', source: 'ai', reason: 'weak-evidence', details: { explanation_es: 'Elogio casual para Argentina', explanation: 'Should not win' }, target_country: 'argentina', target_country_label: 'Argentina' },
      { id: 2, video_id: 'vid-777', source: 'ai', reason: 'weak-evidence', details: { explanation_es: 'Evidencia insuficiente para México' }, target_country: 'mexico', target_country_label: 'México' },
      { id: 3, video_id: 'vid-777', source: 'system', reason: 'no-candidates', details: { explanation_es: 'Resumen global sin candidatos', raw: { leaked: true } }, target_country: null },
      { id: 4, video_id: 'vid-888', source: 'system', reason: 'no-subtitles', created_at: '2026-05-21T08:00:00Z', details: { error: 'Timed text unavailable' } },
      { id: 5, video_id: 'vid-999', source: 'human', reason: 'editorial-risk', created_at: '2026-05-23T09:00:00Z', details: { note: 'No conviene' } },
    ],
  });
  assertIncludes(rejectedEl.innerHTML, 'class="ai-rescue-rejection-scroll"', 'rejected groups should render inside an internal scroll wrapper');
  assertIncludes(rejectedEl.innerHTML, 'Ver video', 'grouped rejection card should include a source video link');
  assertIncludes(rejectedEl.innerHTML, 'href="https://www.youtube.com/watch?v=vid-777"', 'grouped rejection card should generate YouTube link from video id');
  assertIncludes(rejectedEl.innerHTML, 'target="_blank"', 'video link should open in a new tab');
  assertIncludes(rejectedEl.innerHTML, 'rel="noopener noreferrer"', 'video link should be safe for new tabs');
  assertIncludes(rejectedEl.innerHTML, 'Fuente: IA', 'AI rejection source should render once per group');
  assertIncludes(rejectedEl.innerHTML, 'Sistema', 'system rejection source should render');
  assertIncludes(rejectedEl.innerHTML, 'Humano', 'human rejection source should render');
  assertEqual(countOccurrences(rejectedEl.innerHTML, 'class="ai-rescue-rejection-card"'), 3, 'multiple rejections for one video should render as one grouped card');
  assertIncludes(rejectedEl.innerHTML, 'Video: vid-777', 'grouped rejection should show video id once with a clear label');
  assertEqual(countOccurrences(rejectedEl.innerHTML, 'Video: vid-777'), 1, 'video id should not repeat per country');
  assertEqual(countOccurrences(rejectedEl.innerHTML, 'class="ai-rescue-source-chip"'), 3, 'source/status chip should render once per group, not once per country row');
  if (rejectedEl.innerHTML.indexOf('Video: vid-999') > rejectedEl.innerHTML.indexOf('Video: vid-888')) {
    throw new Error(`grouped rejections are not latest-first: ${rejectedEl.innerHTML}`);
  }
  assertIncludes(rejectedEl.innerHTML, 'Elogio casual para Argentina', 'per-country Argentina explanation should remain visible');
  assertIncludes(rejectedEl.innerHTML, 'Evidencia insuficiente para México', 'per-country México explanation should remain visible');
  assertIncludes(rejectedEl.innerHTML, '<strong>Argentina</strong>', 'country should be the primary per-row label');
  if (rejectedEl.innerHTML.indexOf('Elogio casual para Argentina') > rejectedEl.innerHTML.indexOf('weak-evidence')) {
    throw new Error(`Spanish explanation should be primary before raw English reason: ${rejectedEl.innerHTML}`);
  }
  assertNotIncludes(rejectedEl.innerHTML, '<strong>weak-evidence</strong>', 'English reason must not be the per-country headline');
  assertNotIncludes(rejectedEl.innerHTML, 'Resumen global sin candidatos', 'global no-candidates row should not duplicate country details when per-country rows exist');
  assertNotIncludes(rejectedEl.innerHTML, 'raw', 'normal rejection details must not render raw JSON keys');
  assertIncludes(rejectedEl.innerHTML, 'Timed text unavailable', 'rejection detail should render for calibration');

  const detailEl = makeElement();
  renderAiRescueDetail({
    el: { aiRescueDetailBody: detailEl },
    candidate: {
      ...sampleCandidates[0],
      reason: 'Evidencia positiva sostenida.',
      evidence: [
        { start_ms: 12000, end_ms: 27000, text: 'Great control', translation_es: 'Gran control', explanation_es: 'Elogio técnico.' },
      ],
    },
  });
  assertIncludes(detailEl.innerHTML, 'Score 91', 'detail score drift');
  assertIncludes(detailEl.innerHTML, 'Destino: Argentina', 'detail target drift');
  assertIncludes(detailEl.innerHTML, 'Fuente excluida: Ecuador', 'detail source exclusion drift');
  assertIncludes(detailEl.innerHTML, 'Evidencia positiva sostenida.', 'detail reason drift');
  assertIncludes(detailEl.innerHTML, 'Gran actuación en el segundo tiempo.', 'detail summary drift');
  assertIncludes(detailEl.innerHTML, 'Enfoque editorial sugerido.', 'detail angle drift');
  assertIncludes(detailEl.innerHTML, 'Sin riesgo fuerte', 'detail risks drift');
  assertIncludes(detailEl.innerHTML, '00:12-00:27', 'evidence timestamp drift');
  assertIncludes(detailEl.innerHTML, 'Great control', 'original evidence text drift');
  assertIncludes(detailEl.innerHTML, 'Gran control', 'translated evidence text drift');
  assertIncludes(detailEl.innerHTML, 'Elogio técnico.', 'Spanish explanation drift');
  assertIncludes(detailEl.innerHTML, 'data-ai-rescue-action="approve"', 'detail approve action drift');
  assertIncludes(detailEl.innerHTML, 'data-ai-rescue-action="reject"', 'detail reject action drift');

  const queueEl = makeElement();
  renderAiRescueQueue({
    el: { aiRescueQueueBody: queueEl },
    queue: {
      current: { video_id: 'now', status: 'processing', source_country_label: 'Ecuador' },
      upcoming: [
        { video_id: 'wait', status: 'waiting', source_country_label: 'Colombia' },
        { video_id: 'retry', status: 'retry', attempt_count: 2, next_attempt_at: '2026-05-22T12:00:00Z' },
      ],
      counts: { waiting: 1, retry: 1 },
    },
  });
  assertIncludes(queueEl.innerHTML, 'Analizando ahora', 'queue current header drift');
  assertIncludes(queueEl.innerHTML, 'Videos próximos', 'queue upcoming header drift');
  assertIncludes(queueEl.innerHTML, 'En espera', 'waiting state drift');
  assertIncludes(queueEl.innerHTML, 'Reintento', 'retry state drift');
}

async function runApiClientCheck() {
  const calls = [];
  const api = createAiRescueApiClient({
    getSettings: () => ({ apiOrigin: 'https://api.example.test', sharedApiKey: 'shared-secret' }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/preflight')) return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      if (url.endsWith('/queue')) return new Response(JSON.stringify({ current: null, upcoming: [], counts: {} }), { status: 200 });
      if (url.endsWith('/candidates?target_country=argentina')) return new Response(JSON.stringify({ items: [sampleCandidates[0]] }), { status: 200 });
      if (url.endsWith('/candidates/2/approve')) return new Response(JSON.stringify({ status: 'approved' }), { status: 200 });
      if (url.endsWith('/candidates/2/reject')) return new Response(JSON.stringify({ status: 'rejected' }), { status: 200 });
      if (url.endsWith('/card-dismissals') && options.method === 'POST') return new Response(JSON.stringify({ status: 'dismissed', context_key: 'ai-rescue-candidate:argentina:2' }), { status: 200 });
      if (url.endsWith('/candidates/2')) return new Response(JSON.stringify({ ...sampleCandidates[0], evidence: [] }), { status: 200 });
      if (url.endsWith('/rejections')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.endsWith('/refresh')) return new Response(JSON.stringify({ status: 'ok', enqueued_count: 1 }), { status: 200 });
      return new Response(JSON.stringify({ message: 'bad shared-secret failure' }), { status: 403 });
    },
  });

  await api.preflight();
  await api.queue();
  await api.candidates('argentina');
  await api.candidateDetail(2);
  await api.rejections();
  await api.refresh();
  await api.approveCandidate(2, { reviewer: 'editor' });
  await api.rejectCandidate(2, { reviewer: 'editor', reason: 'weak evidence' });
  await api.dismissCandidate({ targetContext: 'Argentina', videoId: 'v-high', candidateId: 2 });

  assertEqual(calls[0].url, 'https://api.example.test/monitor/api/monitor/ai-rescue/preflight', 'preflight URL drift');
  assertEqual(calls[0].options.headers['x-api-key'], 'shared-secret', 'AI Rescue must use shared monitor API key only');
  assertEqual(calls[2].url, 'https://api.example.test/monitor/api/monitor/ai-rescue/candidates?target_country=argentina', 'candidate country filter URL drift');
  assertEqual(calls[5].options.method, 'POST', 'refresh method drift');
  assertDeepEqual(JSON.parse(calls[6].options.body), { confirmed: true, reviewer: 'editor' }, 'approve confirmation payload drift');
  assertDeepEqual(JSON.parse(calls[7].options.body), { confirmed: true, reviewer: 'editor', reason: 'weak evidence' }, 'reject confirmation payload drift');
  assertEqual(calls[8].url, 'https://api.example.test/monitor/api/monitor/card-dismissals', 'candidate dismissal URL drift');
  assertDeepEqual(JSON.parse(calls[8].options.body), {
    surface: 'ai-rescue-candidate',
    target_context: 'argentina',
    video_id: 'v-high',
    candidate_id: 2,
    reason: 'operator-dismissed',
    dismissed_by: 'control-panel',
  }, 'candidate dismissal payload drift');
  for (const call of calls) {
    if (call.options.headers.Authorization || call.options.headers['x-opencode-api-key']) {
      throw new Error(`OpenCode credential leaked into browser headers: ${JSON.stringify(call.options.headers)}`);
    }
  }

  let authMessage = '';
  try {
    await api.candidateDetail('missing');
  } catch (error) {
    authMessage = error?.message || '';
  }
  assertIncludes(authMessage, 'Autenticación de Prensa IA falló', 'Prensa IA auth error should be actionable');
  assertNotIncludes(authMessage, 'shared-secret', 'AI Rescue auth error leaked shared API key');
}

async function runControllerCheck() {
  const calls = [];
  const timers = [];
  const cleared = [];
  const opened = [];
  const state = createAiRescueState();
  const el = {
    aiRescueTabs: makeElement(),
    aiRescueList: makeElement(),
    aiRescueStatus: makeElement(),
    aiRescueRefreshBtn: makeElement(),
    aiRescueQueueBtn: makeElement(),
    aiRescueQueueDialog: makeElement(),
    aiRescueQueueCloseBtn: makeElement(),
    aiRescueQueueRefreshBtn: makeElement(),
    aiRescueQueueBody: makeElement(),
    aiRescueDetailDialog: makeElement(),
    aiRescueDetailCloseBtn: makeElement(),
    aiRescueDetailBody: makeElement(),
    aiRescueConfirmDialog: makeElement(),
    aiRescueConfirmTitle: makeElement(),
    aiRescueConfirmMessage: makeElement(),
    aiRescueConfirmAcceptBtn: makeElement(),
    aiRescueConfirmCancelBtn: makeElement(),
  };
  const api = {
    async preflight() { calls.push('preflight'); return { enabled: true }; },
    async candidates(targetCountry) { calls.push({ type: 'candidates', targetCountry }); return { items: sampleCandidates }; },
    async candidateDetail(candidateId) { calls.push({ type: 'detail', candidateId }); return { ...sampleCandidates[0], id: candidateId, evidence: [] }; },
    async rejections() { calls.push('rejections'); return { items: [{ id: 1, source: 'human', reason: 'weak-evidence' }] }; },
    async queue() { calls.push('queue'); return { current: null, upcoming: [], counts: { waiting: 1 } }; },
    async refresh() { calls.push('refresh'); return { status: 'ok', enqueued_count: 1 }; },
    async approveCandidate(candidateId, payload) { calls.push({ type: 'approve', candidateId, payload }); return { status: 'approved' }; },
    async rejectCandidate(candidateId, payload) { calls.push({ type: 'reject', candidateId, payload }); return { status: 'rejected' }; },
    async dismissCandidate(payload) { calls.push({ type: 'dismissCandidate', payload }); return { status: 'dismissed', context_key: `${payload.surface}:${payload.targetContext}:${payload.candidateId}` }; },
  };
  const controller = createAiRescueController({
    state,
    el,
    api,
    ui: { toast(message) { calls.push({ type: 'toast', message }); } },
    browser: {
      setInterval(callback, delay) { timers.push({ callback, delay }); return timers.length; },
      clearInterval(id) { cleared.push(id); },
      window: { open(url, target, features) { opened.push({ url, target, features }); } },
      confirm() { return true; },
    },
  });
  controller.bindEvents();

  await controller.activate();
  assertEqual(timers[0].delay, 10000, 'active view polling interval drift');
  assertEqual(calls[0], 'preflight', 'activate should run preflight first');
  if (!calls.some((entry) => entry.type === 'candidates')) throw new Error(`activate should fetch candidates: ${JSON.stringify(calls)}`);
  await timers[0].callback();
  if (calls.filter((entry) => entry.type === 'candidates').length < 2) throw new Error(`active poll should refresh candidates: ${JSON.stringify(calls)}`);
  controller.deactivate();
  assertEqual(cleared[0], 1, 'deactivate should stop active-view polling');

  await controller.openQueue();
  assertEqual(timers[1].delay, 10000, 'queue modal polling interval drift');
  if (!calls.includes('queue')) throw new Error(`openQueue should fetch queue: ${JSON.stringify(calls)}`);
  await timers[1].callback();
  if (calls.filter((entry) => entry === 'queue').length < 2) throw new Error(`queue poll should refresh queue while visible: ${JSON.stringify(calls)}`);
  controller.closeQueue();
  assertEqual(cleared[1], 2, 'closing queue should stop modal polling');

  await controller.manualRefresh();
  if (!calls.includes('refresh')) throw new Error(`manual refresh should call refresh endpoint: ${JSON.stringify(calls)}`);

  await controller.openDetail(2);
  if (!calls.some((entry) => entry.type === 'detail' && entry.candidateId === 2)) throw new Error(`summary modal should fetch candidate detail: ${JSON.stringify(calls)}`);
  await controller.confirmDecision(2, 'approve');
  await el.aiRescueConfirmAcceptBtn.onclick();
  if (!calls.some((entry) => entry.type === 'approve' && entry.payload.confirmed === true)) throw new Error(`approve should require confirmed payload: ${JSON.stringify(calls)}`);
  await controller.confirmDecision(2, 'reject', { reason: 'weak evidence' });
  await el.aiRescueConfirmAcceptBtn.onclick();
  if (!calls.some((entry) => entry.type === 'reject' && entry.payload.reason === 'weak evidence')) throw new Error(`reject should send human reason: ${JSON.stringify(calls)}`);

  const dismissButton = {
    disabled: false,
    focused: false,
    dataset: {
      aiRescueAction: 'dismiss-candidate',
      aiRescueDismissSurface: 'ai-rescue-candidate',
      aiRescueDismissTargetContext: 'argentina',
      aiRescueDismissVideoId: 'v-high',
      aiRescueDismissCandidateId: '2',
    },
    focus() { this.focused = true; },
  };
  el.aiRescueList.listeners.get('click')?.({ target: { closest: () => dismissButton } });
  assertIncludes(el.aiRescueConfirmMessage.textContent, 'solo oculta este candidato en Argentina', 'dismiss confirm copy should explain candidate context isolation');
  assertIncludes(el.aiRescueConfirmMessage.textContent, 'no aprueba, rechaza ni borra', 'dismiss confirm copy should explain non-destructive AI Rescue behavior');
  assertIncludes(el.aiRescueConfirmMessage.textContent, 'Radar Ecuador, Colombia e IMPORTANTES', 'dismiss confirm copy should explain monitor-card isolation');
  el.aiRescueConfirmCancelBtn.onclick?.();
  if (calls.some((entry) => entry.type === 'dismissCandidate')) throw new Error(`cancel must not persist candidate dismissal: ${JSON.stringify(calls)}`);
  assertEqual(dismissButton.focused, true, 'cancel should restore focus to candidate dismiss button');

  dismissButton.focused = false;
  el.aiRescueList.listeners.get('click')?.({ target: { closest: () => dismissButton } });
  await el.aiRescueConfirmAcceptBtn.onclick();
  assertDeepEqual(calls.find((entry) => entry.type === 'dismissCandidate')?.payload, {
    surface: 'ai-rescue-candidate',
    targetContext: 'argentina',
    videoId: 'v-high',
    candidateId: 2,
  }, 'candidate dismiss should use isolated ai-rescue-candidate context');
  if (calls.some((entry) => entry.type === 'approve' && entry.candidateId === 2 && entry.payload?.reason === 'operator-dismissed')) throw new Error(`dismissal must not approve candidate: ${JSON.stringify(calls)}`);
  if (calls.some((entry) => entry.type === 'reject' && entry.candidateId === 2 && entry.payload?.reason === 'operator-dismissed')) throw new Error(`dismissal must not reject candidate: ${JSON.stringify(calls)}`);
  const dismissIndex = calls.findIndex((entry) => entry.type === 'dismissCandidate');
  const refreshAfterDismiss = calls.slice(dismissIndex + 1).some((entry) => entry.type === 'candidates');
  assertEqual(refreshAfterDismiss, true, 'confirming candidate dismissal should refresh AI Rescue candidates');
  assertEqual(dismissButton.focused, true, 'confirm should restore focus to candidate dismiss button');
  controller.openLink('https://youtu.be/v-high');
  controller.openLink('javascript:alert(1)');
  assertDeepEqual(opened, [{ url: 'https://youtu.be/v-high', target: '_blank', features: 'noopener,noreferrer' }], 'safe link opening drift');
}

export async function runAiRescuePanelCheck() {
  runStateCheck();
  runRenderCheck();
  await runApiClientCheck();
  await runControllerCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  runAiRescuePanelCheck()
    .then(() => console.log('ai-rescue-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

import { fileURLToPath } from 'node:url';
import { createRadarApiClient } from '../api-client.js';
import { createRadarController } from '../controller.js';
import {
  formatMentionsCopy,
  formatTranscriptCopy,
  renderRadarHistory,
  renderRadarResults,
} from '../render.js';
import { buildRadarJobPayload, createRadarState, parseRadarKeywords } from '../state.js';

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
  };
}

async function runApiClientCheck() {
  const calls = [];
  const api = createRadarApiClient({
    getSettings: () => ({ transcriptServiceBaseUrl: 'https://radar.local/', transcriptServiceApiKey: 'secret-token' }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
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

  assertEqual(calls[0].url, 'https://radar.local/api/radar/health', 'health URL drift');
  assertEqual(calls[0].options.headers['x-api-key'], 'secret-token', 'health api key header drift');
  assertEqual(calls[1].url, 'https://radar.local/api/radar/jobs', 'create URL drift');
  assertEqual(calls[1].options.method, 'POST', 'create method drift');
  assertEqual(calls[1].options.headers['x-api-key'], 'secret-token', 'api key header drift');
  assertEqual(JSON.parse(calls[1].options.body).countries[0], 'argentina', 'create payload country drift');
  assertEqual(calls[2].url, 'https://radar.local/api/radar/jobs/job-1', 'detail URL drift');
  assertEqual(calls[3].url, 'https://radar.local/api/radar/jobs', 'history URL drift');
  assertEqual(calls[4].url, 'https://radar.local/api/radar/jobs/job-1/summary', 'summary URL drift');
  assertEqual(calls[5].url, 'https://radar.local/api/radar/jobs/job-1/export.txt', 'export URL drift');
  assertEqual(calls[6].url, 'https://radar.local/api/radar/jobs/job-1/cancel', 'cancel URL drift');
  assertEqual(calls[7].options.method, 'DELETE', 'delete method drift');

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
}

function runStateAndRenderCheck() {
  assertDeepEqual(parseRadarKeywords('Messi, Di María\nScaloni'), ['Messi', 'Di María', 'Scaloni'], 'keyword parsing drift');
  const payload = buildRadarJobPayload({
    url: ' https://youtu.be/abc ',
    countries: ['colombia', 'argentina'],
    extraKeywords: 'Messi, Di María',
  });
  assertDeepEqual(payload, {
    url: 'https://youtu.be/abc',
    countries: ['colombia', 'argentina'],
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

  const queueEl = makeElement();
  renderRadarResults({ el: { radarQueueList: queueEl }, state: { currentJob: { job_id: 'job-1', title: 'Video uno', status: 'running', selected_countries: ['argentina'] } } });
  if (!queueEl.innerHTML.includes('Video uno') || !queueEl.innerHTML.includes('Cancelar')) throw new Error(`queue render drift: ${queueEl.innerHTML}`);

  const historyEl = makeElement();
  renderRadarHistory({ el: { radarHistoryList: historyEl }, history: [{ job_id: 'job-1', status: 'succeeded', title: 'Final', selected_countries: ['argentina'], detected_language: 'fr', mention_count: 2, artifacts: { export_txt: true } }] });
  if (!historyEl.innerHTML.includes('Final') || !historyEl.innerHTML.includes('fr') || !historyEl.innerHTML.includes('Descargar TXT')) {
    throw new Error(`history render drift: ${historyEl.innerHTML}`);
  }
}

async function runControllerCheck() {
  const calls = [];
  const copied = [];
  const state = createRadarState();
  const el = {
    radarUrlInput: makeElement({ value: 'https://youtu.be/abc' }),
    radarCountryColombia: { checked: false },
    radarCountryEcuador: { checked: false },
    radarCountryArgentina: { checked: true },
    radarExtraKeywordsInput: makeElement({ value: 'Messi' }),
    radarSubmitBtn: makeElement(),
    radarHealthStatus: makeElement(),
    radarProgressStatus: makeElement(),
    radarQueueList: makeElement(),
    radarNewJobDialog: { showModal() { calls.push('showModal'); }, close() { calls.push('closeModal'); } },
    radarSummaryDialog: { showModal() { calls.push('summaryModal'); }, close() {} },
    radarSummaryBody: makeElement(),
    radarConfirmDialog: { showModal() { calls.push('confirmModal'); }, close() {} },
    radarConfirmTitle: makeElement(),
    radarConfirmMessage: makeElement(),
    radarConfirmAcceptBtn: makeElement(),
    radarConfirmCancelBtn: makeElement(),
    radarHistoryList: makeElement(),
  };
  const api = {
    async health() { calls.push('health'); return { status: 'ok' }; },
    async createJob(payload) { calls.push({ type: 'create', payload }); return { job_id: 'job-1', status: 'queued' }; },
    async getJob(jobId) { calls.push({ type: 'getJob', jobId }); return { job_id: jobId, status: 'succeeded', progress: { percent: 100 } }; },
    async getSummary(jobId) { calls.push({ type: 'summary', jobId }); return { items: [{ label: 'Argentina', count: 1, timestamps: ['00:12'] }] }; },
    async downloadExportText(jobId) { calls.push({ type: 'download', jobId }); return 'TXT backend'; },
    async cancelJob(jobId) { calls.push({ type: 'cancel', jobId }); return { status: 'cancelled' }; },
    async deleteJob(jobId) { calls.push({ type: 'delete', jobId }); return { status: 'deleted' }; },
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
    },
  });

  await controller.refreshHealth();
  await controller.submitCurrentJob();
  await controller.showSummary('job-1');
  await controller.downloadJob('job-1');
  await controller.confirmJobAction('job-1', 'cancel');
  await el.radarConfirmAcceptBtn.listeners.get('click')();

  assertEqual(calls[0], 'health', 'health call drift');
  assertEqual(calls[1].type, 'create', 'submit should create a service job');
  assertEqual(calls[1].payload.countries[0], 'argentina', 'controller countries payload drift');
  if (!calls.some((entry) => entry.type === 'getJob')) throw new Error('controller should poll job detail');
  if (!calls.some((entry) => entry.type === 'summary')) throw new Error('controller should fetch backend summary');
  if (!calls.some((entry) => entry.type === 'download')) throw new Error('controller should request backend TXT download');
  if (!calls.some((entry) => entry.type === 'cancel')) throw new Error('controller should confirm before cancelling');
  if (!el.radarProgressStatus.textContent.includes('succeeded')) throw new Error(`progress status drift: ${el.radarProgressStatus.textContent}`);
}

export async function runRadarPanelCheck() {
  await runApiClientCheck();
  runStateAndRenderCheck();
  await runControllerCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  runRadarPanelCheck()
    .then(() => console.log('radar-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

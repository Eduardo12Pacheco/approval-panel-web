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
      if (url.endsWith('/jobs/job-1/transcript')) return new Response(JSON.stringify({ text: '(00:01) Hola' }), { status: 200 });
      if (url.endsWith('/jobs/job-1/mentions')) return new Response(JSON.stringify({ matches: [] }), { status: 200 });
      if (url.endsWith('/jobs/job-1')) return new Response(JSON.stringify({ job_id: 'job-1', status: 'succeeded' }), { status: 200 });
      if (url.endsWith('/jobs') && options.method === 'POST') return new Response(JSON.stringify({ job_id: 'job-1', status: 'queued' }), { status: 201 });
      if (url.endsWith('/jobs')) return new Response(JSON.stringify({ items: [{ job_id: 'job-1' }] }), { status: 200 });
      return new Response(JSON.stringify({ message: 'bad secret-token failure' }), { status: 401 });
    },
  });

  await api.health();
  await api.createJob({ url: 'https://youtu.be/1', target: { type: 'country', name: 'Argentina' }, extra_keywords: ['Messi'] });
  await api.getJob('job-1');
  await api.history();
  await api.getTranscript('job-1');
  await api.getMentions('job-1');

  assertEqual(calls[0].url, 'https://radar.local/api/radar/health', 'health URL drift');
  assertEqual(calls[1].url, 'https://radar.local/api/radar/jobs', 'create URL drift');
  assertEqual(calls[1].options.method, 'POST', 'create method drift');
  assertEqual(calls[1].options.headers['x-api-key'], 'secret-token', 'api key header drift');
  assertEqual(JSON.parse(calls[1].options.body).extra_keywords[0], 'Messi', 'create payload drift');
  assertEqual(calls[2].url, 'https://radar.local/api/radar/jobs/job-1', 'detail URL drift');
  assertEqual(calls[3].url, 'https://radar.local/api/radar/jobs', 'history URL drift');
  assertEqual(calls[4].url, 'https://radar.local/api/radar/jobs/job-1/transcript', 'transcript URL drift');
  assertEqual(calls[5].url, 'https://radar.local/api/radar/jobs/job-1/mentions', 'mentions URL drift');

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
    targetType: 'country',
    targetName: 'Argentina',
    targetAliases: 'albiceleste\nselección argentina',
    extraKeywords: 'Messi, Di María',
  });
  assertDeepEqual(payload, {
    url: 'https://youtu.be/abc',
    target: { type: 'country', name: 'Argentina', aliases: ['albiceleste', 'selección argentina'] },
    extra_keywords: ['Messi', 'Di María'],
  }, 'job payload drift');

  const unsupportedTargetPayload = buildRadarJobPayload({
    url: 'https://youtu.be/abc',
    targetType: 'manual',
    targetName: 'Messi',
  });
  assertEqual(unsupportedTargetPayload.target.type, 'player', 'unsupported target type should submit backend-supported player target');

  const state = createRadarState();
  assertEqual(state.status, 'idle', 'initial state drift');
  assertEqual(state.history.length, 0, 'initial history drift');

  const transcript = formatTranscriptCopy({
    segments: [
      { start_ms: 12000, text: 'Argentina presiona alto.' },
      { start_ms: 73000, text: 'Messi aparece entre líneas.' },
    ],
  });
  assertEqual(transcript, '(00:12) Argentina presiona alto.\n(01:13) Messi aparece entre líneas.', 'transcript copy format drift');

  const mentions = formatMentionsCopy({
    matches: [{ start_ms: 12000, canonical: 'Argentina', keyword: 'albiceleste', text: 'La albiceleste presiona alto.' }],
  });
  if (!mentions.includes('(00:12) Argentina [albiceleste] La albiceleste presiona alto.')) {
    throw new Error(`mentions copy format drift: ${mentions}`);
  }

  const resultEl = makeElement();
  renderRadarResults({
    el: { radarTranscriptOutput: resultEl, radarMentionsOutput: makeElement(), radarCopyTranscriptBtn: makeElement(), radarCopyMentionsBtn: makeElement() },
    transcript: { text: transcript },
    mentions: { matches: [{ start_ms: 12000, canonical: 'Argentina', keyword: 'albiceleste', context: 'La albiceleste presiona alto.' }] },
  });
  if (!resultEl.textContent.includes('(00:12) Argentina presiona alto.')) throw new Error('expected transcript render to show copyable text');

  const historyEl = makeElement();
  renderRadarHistory({ el: { radarHistoryList: historyEl }, history: [{ job_id: 'job-1', status: 'succeeded', target: { name: 'Argentina' }, mention_count: 2 }] });
  if (!historyEl.innerHTML.includes('Argentina') || !historyEl.innerHTML.includes('2 menciones')) {
    throw new Error(`history render drift: ${historyEl.innerHTML}`);
  }
}

async function runControllerCheck() {
  const calls = [];
  const copied = [];
  const state = createRadarState();
  const el = {
    radarUrlInput: makeElement({ value: 'https://youtu.be/abc' }),
    radarTargetTypeSelect: makeElement({ value: 'country' }),
    radarTargetNameInput: makeElement({ value: 'Argentina' }),
    radarTargetAliasesInput: makeElement({ value: 'albiceleste' }),
    radarExtraKeywordsInput: makeElement({ value: 'Messi' }),
    radarSubmitBtn: makeElement(),
    radarHealthStatus: makeElement(),
    radarProgressStatus: makeElement(),
    radarTranscriptOutput: makeElement(),
    radarMentionsOutput: makeElement(),
    radarCopyTranscriptBtn: makeElement(),
    radarCopyMentionsBtn: makeElement(),
    radarHistoryList: makeElement(),
  };
  const api = {
    async health() { calls.push('health'); return { status: 'ok' }; },
    async createJob(payload) { calls.push({ type: 'create', payload }); return { job_id: 'job-1', status: 'queued' }; },
    async getJob(jobId) { calls.push({ type: 'getJob', jobId }); return { job_id: jobId, status: 'succeeded', progress: { percent: 100 } }; },
    async getTranscript(jobId) { calls.push({ type: 'transcript', jobId }); return { text: '(00:12) Argentina presiona alto.' }; },
    async getMentions(jobId) { calls.push({ type: 'mentions', jobId }); return { matches: [{ start_ms: 12000, canonical: 'Argentina', keyword: 'albiceleste', context: 'La albiceleste presiona.' }] }; },
    async history() { calls.push('history'); return { items: [{ job_id: 'job-1', status: 'succeeded', target: { name: 'Argentina' }, mention_count: 1 }] }; },
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
  await controller.copyTranscript();
  await controller.copyMentions();

  assertEqual(calls[0], 'health', 'health call drift');
  assertEqual(calls[1].type, 'create', 'submit should create a service job');
  assertEqual(calls[1].payload.target.name, 'Argentina', 'controller target payload drift');
  if (!calls.some((entry) => entry.type === 'getJob')) throw new Error('controller should poll job detail');
  if (!calls.some((entry) => entry.type === 'transcript')) throw new Error('controller should fetch transcript after success');
  if (!calls.some((entry) => entry.type === 'mentions')) throw new Error('controller should fetch mentions after success');
  if (!el.radarProgressStatus.textContent.includes('succeeded')) throw new Error(`progress status drift: ${el.radarProgressStatus.textContent}`);
  assertEqual(copied[0], '(00:12) Argentina presiona alto.', 'transcript clipboard drift');
  if (!copied[1].includes('Argentina [albiceleste]')) throw new Error(`mentions clipboard drift: ${copied[1]}`);
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

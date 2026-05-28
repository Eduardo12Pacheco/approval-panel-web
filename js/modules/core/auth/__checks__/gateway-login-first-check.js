import assert from 'node:assert/strict';
import { bindCoreEvents } from '../../bootstrap.js';

function createClassList() {
  const classes = new Set();
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createForm() {
  let submitHandler = null;
  return {
    addEventListener(type, handler) {
      if (type === 'submit') submitHandler = handler;
    },
    submit() {
      submitHandler?.({ preventDefault() {} });
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

const calls = [];
const form = createForm();
const el = {
  authForm: form,
  authUser: { value: 'eduardo' },
  authPass: { value: 'secret' },
  authGate: { classList: createClassList() },
  appShell: { classList: createClassList() },
  sidebarNav: { addEventListener() {} },
  openQueueBtn: null,
  closeQueueBtn: null,
  refreshQueueBtn: null,
  runQueueBtn: null,
  settingsBtn: { addEventListener() {} },
  settingsDialog: { showModal() {} },
  logoutBtn: { addEventListener() {} },
  closeSettings: { addEventListener() {} },
  closeDialog: { addEventListener() {} },
  topicDialog: { close() {} },
  saveSettingsBtn: { addEventListener() {} },
  searchInput: { addEventListener() {} },
  countryFilter: { addEventListener() {} },
  sourcesFilter: { addEventListener() {} },
  apiOriginInput: { value: '' },
  baseUrlInput: { value: '' },
  secretInput: { value: '' },
  ttsBaseUrlInput: { value: '' },
  subtitlesBaseUrlInput: { value: '' },
  remotionApiUrlInput: { value: '' },
  approvalPipelineBaseUrlInput: { value: '' },
  brandChannelSelect: { value: '' },
  transcriptServiceBaseUrlInput: { value: '' },
};

bindCoreEvents({
  el,
  authUser: 'paneladmin',
  authPass: 'Guiones2026!',
  isValidCredentials: () => false,
  persistSessionStatus: () => calls.push('persist'),
  clearSessionStatus: () => calls.push('clear'),
  loginGatewaySession: async ({ user, pass }) => {
    calls.push(`gateway:${user}:${pass}`);
  },
  logoutGatewaySession: async () => {},
  setView: (view) => calls.push(`view:${view}`),
  refreshAll: (options) => calls.push(`refresh:${options.source}`),
  refreshQueue: () => {},
  runQueue: () => {},
  saveSettings: () => {},
  defaultSettings: () => ({
    apiOrigin: 'https://api.automatizacionedun8n.me',
    baseUrl: 'http://localhost:5678',
    ttsBaseUrl: 'http://localhost:8088',
    subtitlesBaseUrl: 'http://127.0.0.1:8092',
    remotionApiUrl: 'https://remotion-api.automatizacionedun8n.me',
    brandChannel: 'default',
    transcriptServiceBaseUrl: 'http://127.0.0.1:8765',
    channelMonitorBaseUrl: 'http://127.0.0.1:8775',
  }),
  toast: (message) => calls.push(`toast:${message}`),
  renderCards: () => {},
  reloadPage: () => calls.push('reload'),
});

form.submit();
await flushAsync();

assert.deepEqual(calls, [
  'gateway:eduardo:secret',
  'persist',
  'view:approval',
  'toast:Sesión iniciada',
  'refresh:login',
]);
assert.equal(el.authPass.value, '');

console.log('gateway-login-first-check ok');

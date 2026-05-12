import { resolveScriptIdentity } from './domain.js';

const SCRIPT_PUBLISH_STAGE_ORDER = [
  'queued',
  'saving_script',
  'creating_doc',
  'uploading_txt',
  'rewriting_pronunciation',
  'searching_images',
  'caching_images',
  'finalizing',
  'completed',
  'failed',
];

const SCRIPT_PUBLISH_STAGE_LABELS = {
  queued: 'En cola',
  saving_script: 'Guardando guion',
  creating_doc: 'Creando Google Doc',
  uploading_txt: 'Subiendo TXT',
  rewriting_pronunciation: 'Reescribiendo pronunciación',
  searching_images: 'Buscando imágenes',
  caching_images: 'Cacheando imágenes',
  finalizing: 'Finalizando',
  completed: 'Completado',
  failed: 'Falló',
};

export function getScriptPublishStageMeta(stage, status = '') {
  const normalizedStatus = (status || '').toString().trim().toLowerCase();
  const normalizedStage = (stage || '').toString().trim().toLowerCase();
  const effective = normalizedStage || normalizedStatus || 'queued';
  const index = SCRIPT_PUBLISH_STAGE_ORDER.indexOf(effective);
  const basePercent = index >= 0
    ? Math.min(100, Math.max(0, Math.round((index / Math.max(1, SCRIPT_PUBLISH_STAGE_ORDER.length - 2)) * 100)))
    : 0;
  return {
    stage: effective,
    label: SCRIPT_PUBLISH_STAGE_LABELS[effective] || effective,
    percent: effective === 'failed' ? 100 : basePercent,
  };
}

export function scriptPublishJobMatchesRow(job = {}, row = {}) {
  if (!job || !row) return false;
  const jobIds = resolveScriptIdentity(job);
  const rowIds = resolveScriptIdentity(row);
  const pairs = [
    [jobIds.draft_id, rowIds.draft_id],
    [jobIds.id_noticia, rowIds.id_noticia],
    [jobIds.cluster_id, rowIds.cluster_id],
  ];
  return pairs.some(([a, b]) => a && b && a === b);
}

export function resolveScriptPublishCardState(row = {}, job = null) {
  if (!job || !scriptPublishJobMatchesRow(job, row)) {
    return { locked: false, failed: false, label: '' };
  }
  const status = (job.status || '').toString().trim().toLowerCase();
  if (status === 'completed') return { locked: false, failed: false, label: '' };
  if (status === 'failed') return { locked: true, failed: true, label: 'ERROR' };
  const stageMeta = getScriptPublishStageMeta(job.stage, status);
  const pct = Number.isFinite(Number(job.percent)) ? Number(job.percent) : stageMeta.percent;
  const safePct = Math.max(0, Math.min(100, Math.round(pct)));
  return { locked: true, failed: false, label: `${safePct}%` };
}

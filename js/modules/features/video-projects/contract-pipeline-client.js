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
  return rows.map((row, index) => ({
    id: (row?.id || row?.rowId || `row-${index + 1}`).toString(),
    rowId: (row?.rowId || row?.id || `row-${index + 1}`).toString(),
    index: Number(row?.index ?? index),
    phrase: (row?.phrase || row?.caption || '').toString(),
    startTime: Number(row?.startTime ?? 0),
    endTime: Number(row?.endTime ?? 0),
    selectedAssetId: row?.selectedAssetId || null,
    motionPresetId: row?.motionPresetId || (typeof row?.motion === 'string' ? row.motion : 'custom'),
    motion: row?.motion || 'slow-zoom-in',
    dust: { enabled: Boolean(row?.dust?.enabled), type: row?.dust?.type || 'dust-1', assetId: row?.dust?.assetId || row?.dust?.type || null, opacity: row?.dust?.opacity ?? 0.36, blendMode: row?.dust?.blendMode || 'screen' },
    logo: { enabled: row?.logo?.enabled !== false, source: row?.logo?.source || 'logo-alpha.webm' },
    filter: { enabled: Boolean(row?.filter?.enabled), mode: row?.filter?.mode || 'cover' },
    transition: row?.transition || 'none',
  })).filter((row) => row.id);
}

function buildApprovalSeedPayload(project = {}) {
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
  const remotionClient = api.createRemotionClient({
    resolveBaseUrl: () => settings?.remotionApiUrl || '',
  });
  const approvalBaseUrl = (settings?.approvalPipelineBaseUrl || '').toString().trim();

  const remotionProvider = {
    client: remotionClient,
    providerId: 'remotion',
    providerMetadata: {
      id: 'remotion',
      baseUrl: (settings?.remotionApiUrl || '').toString().trim(),
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

  const seed = buildApprovalSeedPayload(project);
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
    const timedRows = createdRows.length ? createdRows : statusRows;
    if (!timedRows.length) throw new Error('Remotion no devolvió filas cronometradas para el editor.');

    return {
      compositionProjectId,
      timedRows,
      previewAssets: status?.previewAssets || created?.previewAssets || null,
      globalAudio: canonicalSnapshot?.audio || statusSnapshot?.audio || { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
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
  try {
    approvalHealth = await approvalClient.health();
    const sanitizedApprovalHealth = sanitizeProviderHealthMetadata(approvalHealth);
    if (!isHealthyApprovalResponse(approvalHealth)) {
      throw new Error('Approval health no está lista');
    }
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
}

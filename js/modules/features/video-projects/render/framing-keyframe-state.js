const KEYFRAME_TIME_TOLERANCE_SECONDS = 0.055;

function normalizeKeyframe(value = '') {
  return value === 'end' ? 'end' : value === 'start' ? 'start' : '';
}

function readActiveKeyframe(project = {}) {
  const active = project?._activeFramingKeyframe;
  if (!active || typeof active !== 'object') return { rowId: '', keyframe: '' };
  return {
    rowId: (active.rowId || '').toString(),
    keyframe: normalizeKeyframe(active.keyframe),
  };
}

function isAtKeyframeTime(button, currentTime) {
  const keyframeTime = Number(button?.dataset?.keyframeTime ?? button?.dataset?.seekTime);
  const previewTime = Number(currentTime);
  return Number.isFinite(keyframeTime)
    && Number.isFinite(previewTime)
    && Math.abs(keyframeTime - previewTime) <= KEYFRAME_TIME_TOLERANCE_SECONDS;
}

export function setActiveFramingKeyframe(project = {}, { rowId = '', keyframe = '' } = {}) {
  const normalizedKeyframe = normalizeKeyframe(keyframe);
  if (!project || !rowId || !normalizedKeyframe) return;
  project._activeFramingKeyframe = { rowId: rowId.toString(), keyframe: normalizedKeyframe };
}

export function syncFramingKeyframeActiveState(root, project = {}, currentTime = project?._previewSeekTime) {
  const panels = [...(root?.querySelectorAll?.('[data-framing-keyframe-controls]') || [])];
  if (!panels.length) return;

  const active = readActiveKeyframe(project);
  panels.forEach((panel) => {
    const panelRowId = (panel?.dataset?.rowId || '').toString();
    const activeInPanel = Boolean(active.rowId && active.rowId === panelRowId && active.keyframe);
    let activeKeyframe = '';

    panel.querySelectorAll?.('[data-keyframe-button]').forEach((button) => {
      const keyframe = normalizeKeyframe(button?.dataset?.keyframe);
      const isActive = Boolean(activeInPanel && keyframe === active.keyframe && isAtKeyframeTime(button, currentTime));
      if (isActive) activeKeyframe = keyframe;
      button.classList?.toggle?.('is-active', isActive);
      button.setAttribute?.('aria-pressed', isActive ? 'true' : 'false');
    });

    panel.querySelectorAll?.('[data-keyframe-group]').forEach((group) => {
      const keyframe = normalizeKeyframe(group?.dataset?.keyframeGroup);
      group.classList?.toggle?.('is-muted', Boolean(activeKeyframe && keyframe && keyframe !== activeKeyframe));
      group.classList?.toggle?.('is-active', Boolean(activeKeyframe && keyframe === activeKeyframe));
    });

    if (activeKeyframe) panel.dataset.activeKeyframe = activeKeyframe;
    else delete panel.dataset.activeKeyframe;
  });
}

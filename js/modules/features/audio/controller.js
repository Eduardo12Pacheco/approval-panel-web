import {
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './runtime/index.js';
import { createAudioCommands } from './controller/commands.js';
import { createAudioControllerContext } from './controller/context.js';
import { createAudioDownload } from './controller/download.js';
import { createAudioJobs } from './controller/jobs.js';
import { createAudioPolling } from './controller/polling.js';
import { createAudioQueueRenderer } from './controller/queue-renderer.js';
import { createAudioStatusStream } from './controller/status-stream.js';
import { createAudioTracking } from './controller/tracking.js';

export function createAudioController({ state, el, api, ui, helpers, browser = globalThis }) {
  const context = createAudioControllerContext({
    state,
    el,
    api,
    ui,
    helpers,
    browser,
    runtime: {
      getAudioStatusClassRuntime,
      getAudioStatusLabelRuntime,
      isTerminalAudioStatus,
      normalizeAudioProgressPercent,
    },
  });
  const callbacks = {};
  const jobs = createAudioJobs({ context, callbacks });
  const queue = createAudioQueueRenderer({ context, callbacks });
  const polling = createAudioPolling({ context, callbacks });
  const statusStream = createAudioStatusStream({ context, callbacks });
  const tracking = createAudioTracking({ context, callbacks });
  const commands = createAudioCommands({ context, callbacks });
  const download = createAudioDownload({ context });

  Object.assign(callbacks, {
    ...jobs,
    ...queue,
    ...polling,
    ...statusStream,
    ...tracking,
    ...commands,
    ...download,
  });

  return {
    runAudioGeneration: commands.runAudioGeneration,
    runAudioGenerationFromText: commands.runAudioGenerationFromText,
    startAudioTracking: tracking.startAudioTracking,
    applyAudioJobStatus: jobs.applyAudioJobStatus,
    startAudioStatusStream: statusStream.startAudioStatusStream,
    startAudioPolling: polling.startAudioPolling,
    stopAudioTracking: tracking.stopAudioTracking,
    startAudioQueueSync: queue.startAudioQueueSync,
    stopAudioQueueSync: queue.stopAudioQueueSync,
    syncAudioQueueStatuses: queue.syncAudioQueueStatuses,
    renderAudioQueue: queue.renderAudioQueue,
    downloadAudioJob: download.downloadAudioJob,
    dismissAudioJob: jobs.dismissAudioJob,
    getLatestTrackedJobId: jobs.getLatestTrackedJobId,
  };
}

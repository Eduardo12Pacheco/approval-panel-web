import { fileURLToPath } from 'node:url';
import {
  WHIP_BROWSER_SFX_URL,
  applyWhipOverlayLayers,
  buildWhipPreviewEvents,
  createWhipSfxScheduler,
  resolveWhipPreviewFrame,
} from '../composition/renderer/whip-transition.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, message) {
  if (!value) throw new Error(message);
}

function createLayer() {
  return {
    src: '',
    draggable: true,
    style: {
      visibility: '',
      transform: '',
      filter: '',
      opacity: '',
    },
  };
}

function testWhipEventMathKeepsSegmentTimingUntouched() {
  const rows = [
    {
      id: 'row-a',
      startTime: 0,
      endTime: 1,
      image: 'previous.jpg',
      paragraphBoundaryAfter: true,
      nextRowId: 'row-b',
      transition: 'whip',
      transitionConfig: { type: 'whip', durationSeconds: 0.5, direction: 'left-to-right' },
      sfx: 'whip',
    },
    { id: 'row-b', startTime: 1, endTime: 3, image: 'next.jpg' },
  ];

  const events = buildWhipPreviewEvents(rows);

  assertEqual(events.length, 1, 'Expected one active Whip preview event');
  assertEqual(events[0].cutTime, 1, 'Expected Whip cut to use the next row start time');
  assertEqual(events[0].startTime, 0.75, 'Expected Whip to be centered before the cut');
  assertEqual(events[0].endTime, 1.25, 'Expected Whip to keep a half-second visual window');
  assertEqual(events[0].previousImage, 'previous.jpg', 'Expected outgoing row image in the event');
  assertEqual(events[0].nextImage, 'next.jpg', 'Expected incoming row image in the event');
  assertEqual(events[0].sfxUrl, WHIP_BROWSER_SFX_URL, 'Expected browser preview to use the local Control Panel SFX asset');
  assertEqual(rows[0].endTime, 1, 'Expected event building not to shorten outgoing segment timing');
  assertEqual(rows[1].startTime, 1, 'Expected event building not to shift incoming segment timing');
}

function testWhipEventMathIgnoresInactiveAndIneligibleRows() {
  const rows = [
    { id: 'row-a', startTime: 0, endTime: 1, image: 'a.jpg', paragraphBoundaryAfter: true, nextRowId: 'row-b', transition: 'none' },
    { id: 'row-b', startTime: 1, endTime: 2, image: 'b.jpg' },
    { id: 'row-c', startTime: 2, endTime: 3, image: 'c.jpg', transition: 'whip', nextRowId: 'row-d' },
    { id: 'row-d', startTime: 3, endTime: 4, image: 'd.jpg' },
  ];

  assertEqual(buildWhipPreviewEvents(rows).length, 0, 'Expected inactive or ineligible rows to produce no Whip events');
}

function testWhipFrameStylesMoveOutgoingRightAndIncomingSettles() {
  const [event] = buildWhipPreviewEvents([
    { id: 'row-a', startTime: 0, endTime: 1, image: 'previous.jpg', paragraphBoundaryAfter: true, nextRowId: 'row-b', transition: 'whip', transitionConfig: { durationSeconds: 0.5 } },
    { id: 'row-b', startTime: 1, endTime: 2, image: 'next.jpg' },
  ]);

  const frame = resolveWhipPreviewFrame(1, [event]);

  assertOk(frame, 'Expected frame at the cut to resolve an active Whip frame');
  assertEqual(frame.progress, 0.5, 'Expected cut-centered Whip frame to be halfway through');
  assertEqual(frame.previous.src, 'previous.jpg', 'Expected previous layer source');
  assertEqual(frame.next.src, 'next.jpg', 'Expected next layer source');
  assertOk(frame.previous.transform.includes('translate3d(55'), 'Expected outgoing image to move right at the cut');
  assertOk(frame.previous.filter.includes('blur('), 'Expected outgoing image to blur during Whip');
  assertOk(frame.next.transform.includes('translate3d(-12'), 'Expected incoming image to enter from a safe left offset at the cut');
}

function testWhipOverlayDomWiringAppliesAndHidesLayers() {
  const layers = { whipPrevious: createLayer(), whipNext: createLayer() };
  const frame = resolveWhipPreviewFrame(1, buildWhipPreviewEvents([
    { id: 'row-a', startTime: 0, endTime: 1, image: 'previous.jpg', paragraphBoundaryAfter: true, nextRowId: 'row-b', transition: 'whip' },
    { id: 'row-b', startTime: 1, endTime: 2, image: 'next.jpg' },
  ]));

  applyWhipOverlayLayers(layers, frame);

  assertEqual(layers.whipPrevious.style.visibility, 'visible', 'Expected previous Whip layer to be visible');
  assertEqual(layers.whipNext.style.visibility, 'visible', 'Expected next Whip layer to be visible');
  assertEqual(layers.whipPrevious.src, 'previous.jpg', 'Expected previous Whip layer src to update');
  assertEqual(layers.whipNext.src, 'next.jpg', 'Expected next Whip layer src to update');
  assertEqual(layers.whipPrevious.draggable, false, 'Expected Whip image layers to remain non-draggable');

  applyWhipOverlayLayers(layers, null);

  assertEqual(layers.whipPrevious.style.visibility, 'hidden', 'Expected previous Whip layer to hide after event');
  assertEqual(layers.whipNext.style.visibility, 'hidden', 'Expected next Whip layer to hide after event');
}

function testWhipSfxSchedulerStartsWithOverlayAndReplaysAfterRewind() {
  const calls = [];
  const scheduler = createWhipSfxScheduler({
    audioFactory(src) {
      calls.push({ type: 'create', src });
      return {
        currentTime: 99,
        volume: 0,
        play() {
          calls.push({ type: 'play', currentTime: this.currentTime, volume: this.volume });
          return Promise.resolve();
        },
      };
    },
  });
  const [event] = buildWhipPreviewEvents([
    { id: 'row-a', startTime: 0, endTime: 1, image: 'previous.jpg', paragraphBoundaryAfter: true, nextRowId: 'row-b', transition: 'whip', sfx: 'whip' },
    { id: 'row-b', startTime: 1, endTime: 2, image: 'next.jpg' },
  ]);

  assertEqual(scheduler.schedule({ event, currentTime: 0.74, playing: true }), false, 'Expected SFX not to play before the visual Whip starts');
  assertEqual(scheduler.schedule({ event, currentTime: 0.75, playing: true }), true, 'Expected SFX to play when the visual Whip starts');
  assertEqual(scheduler.schedule({ event, currentTime: 1.01, playing: true }), false, 'Expected SFX not to replay for the same forward pass');
  assertEqual(scheduler.schedule({ event, currentTime: 0.5, playing: false }), false, 'Expected paused rewind not to schedule SFX');
  assertEqual(scheduler.schedule({ event, currentTime: 0.75, playing: true }), true, 'Expected SFX to replay after rewinding before the boundary');
  assertEqual(scheduler.schedule({ event, currentTime: 1, playing: false }), false, 'Expected paused preview not to schedule SFX');
  assertEqual(calls.length, 4, 'Expected two audio element creations and two play calls');
  assertEqual(calls[0].src, WHIP_BROWSER_SFX_URL, 'Expected SFX scheduler to use local Whip asset');
  assertEqual(calls[1].currentTime, 0, 'Expected SFX playback to start from the beginning');
  assertEqual(calls[1].volume, 0.85, 'Expected SFX playback to use safe preview volume');
  assertEqual(calls[3].currentTime, 0, 'Expected replayed SFX playback to restart from the beginning');
}

export async function runCompositionWhipPreviewCheck() {
  testWhipEventMathKeepsSegmentTimingUntouched();
  testWhipEventMathIgnoresInactiveAndIneligibleRows();
  testWhipFrameStylesMoveOutgoingRightAndIncomingSettles();
  testWhipOverlayDomWiringAppliesAndHidesLayers();
  testWhipSfxSchedulerStartsWithOverlayAndReplaysAfterRewind();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCompositionWhipPreviewCheck();
  console.log('composition-whip-preview-check: ok');
}

export function createSingleFlightRunner(task) {
  let inFlight = null;

  return function runSingleFlight(...args) {
    if (inFlight) return inFlight;

    const pending = Promise.resolve().then(() => task(...args));
    const tracked = pending.finally(() => {
      if (inFlight === tracked) {
        inFlight = null;
      }
    });

    inFlight = tracked;
    return tracked;
  };
}

// Coalesce live edits into the first checkpoint of an explicit UI gesture.
// Equality still runs in zundo before this handler, so clicks with no changes
// neither create history nor discard redo. No timers or paused stores to leak.
export function createHistoryGesture() {
  let active = false;
  let saved = false;

  return {
    begin() {
      if (active) return;
      active = true;
      saved = false;
    },
    end() {
      active = false;
      saved = false;
    },
    handleSet<Args extends unknown[]>(save: (...args: Args) => void) {
      return (...args: Args) => {
        if (active && saved) return;
        if (active) saved = true;
        save(...args);
      };
    },
  };
}

import type {TimelineEngine} from '../../src/audio/engine/TimelineEngine';
/** Actual engine clock for console-locked GUI validation; never a synthetic clock. */
export const renderedHarness:{engine:TimelineEngine|null}={engine:null};

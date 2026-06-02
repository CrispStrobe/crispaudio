// ---------------------------------------------------------------------------
// CrispAudio — synthStore
// Zustand store for the SFX synthesizer.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { type SynthParams, type PresetName } from '../types/synth';

// `lockedParams` is stored as a Set and read through the immer draft, which
// requires immer's MapSet plugin. Enable it once at module load so the SFX
// param actions (setParams / loadPreset) don't throw at runtime.
enableMapSet();
import {
  createDefaultParams,
  generateSamples,
  loadPreset,
  morphParams,
} from '../audio/engine/SynthEngine';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface SynthState {
  // --- Sound slots ---
  paramsA: SynthParams;
  paramsB: SynthParams;
  /** Which slot is currently being edited. */
  activeSlot: 'A' | 'B';

  // --- Morphing ---
  /** 0 = fully A, 1 = fully B. */
  morphAmount: number;

  // --- Per-parameter lock (prevents randomisation / preset loading from
  //     overwriting locked params) ---
  lockedParams: Set<keyof SynthParams>;

  // --- Render output ---
  buffer: Float32Array | null;
  sampleRate: number;
  bitDepth: number;

  // --- Playback state (updated externally by the audio subsystem) ---
  isPlaying: boolean;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Merge partial params into the active slot, skipping locked fields.
   */
  setParams: (params: Partial<SynthParams>) => void;

  /**
   * Set which slot (A or B) is being actively edited.
   */
  setActiveSlot: (slot: 'A' | 'B') => void;

  /**
   * Update the morph crossfade amount (0..1).
   */
  setMorphAmount: (amount: number) => void;

  /**
   * Toggle the lock state of a single parameter key.
   */
  toggleLock: (param: keyof SynthParams) => void;

  /**
   * Load a named preset into the active slot.
   * Locked parameters are preserved.
   */
  loadPreset: (name: PresetName) => void;

  /**
   * Swap the contents of slot A and slot B.
   */
  swapSlots: () => void;

  /**
   * Copy the active slot's params into the other slot (preserving its locks).
   */
  copyToOther: () => void;

  /**
   * Synthesise samples from the current active slot params (or the morphed
   * result when morphAmount is between 0 and 1) and store them in `buffer`.
   */
  generate: () => void;

  /**
   * Update isPlaying (called by the audio subsystem).
   */
  setIsPlaying: (playing: boolean) => void;

  /**
   * Update export settings.
   */
  setExportSettings: (sampleRate: number, bitDepth: number) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useSynthStore = create<SynthState>()(
  immer((set, get) => ({
    paramsA: createDefaultParams(),
    paramsB: createDefaultParams(),
    activeSlot: 'A',
    morphAmount: 0,
    lockedParams: new Set<keyof SynthParams>(),
    buffer: null,
    sampleRate: 44100,
    bitDepth: 16,
    isPlaying: false,

    // -----------------------------------------------------------------------
    setParams(partial: Partial<SynthParams>) {
      set((state) => {
        const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;
        for (const key of Object.keys(partial) as Array<keyof SynthParams>) {
          if (state.lockedParams.has(key)) continue;
          // TypeScript: we know `partial[key]` matches `SynthParams[key]`
          (target as Record<string, unknown>)[key] = partial[key];
        }
      });
    },

    // -----------------------------------------------------------------------
    setActiveSlot(slot: 'A' | 'B') {
      set((state) => {
        state.activeSlot = slot;
      });
    },

    // -----------------------------------------------------------------------
    setMorphAmount(amount: number) {
      set((state) => {
        state.morphAmount = Math.max(0, Math.min(1, amount));
      });
    },

    // -----------------------------------------------------------------------
    toggleLock(param: keyof SynthParams) {
      set((state) => {
        // immer doesn't support Set mutations directly via draft — we rebuild it
        const next = new Set(state.lockedParams);
        if (next.has(param)) {
          next.delete(param);
        } else {
          next.add(param);
        }
        state.lockedParams = next;
      });
    },

    // -----------------------------------------------------------------------
    loadPreset(name: PresetName) {
      set((state) => {
        const fresh = loadPreset(name);
        const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;

        // Overwrite all non-locked fields
        for (const key of Object.keys(fresh) as Array<keyof SynthParams>) {
          if (state.lockedParams.has(key)) continue;
          (target as Record<string, unknown>)[key] = fresh[key];
        }
      });
    },

    // -----------------------------------------------------------------------
    swapSlots() {
      set((state) => {
        const tmp = { ...state.paramsA };
        state.paramsA = { ...state.paramsB };
        state.paramsB = tmp;
      });
    },

    // -----------------------------------------------------------------------
    copyToOther() {
      set((state) => {
        if (state.activeSlot === 'A') {
          // Copy A → B (respecting B's own locks — we do a full overwrite here
          // since "copy to other" semantics implies replacing the target)
          state.paramsB = { ...state.paramsA };
        } else {
          state.paramsA = { ...state.paramsB };
        }
      });
    },

    // -----------------------------------------------------------------------
    generate() {
      const { paramsA, paramsB, morphAmount, sampleRate } = get();

      // When morphAmount is exactly 0 or 1 we skip the interpolation step
      const params: SynthParams =
        morphAmount === 0
          ? paramsA
          : morphAmount === 1
          ? paramsB
          : morphParams(paramsA, paramsB, morphAmount);

      const samples = generateSamples(params, sampleRate);

      set((state) => {
        state.buffer = samples;
      });
    },

    // -----------------------------------------------------------------------
    setIsPlaying(playing: boolean) {
      set((state) => {
        state.isPlaying = playing;
      });
    },

    // -----------------------------------------------------------------------
    setExportSettings(sampleRate: number, bitDepth: number) {
      set((state) => {
        state.sampleRate = sampleRate;
        state.bitDepth = bitDepth;
      });
    },
  })),
);

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

/** Return the params for the currently active slot. */
export function selectActiveParams(state: SynthState): SynthParams {
  return state.activeSlot === 'A' ? state.paramsA : state.paramsB;
}

/** Return the morphed params at the current morphAmount. */
export function selectMorphedParams(state: SynthState): SynthParams {
  const { paramsA, paramsB, morphAmount } = state;
  if (morphAmount === 0) return paramsA;
  if (morphAmount === 1) return paramsB;
  return morphParams(paramsA, paramsB, morphAmount);
}

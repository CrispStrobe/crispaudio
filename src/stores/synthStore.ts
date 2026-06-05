// ---------------------------------------------------------------------------
// CrispAudio — synthStore
// Zustand store for the SFX synthesizer with undo/redo (zundo).
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { enableMapSet } from 'immer';
import { type SynthParams, type PresetName } from '../types/synth';

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
  paramsA: SynthParams;
  paramsB: SynthParams;
  activeSlot: 'A' | 'B';
  morphAmount: number;
  lockedParams: Set<keyof SynthParams>;
  buffer: Float32Array | null;
  sampleRate: number;
  bitDepth: number;
  isPlaying: boolean;

  setParams: (params: Partial<SynthParams>) => void;
  setActiveSlot: (slot: 'A' | 'B') => void;
  setMorphAmount: (amount: number) => void;
  toggleLock: (param: keyof SynthParams) => void;
  loadPreset: (name: PresetName) => void;
  swapSlots: () => void;
  copyToOther: () => void;
  generate: () => void;
  setIsPlaying: (playing: boolean) => void;
  setExportSettings: (sampleRate: number, bitDepth: number) => void;

  /** Slightly randomize 2-4 params of the active slot by ±10%. */
  mutateParams: () => void;

  /** Export active slot params as a JSON string. */
  exportParamsJSON: () => string;

  /** Import params from a JSON string into the active slot. */
  importParamsJSON: (json: string) => void;

  /** Encode active slot params as base64 for URL sharing. */
  encodeShareLink: () => string;
}

// ---------------------------------------------------------------------------
// Mutate helper — tweak 2-4 random params by ±10%
// ---------------------------------------------------------------------------

const MUTABLE_KEYS: Array<keyof SynthParams> = [
  'p_base_freq', 'p_freq_ramp', 'p_freq_dramp', 'p_freq_limit',
  'p_env_attack', 'p_env_sustain', 'p_env_punch', 'p_env_decay',
  'p_vib_strength', 'p_vib_speed', 'p_arp_mod', 'p_arp_speed',
  'p_duty', 'p_duty_ramp', 'p_repeat_speed',
  'p_pha_offset', 'p_pha_ramp',
  'p_lpf_freq', 'p_lpf_ramp', 'p_lpf_resonance',
  'p_hpf_freq', 'p_hpf_ramp',
  'fm_freq', 'fm_depth', 'lfo_rate', 'lfo_depth',
  'distortion', 'chorus_rate', 'chorus_depth',
  'delay_time', 'delay_feedback',
  'ring_mod_freq', 'ring_mod_depth',
  'bit_crush', 'sample_reduction',
  'flanger_rate', 'flanger_depth', 'flanger_delay',
  'reverb_size', 'reverb_decay', 'sub_bass',
];

function mutateSynthParams(
  params: SynthParams,
  locked: Set<keyof SynthParams>,
): Partial<SynthParams> {
  const available = MUTABLE_KEYS.filter((k) => !locked.has(k));
  if (available.length === 0) return {};

  const count = 2 + Math.floor(Math.random() * 3); // 2-4 params
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));

  const result: Partial<SynthParams> = {};
  for (const key of picked) {
    const current = params[key] as number;
    // If current is near 0, use a small absolute offset instead of relative
    const delta = Math.abs(current) > 0.01
      ? current * (Math.random() * 0.2 - 0.1)  // ±10% relative
      : (Math.random() * 0.1 - 0.05);           // ±0.05 absolute
    (result as Record<string, number>)[key] = current + delta;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useSynthStore = create<SynthState>()(
  temporal(
    immer((set, get) => ({
      paramsA: createDefaultParams(),
      paramsB: createDefaultParams(),
      activeSlot: 'A' as const,
      morphAmount: 0,
      lockedParams: new Set<keyof SynthParams>(),
      buffer: null as Float32Array | null,
      sampleRate: 44100,
      bitDepth: 16,
      isPlaying: false,

      setParams(partial: Partial<SynthParams>) {
        set((state) => {
          const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;
          for (const key of Object.keys(partial) as Array<keyof SynthParams>) {
            if (state.lockedParams.has(key)) continue;
            (target as Record<string, unknown>)[key] = partial[key];
          }
        });
      },

      setActiveSlot(slot: 'A' | 'B') {
        set((state) => { state.activeSlot = slot; });
      },

      setMorphAmount(amount: number) {
        set((state) => { state.morphAmount = Math.max(0, Math.min(1, amount)); });
      },

      toggleLock(param: keyof SynthParams) {
        set((state) => {
          const next = new Set(state.lockedParams);
          if (next.has(param)) next.delete(param);
          else next.add(param);
          state.lockedParams = next;
        });
      },

      loadPreset(name: PresetName) {
        set((state) => {
          const fresh = loadPreset(name);
          const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;
          for (const key of Object.keys(fresh) as Array<keyof SynthParams>) {
            if (state.lockedParams.has(key)) continue;
            (target as Record<string, unknown>)[key] = fresh[key];
          }
        });
      },

      swapSlots() {
        set((state) => {
          const tmp = { ...state.paramsA };
          state.paramsA = { ...state.paramsB };
          state.paramsB = tmp;
        });
      },

      copyToOther() {
        set((state) => {
          if (state.activeSlot === 'A') {
            state.paramsB = { ...state.paramsA };
          } else {
            state.paramsA = { ...state.paramsB };
          }
        });
      },

      generate() {
        const { paramsA, paramsB, morphAmount, sampleRate } = get();
        const params: SynthParams =
          morphAmount === 0
            ? paramsA
            : morphAmount === 1
            ? paramsB
            : morphParams(paramsA, paramsB, morphAmount);
        const samples = generateSamples(params, sampleRate);
        set((state) => { state.buffer = samples; });
      },

      setIsPlaying(playing: boolean) {
        set((state) => { state.isPlaying = playing; });
      },

      setExportSettings(sampleRate: number, bitDepth: number) {
        set((state) => {
          state.sampleRate = sampleRate;
          state.bitDepth = bitDepth;
        });
      },

      mutateParams() {
        set((state) => {
          const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;
          const mutations = mutateSynthParams(target, state.lockedParams);
          for (const key of Object.keys(mutations) as Array<keyof SynthParams>) {
            (target as Record<string, unknown>)[key] = mutations[key];
          }
        });
      },

      exportParamsJSON(): string {
        const { paramsA, paramsB, activeSlot } = get();
        const params = activeSlot === 'A' ? paramsA : paramsB;
        return JSON.stringify({ slot: activeSlot, params }, null, 2);
      },

      importParamsJSON(json: string) {
        try {
          const data = JSON.parse(json);
          if (data?.params && typeof data.params === 'object') {
            set((state) => {
              const target = state.activeSlot === 'A' ? state.paramsA : state.paramsB;
              for (const key of Object.keys(data.params) as Array<keyof SynthParams>) {
                if (state.lockedParams.has(key)) continue;
                if (key in target) {
                  (target as Record<string, unknown>)[key] = data.params[key];
                }
              }
            });
          }
        } catch {
          // silently ignore invalid JSON
        }
      },

      encodeShareLink(): string {
        const { paramsA, paramsB, activeSlot } = get();
        const params = activeSlot === 'A' ? paramsA : paramsB;
        const encoded = btoa(JSON.stringify(params));
        return `${window.location.origin}${window.location.pathname}?sound=${encoded}`;
      },
    })),
    {
      // Only track param-related state changes in undo history,
      // exclude transient state (buffer, isPlaying).
      partialize: (state) => ({
        paramsA: state.paramsA,
        paramsB: state.paramsB,
        activeSlot: state.activeSlot,
        morphAmount: state.morphAmount,
      }),
      limit: 50,
    },
  ),
);

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

export function selectActiveParams(state: SynthState): SynthParams {
  return state.activeSlot === 'A' ? state.paramsA : state.paramsB;
}

export function selectMorphedParams(state: SynthState): SynthParams {
  const { paramsA, paramsB, morphAmount } = state;
  if (morphAmount === 0) return paramsA;
  if (morphAmount === 1) return paramsB;
  return morphParams(paramsA, paramsB, morphAmount);
}

// ---------------------------------------------------------------------------
// URL share link loader — call on app startup
// ---------------------------------------------------------------------------

export function loadFromShareLink(): boolean {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('sound');
  if (!encoded) return false;
  try {
    const params = JSON.parse(atob(encoded));
    if (params && typeof params === 'object' && 'p_base_freq' in params) {
      useSynthStore.getState().setParams(params);
      useSynthStore.getState().generate();
      // Clean URL
      url.searchParams.delete('sound');
      window.history.replaceState({}, '', url.toString());
      return true;
    }
  } catch {
    // invalid link, ignore
  }
  return false;
}

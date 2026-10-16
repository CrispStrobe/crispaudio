import type {EffectConfig} from '../types/audio';

/** Preserve processor identity through edits; upgrade legacy/duplicate rack IDs on reorder. */
export function identifyEffectRack(effects: EffectConfig[]): EffectConfig[] {
  const seen = new Set<string>();
  return effects.map(effect => {
    const instanceId = effect.instanceId && !seen.has(effect.instanceId)
      ? effect.instanceId : crypto.randomUUID();
    seen.add(instanceId);
    return {...effect, instanceId};
  });
}

/** Pasting creates processors rather than sharing the source rack's DSP identities. */
export function pasteEffectRack(effects: EffectConfig[]): EffectConfig[] {
  return structuredClone(effects).map(effect => ({...effect, instanceId: crypto.randomUUID()}));
}

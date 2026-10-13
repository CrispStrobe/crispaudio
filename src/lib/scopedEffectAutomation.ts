import type { EffectConfig, TimelineProject } from '../types/audio';
import { supportsEffectParameter, validEffectAutomation, type DelayParameter } from './effectAutomation';
import { normalizeGainPoints } from './mixAutomation';
export const effectParameters: DelayParameter[] = ['mix', 'feedback', 'time', 'depth', 'rate'];
export function scopedEffect(project: TimelineProject, scope: string, index: number) {
  if (!Number.isInteger(index) || index < 0) throw new Error('fxInspector.missing');
  if (scope === 'master') {
    const effect = project.masterEffects[index];
    if (!effect) throw new Error('fxInspector.missing');
    return { effect, locked: false, start: 0, end: project.duration };
  }
  if (scope.startsWith('clip:')) {
    for (const track of project.tracks) {
      const clip = track.segments.find(c => c.id === scope.slice(5));
      if (!clip) continue;
      const effect = clip.effects[index];
      if (!effect) throw new Error('fxInspector.missing');
      return { effect, locked: !!track.locked, start: clip.startTime, end: clip.startTime + clip.duration };
    }
  }
  throw new Error('fxInspector.missing');
}
const canonical = (automation: EffectConfig['automation']) => Object.fromEntries(effectParameters.flatMap(key => {
  const points = normalizeGainPoints(automation?.[key]).map(point => ({
    time:point.time,value:point.value,
    ...(point.curve==='step'?{curve:'step' as const}:{}),
    ...(point.shapeReview?{shapeReview:point.shapeReview}:{}),
  }));
  return points.length ? [[key, points]] : [];
}));
/** Draft publication is atomic; clocks remain absolute project seconds in every rack. */
export function applyScopedAutomation(snapshot: TimelineProject, current: TimelineProject, scope: string, index: number, original: EffectConfig, automation: EffectConfig['automation'], recording = false): TimelineProject {
  if (current !== snapshot) throw new Error('fxInspector.stale');
  const target = scopedEffect(current, scope, index);
  if (target.effect !== original) throw new Error('fxInspector.stale');
  if (recording || target.locked) throw new Error('fxInspector.protected');
  if (!effectParameters.some(key => supportsEffectParameter(original.type, key)) || !validEffectAutomation({ ...original, automation })) throw new Error('fxInspector.invalid');
  const next = canonical(automation), before = canonical(original.automation);
  if (JSON.stringify(next) === JSON.stringify(before)) return current;
  const revised: NonNullable<EffectConfig['automation']> = {...original.automation};
  for (const key of effectParameters) {
    if (JSON.stringify(next[key]) === JSON.stringify(before[key])) continue;
    if (next[key]?.length) revised[key] = structuredClone(next[key]);
    else delete revised[key];
  }
  const effect = { ...original, automation: Object.keys(revised).length ? revised : undefined };
  if (scope === 'master') return { ...current, masterEffects: current.masterEffects.map((e, i) => i === index ? effect : e) };
  const id = scope.slice(5);
  return { ...current, tracks: current.tracks.map(track => track.segments.some(c => c.id === id) ? { ...track, segments: track.segments.map(clip => clip.id === id ? { ...clip, effects: clip.effects.map((e, i) => i === index ? effect : e) } : clip) } : track) };
}

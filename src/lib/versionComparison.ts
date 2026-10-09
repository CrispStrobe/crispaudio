/** Compare stable three-part release versions numerically, including 9 → 10. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (version: string) => /^v?\d+\.\d+\.\d+$/.test(version)
    ? version.replace(/^v/, '').split('.').map(Number) : null;
  const next = parse(candidate), previous = parse(current);
  if (!next || !previous || ![...next, ...previous].every(Number.isSafeInteger)) return false;
  for (let i = 0; i < 3; i++) if (next[i] !== previous[i]) return next[i] > previous[i];
  return false;
}

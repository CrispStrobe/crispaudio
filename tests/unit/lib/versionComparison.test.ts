import { expect, it } from 'vitest';
import { isNewerVersion } from '../../../src/lib/versionComparison';
it('orders stable releases numerically across multi-digit version boundaries', () => {
  expect(isNewerVersion('0.7.10', '0.7.9')).toBe(true);
  expect(isNewerVersion('0.7.9', '0.7.10')).toBe(false);
  expect(isNewerVersion('v0.8.0', '0.7.10')).toBe(true);
  expect(isNewerVersion('1.0.0', '0.10.0')).toBe(true);
  expect(isNewerVersion('0.7.10', '0.7.10')).toBe(false);
});
it('ignores malformed or nonstable release tags', () => {
  expect(isNewerVersion('unknown', '0.7.10')).toBe(false);
  expect(isNewerVersion('0.7.11-beta', '0.7.10')).toBe(false);
  expect(isNewerVersion('0.7.11', 'unknown')).toBe(false);
});

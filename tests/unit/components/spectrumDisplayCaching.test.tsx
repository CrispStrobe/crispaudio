import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SpectrumDisplay } from '../../../src/components/shared/SpectrumDisplay';
import { computeSpectrumBars } from '../../../src/audio/utils/fft';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/audio/utils/fft', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/audio/utils/fft')>();
  return { ...actual, computeSpectrumBars: vi.fn(actual.computeSpectrumBars) };
});

let resize: ResizeObserverCallback;
const fillRect = vi.fn();
const fillText = vi.fn();
beforeEach(() => {
  vi.mocked(computeSpectrumBars).mockClear();
  fillRect.mockClear();
  fillText.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(), scale: vi.fn(), fillRect, fillText,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('reuses spectrum analysis on resize and label changes, invalidating on samples or bar count', () => {
  const buffer = new Float32Array([0, 1, 0, -1, 0, 1, 0, -1]);
  const { rerender } = render(<SpectrumDisplay buffer={buffer} numBars={4} noSignalText="Empty" />);
  expect(computeSpectrumBars).toHaveBeenCalledTimes(1);
  const originalBars = vi.mocked(computeSpectrumBars).mock.results[0].value;
  expect(originalBars.some((value: number) => value > 0)).toBe(true);
  fillRect.mockClear();
  act(() => resize([{ contentRect: { width: 400 } }] as ResizeObserverEntry[], {} as ResizeObserver));
  rerender(<SpectrumDisplay buffer={buffer} numBars={4} noSignalText="Leer" />);
  expect(fillRect.mock.calls.length).toBeGreaterThan(1);
  expect(computeSpectrumBars).toHaveBeenCalledTimes(1);
  rerender(<SpectrumDisplay buffer={buffer} numBars={8} />);
  expect(computeSpectrumBars).toHaveBeenCalledTimes(2);
  expect(computeSpectrumBars).toHaveBeenLastCalledWith(buffer, 8);
  const replacement = new Float32Array(8);
  fillRect.mockClear();
  rerender(<SpectrumDisplay buffer={replacement} numBars={8} />);
  expect(computeSpectrumBars).toHaveBeenCalledTimes(3);
  expect(computeSpectrumBars).toHaveBeenLastCalledWith(replacement, 8);
  expect(fillRect).toHaveBeenCalledTimes(1); // Silent spectrum: background only.
});

it('does not analyze missing or empty samples', () => {
  const { rerender } = render(<SpectrumDisplay buffer={null} noSignalText="Empty" />);
  expect(fillText.mock.calls.some(([label]) => label === 'Empty')).toBe(true);
  rerender(<SpectrumDisplay buffer={new Float32Array()} noSignalText="Leer" />);
  expect(fillText.mock.calls.some(([label]) => label === 'Leer')).toBe(true);
  expect(computeSpectrumBars).not.toHaveBeenCalled();
});

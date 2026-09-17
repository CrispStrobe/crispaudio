import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AmplitudeDisplay } from '../../../src/components/shared/AmplitudeDisplay';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let resize: ResizeObserverCallback;
const text = vi.fn();
beforeEach(() => {
  text.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(), scale: vi.fn(), fillRect: vi.fn(), fillText: text,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('reuses statistics on resize and label changes but analyzes replacement samples', () => {
  let sampleReads = 0;
  const buffer = new Proxy(new Float32Array([0.5, -0.5]), {
    get(target, property) {
      if (typeof property === 'string' && /^\d+$/.test(property)) sampleReads++;
      return Reflect.get(target, property, target);
    },
  });
  const { rerender } = render(<AmplitudeDisplay buffer={buffer} noSignalText="Empty" />);
  expect(sampleReads).toBe(2);
  expect(text.mock.calls.some(([label]) => label === '-6.0dB')).toBe(true);
  text.mockClear();
  act(() => resize([{ contentRect: { width: 400 } }] as ResizeObserverEntry[], {} as ResizeObserver));
  rerender(<AmplitudeDisplay buffer={buffer} noSignalText="Leer" />);
  expect(text).toHaveBeenCalled();
  expect(sampleReads).toBe(2);
  text.mockClear();
  rerender(<AmplitudeDisplay buffer={new Float32Array([1, -1])} />);
  expect(text.mock.calls.some(([label]) => label === '0.0dB')).toBe(true);
});

it('keeps empty and silent buffers safe', () => {
  const { rerender } = render(<AmplitudeDisplay buffer={null} noSignalText="Empty" />);
  expect(text.mock.calls.some(([label]) => label === 'Empty')).toBe(true);
  rerender(<AmplitudeDisplay buffer={new Float32Array()} noSignalText="Empty" />);
  text.mockClear();
  rerender(<AmplitudeDisplay buffer={new Float32Array(4)} />);
  expect(text.mock.calls.some(([label]) => label === '-100.0dB')).toBe(true);
});

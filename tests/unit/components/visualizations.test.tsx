// ---------------------------------------------------------------------------
// Visualization component smoke tests
// ---------------------------------------------------------------------------
// Verify that SpectrumDisplay, AmplitudeDisplay, EnvelopeDisplay, and
// ADSRDisplay render without errors with both null/default and sample data.
// ---------------------------------------------------------------------------

import React from 'react';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Global mocks (same pattern as smoke.test.tsx)
// ---------------------------------------------------------------------------

let rafId = 0;
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = (() => ++rafId) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;

  // Mock canvas getContext
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  // Mock matchMedia
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRAF;
  globalThis.cancelAnimationFrame = originalCAF;
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Mock the FFT utility used by SpectrumDisplay
// ---------------------------------------------------------------------------

vi.mock('../../../src/audio/utils/fft', () => ({
  computeSpectrumBars: (buffer: Float32Array, numBars: number) => {
    return new Float32Array(numBars).fill(0.5);
  },
}));

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleBuffer = new Float32Array(
  Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 256)),
);

// ---------------------------------------------------------------------------
// SpectrumDisplay
// ---------------------------------------------------------------------------

describe('SpectrumDisplay -- smoke', () => {
  it('renders without throwing (null buffer)', async () => {
    const { SpectrumDisplay } = await import(
      '../../../src/components/shared/SpectrumDisplay'
    );
    const { container } = render(<SpectrumDisplay buffer={null} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with sample data', async () => {
    const { SpectrumDisplay } = await import(
      '../../../src/components/shared/SpectrumDisplay'
    );
    const { container } = render(<SpectrumDisplay buffer={sampleBuffer} numBars={16} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('canvas element is present in the DOM', async () => {
    const { SpectrumDisplay } = await import(
      '../../../src/components/shared/SpectrumDisplay'
    );
    const { container } = render(<SpectrumDisplay buffer={sampleBuffer} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
  });
});

// ---------------------------------------------------------------------------
// AmplitudeDisplay
// ---------------------------------------------------------------------------

describe('AmplitudeDisplay -- smoke', () => {
  it('renders without throwing (null buffer)', async () => {
    const { AmplitudeDisplay } = await import(
      '../../../src/components/shared/AmplitudeDisplay'
    );
    const { container } = render(<AmplitudeDisplay buffer={null} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with sample data', async () => {
    const { AmplitudeDisplay } = await import(
      '../../../src/components/shared/AmplitudeDisplay'
    );
    const { container } = render(<AmplitudeDisplay buffer={sampleBuffer} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('canvas element is present in the DOM', async () => {
    const { AmplitudeDisplay } = await import(
      '../../../src/components/shared/AmplitudeDisplay'
    );
    const { container } = render(<AmplitudeDisplay buffer={sampleBuffer} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
  });
});

// ---------------------------------------------------------------------------
// EnvelopeDisplay
// ---------------------------------------------------------------------------

describe('EnvelopeDisplay -- smoke', () => {
  it('renders without throwing (null buffer)', async () => {
    const { EnvelopeDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(<EnvelopeDisplay buffer={null} sampleRate={44100} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with sample data', async () => {
    const { EnvelopeDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <EnvelopeDisplay buffer={sampleBuffer} sampleRate={44100} />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('canvas element is present in the DOM', async () => {
    const { EnvelopeDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <EnvelopeDisplay buffer={sampleBuffer} sampleRate={22050} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
  });
});

// ---------------------------------------------------------------------------
// ADSRDisplay
// ---------------------------------------------------------------------------

describe('ADSRDisplay -- smoke', () => {
  it('renders without throwing (default/zero params)', async () => {
    const { ADSRDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <ADSRDisplay attack={0} sustain={0} decay={0} punch={0} />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with typical ADSR values', async () => {
    const { ADSRDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <ADSRDisplay attack={0.5} sustain={1.0} decay={0.8} punch={0.3} />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with punch > 0 (punch indicator path)', async () => {
    const { ADSRDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <ADSRDisplay attack={0.2} sustain={1.5} decay={1.0} punch={1.5} />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('canvas element is present in the DOM', async () => {
    const { ADSRDisplay } = await import(
      '../../../src/components/shared/EnvelopeDisplay'
    );
    const { container } = render(
      <ADSRDisplay attack={1} sustain={1} decay={1} punch={0} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
  });
});

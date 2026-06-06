// ---------------------------------------------------------------------------
// Component smoke tests
// ---------------------------------------------------------------------------
// Verify that key components can mount without throwing errors.
// Audio APIs and animation frames are mocked since jsdom does not provide them.
// ---------------------------------------------------------------------------

import React from 'react';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Global mocks for browser APIs not available in jsdom
// ---------------------------------------------------------------------------

let rafId = 0;
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

beforeAll(() => {
  // Mock requestAnimationFrame / cancelAnimationFrame
  // Do NOT invoke callback -- useSmoothParam runs an infinite rAF loop.
  globalThis.requestAnimationFrame = (() => ++rafId) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;

  // Mock ResizeObserver
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  // Mock AudioContext
  vi.stubGlobal(
    'AudioContext',
    class {
      createGain() {
        return { gain: { value: 1 }, connect() {} };
      }
      createOscillator() {
        return { connect() {}, start() {}, stop() {}, frequency: { value: 440 } };
      }
      createAnalyser() {
        return {
          connect() {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          getByteTimeDomainData() {},
          getByteFrequencyData() {},
        };
      }
      get destination() {
        return {};
      }
      get sampleRate() {
        return 44100;
      }
      get currentTime() {
        return 0;
      }
      close() {
        return Promise.resolve();
      }
    },
  );

  // Mock canvas getContext for WaveformDisplay
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
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  // Mock window.matchMedia
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

// NOTE: ParamSlider smoke test omitted — useSmoothParam's rAF loop
// causes jsdom to hang. ParamSlider is exercised transitively through panels.

// ---------------------------------------------------------------------------
// PresetGrid
// ---------------------------------------------------------------------------

describe('PresetGrid -- smoke', () => {
  it('renders without throwing', async () => {
    const { PresetGrid } = await import('../../../src/components/shared/PresetGrid');
    render(
      <PresetGrid
        presets={[
          { name: 'laser', label: 'Laser' },
          { name: 'coin', label: 'Coin' },
        ]}
        activePreset="laser"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Laser')).toBeInTheDocument();
    expect(screen.getByText('Coin')).toBeInTheDocument();
  });

  it('shows empty state when no presets', async () => {
    const { PresetGrid } = await import('../../../src/components/shared/PresetGrid');
    render(<PresetGrid presets={[]} activePreset={null} onSelect={() => {}} />);
    expect(screen.getByText('No presets available')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WaveformDisplay
// ---------------------------------------------------------------------------

describe('WaveformDisplay -- smoke', () => {
  it('renders without throwing (no data)', async () => {
    const { WaveformDisplay } = await import('../../../src/components/shared/WaveformDisplay');
    const { container } = render(<WaveformDisplay />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with sample data', async () => {
    const { WaveformDisplay } = await import('../../../src/components/shared/WaveformDisplay');
    const samples = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
    const { container } = render(<WaveformDisplay samples={samples} height={60} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe('Modal -- smoke', () => {
  it(
    'renders when isOpen is true',
    async () => {
      const { Modal } = await import('../../../src/components/common/Modal');
      await act(async () => {
        render(
          <Modal isOpen={true} onClose={() => {}} title="Test Modal">
            <p>Modal content</p>
          </Modal>,
        );
        // Wait for the 50ms focus setTimeout inside Modal to fire
        await new Promise((r) => setTimeout(r, 100));
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    },
    15_000,
  );

  it('does not render when isOpen is false', async () => {
    const { Modal } = await import('../../../src/components/common/Modal');
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        <p>Should not appear</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

describe('ErrorBoundary -- smoke', () => {
  it('renders children when no error', async () => {
    const { ErrorBoundary } = await import('../../../src/components/common/ErrorBoundary');
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows error UI when child throws', async () => {
    const { ErrorBoundary } = await import('../../../src/components/common/ErrorBoundary');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ThrowingComponent(): React.ReactElement {
      throw new Error('Test explosion');
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
    expect(screen.getByText('Reload App')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

describe('AppShell -- smoke', () => {
  it(
    'renders children inside main content area',
    async () => {
      const { AppShell } = await import('../../../src/components/layout/AppShell');
      await act(async () => {
        render(
          <AppShell>
            <div data-testid="app-content">Main Content</div>
          </AppShell>,
        );
      });
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
      expect(screen.getByText('Main Content')).toBeInTheDocument();
    },
    15_000,
  );

  it(
    'has skip-to-content link for accessibility',
    async () => {
      const { AppShell } = await import('../../../src/components/layout/AppShell');
      await act(async () => {
        render(
          <AppShell>
            <div>Content</div>
          </AppShell>,
        );
      });
      const skipLinks = screen.getAllByText('Skip to content');
      expect(skipLinks.length).toBeGreaterThanOrEqual(1);
    },
    15_000,
  );
});

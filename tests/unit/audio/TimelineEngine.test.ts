// ---------------------------------------------------------------------------
// TimelineEngine unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';

// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

describe('TimelineEngine module', () => {
  it('exports TimelineEngine class', () => {
    expect(TimelineEngine).toBeDefined();
    expect(typeof TimelineEngine).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Public API surface (structural checks — no real AudioContext in jsdom)
// ---------------------------------------------------------------------------

describe('TimelineEngine API', () => {
  const proto = TimelineEngine.prototype as unknown as Record<string, unknown>;

  it('has play method', () => {
    expect(typeof proto['play']).toBe('function');
  });

  it('has stop method', () => {
    expect(typeof proto['stop']).toBe('function');
  });

  it('has renderToBuffer method', () => {
    expect(typeof proto['renderToBuffer']).toBe('function');
  });

  it('renderToBuffer is async', () => {
    expect(proto['renderToBuffer']!.constructor.name).toBe('AsyncFunction');
  });

  it('has setSources method', () => {
    expect(typeof proto['setSources']).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Internal structure
// ---------------------------------------------------------------------------

describe('TimelineEngine internal structure', () => {
  const proto = TimelineEngine.prototype as unknown as Record<string, unknown>;

  it('has applyEffects method on prototype', () => {
    expect(typeof proto['applyEffects']).toBe('function');
  });

  it('has applyFade method on prototype', () => {
    expect(typeof proto['applyFade']).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Constructor parameter expectations
// ---------------------------------------------------------------------------

describe('TimelineEngine constructor', () => {
  it('constructor expects at least one argument (AudioContext)', () => {
    // The constructor signature requires an AudioContext.
    // We verify the .length of the constructor to confirm it expects params.
    expect(TimelineEngine.length).toBeGreaterThanOrEqual(1);
  });
});

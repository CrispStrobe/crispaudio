// ---------------------------------------------------------------------------
// VoiceEngine unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { VoiceEngine } from '../../../src/audio/engine/VoiceEngine';

// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

describe('VoiceEngine module', () => {
  it('exports VoiceEngine class', () => {
    expect(VoiceEngine).toBeDefined();
    expect(typeof VoiceEngine).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

describe('VoiceEngine instantiation', () => {
  it('can be constructed with no arguments', () => {
    const engine = new VoiceEngine();
    expect(engine).toBeInstanceOf(VoiceEngine);
  });

  it('creates distinct instances', () => {
    const a = new VoiceEngine();
    const b = new VoiceEngine();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

describe('VoiceEngine API', () => {
  it('has a processAudio method', () => {
    const engine = new VoiceEngine();
    expect(typeof engine.processAudio).toBe('function');
  });

  it('processAudio is an async function (returns a thenable)', () => {
    // Verify the method name exists on the prototype
    expect(VoiceEngine.prototype.processAudio).toBeDefined();
    // AsyncFunction constructor name check
    const descriptor = Object.getOwnPropertyDescriptor(
      VoiceEngine.prototype,
      'processAudio',
    );
    expect(descriptor).toBeDefined();
    expect(descriptor!.value.constructor.name).toBe('AsyncFunction');
  });
});

// ---------------------------------------------------------------------------
// Private methods exist on prototype (structural check)
// ---------------------------------------------------------------------------

describe('VoiceEngine internal structure', () => {
  // Private methods are still present on the JS prototype at runtime.
  // We verify they exist to catch accidental renames or removals.

  const proto = VoiceEngine.prototype as unknown as Record<string, unknown>;

  it('has buildChain method on prototype', () => {
    expect(typeof proto['buildChain']).toBe('function');
  });

  it('has buildVocoder method on prototype', () => {
    expect(typeof proto['buildVocoder']).toBe('function');
  });

  it('has buildTremolo method on prototype', () => {
    expect(typeof proto['buildTremolo']).toBe('function');
  });

  it('has buildCompressor method on prototype', () => {
    expect(typeof proto['buildCompressor']).toBe('function');
  });

  it('has buildNoiseGate method on prototype', () => {
    expect(typeof proto['buildNoiseGate']).toBe('function');
  });
});

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParamSlider } from '../../../src/components/shared/ParamSlider';

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  nextFrame = 0;
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function frame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(0));
  });
}

const onChange = vi.fn();
const slider = (value: number) => <ParamSlider label="Gain" value={value} onChange={onChange} />;

describe('ParamSlider animation', () => {
  it('cancels hidden animation and catches up to the latest target when visible', () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { rerender } = render(slider(0));
    rerender(slider(1));
    frame();
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
    rerender(slider(0.75));
    expect(frames.size).toBe(0);
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByText('0.75')).toBeInTheDocument();
    expect(frames.size).toBe(0);
    rerender(slider(0.5));
    expect(frames.size).toBe(1);
  });
  it('animates changed targets to an exact resting value without an idle loop', () => {
    const { rerender } = render(slider(0));
    rerender(slider(1));
    expect(frames.size).toBe(1);
    frame();
    expect(screen.getByText('0.12')).toBeInTheDocument();
    for (let i = 0; i < 100 && frames.size; i++) frame();
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(frames.size).toBe(0);
    const calls = vi.mocked(requestAnimationFrame).mock.calls.length;
    frame();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(calls);
    rerender(slider(0.5));
    expect(frames.size).toBe(1);
    for (let i = 0; i < 100 && frames.size; i++) frame();
    expect(screen.getByText('0.50')).toBeInTheDocument();
    expect(frames.size).toBe(0);
  });
  it('keeps only one pending frame when the target changes mid-animation', () => {
    const { rerender } = render(slider(0));
    rerender(slider(1));
    frame();
    rerender(slider(0.5));
    expect(frames.size).toBe(1);
    for (let i = 0; i < 100 && frames.size; i++) frame();
    expect(screen.getByText('0.50')).toBeInTheDocument();
    expect(frames.size).toBe(0);
  });

  it('cancels animation and removes visibility listeners on unmount in StrictMode', () => {
    const { rerender, unmount } = render(<React.StrictMode>{slider(0)}</React.StrictMode>);
    rerender(<React.StrictMode>{slider(1)}</React.StrictMode>);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    const calls = vi.mocked(requestAnimationFrame).mock.calls.length;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(calls);
  });

  it('does not animate changes while mounted hidden', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { rerender } = render(slider(0));
    rerender(slider(1));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not schedule animation frames while already at its target', () => {
    render(slider(0.5));
    expect(screen.getByText('0.50')).toBeInTheDocument();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    frame();
    expect(frames.size).toBe(0);
  });
});

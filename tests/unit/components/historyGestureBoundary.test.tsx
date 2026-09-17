import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryGestureBoundary } from '../../../src/components/shared/HistoryGestureBoundary';

interface Gesture {
  begin: ReturnType<typeof vi.fn<() => void>>;
  end: ReturnType<typeof vi.fn<() => void>>;
}

let gesture: Gesture;

beforeEach(() => {
  gesture = { begin: vi.fn(), end: vi.fn() };
});

afterEach(() => {
  cleanup();
});

const boundary = (children: React.ReactNode) => (
  <HistoryGestureBoundary gesture={gesture}>{children}</HistoryGestureBoundary>
);

const input = () => screen.getByLabelText('Level') as HTMLInputElement;
const fire = (element: Element, type: string, init?: EventInit) => {
  act(() => {
    element.dispatchEvent(new Event(type, { bubbles: true, ...init }));
  });
};

describe('HistoryGestureBoundary — range inputs', () => {
  it('ignores releases from another pointer or during a keyboard gesture', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    const pointer = (target: EventTarget, type: string, pointerId: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      act(() => { target.dispatchEvent(event); });
    };
    pointer(input(), 'pointerdown', 1);
    pointer(window, 'pointerup', 2);
    pointer(window, 'pointercancel', 2);
    expect(gesture.end).not.toHaveBeenCalled();
    pointer(window, 'pointerup', 1);
    expect(gesture.end).toHaveBeenCalledTimes(1);
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    pointer(window, 'pointerup', 1);
    expect(gesture.end).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); });
    expect(gesture.end).toHaveBeenCalledTimes(2);
  });
  it('ignores buttons, text inputs, disabled ranges, and non-adjustment keys', () => {
    render(boundary(<>
      <input aria-label="Level" type="range" />
      <input aria-label="Name" type="text" />
      <input aria-label="Disabled" type="range" disabled />
      <button>Lock</button>
    </>));
    for (const element of [screen.getByRole('button'), screen.getByLabelText('Name'), screen.getByLabelText('Disabled')]) {
      fire(element, 'pointerdown');
      act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    }
    for (const key of ['Tab', 'Enter', 'a', 'Escape', ' ']) {
      act(() => input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    }
    expect(gesture.begin).not.toHaveBeenCalled();
    expect(gesture.end).not.toHaveBeenCalled();
  });
  it('ends an active gesture exactly once on unmount', () => {
    const { unmount } = render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    unmount();
    expect(gesture.end).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it('does not end a new gesture when the previously focused control blurs', () => {
    render(boundary(<><input aria-label="Level" type="range" /><input aria-label="Name" /></>));
    fire(input(), 'pointerdown');
    fire(screen.getByLabelText('Name'), 'blur');
    expect(gesture.end).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('blur')));
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it('keeps a pointer gesture active through unrelated key releases', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));
    expect(gesture.end).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('pointercancel')));
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it('begins on pointer down and ends on window pointerup', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    expect(gesture.begin).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it('ends on pointercancel and blur', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    fire(input(), 'pointercancel');
    expect(gesture.end).toHaveBeenCalledTimes(1);
    fire(input(), 'blur');
    expect(gesture.end).toHaveBeenCalledTimes(1);
    fire(input(), 'pointerdown');
    act(() => {
      input().dispatchEvent(new FocusEvent('blur'));
    });
    expect(gesture.end).toHaveBeenCalledTimes(2);
  });

  it('ends when focus leaves the active range', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    fire(input(), 'focusout');
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])(
    'groups repeated %s changes before child handlers run', key => {
      const changes = vi.fn(() => expect(gesture.begin).toHaveBeenCalledTimes(1));
      render(boundary(<input aria-label="Level" type="range" onKeyDown={changes} />));
      act(() => {
        input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, repeat: true }));
      });
      expect(changes).toHaveBeenCalledTimes(2);
      expect(gesture.end).not.toHaveBeenCalled();
      act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key })));
      expect(gesture.end).toHaveBeenCalledTimes(1);
    },
  );

  it('captures pointer release outside the boundary even when propagation is stopped', () => {
    render(<>{boundary(<input aria-label="Level" type="range" onPointerDown={() => expect(gesture.begin).toHaveBeenCalledTimes(1)} />)}
      <button onPointerUp={event => event.stopPropagation()}>Outside</button>
    </>);
    fire(input(), 'pointerdown');
    fire(screen.getByRole('button'), 'pointerup');
    expect(gesture.end).toHaveBeenCalledTimes(1);
    fire(input(), 'pointercancel');
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });

  it('cleans up the original controller after props change during a gesture', () => {
    const original = gesture;
    const { rerender, unmount } = render(boundary(<input aria-label="Level" type="range" />));
    fire(input(), 'pointerdown');
    gesture = { begin: vi.fn(), end: vi.fn() };
    rerender(boundary(<input aria-label="Level" type="range" />));
    expect(original.end).not.toHaveBeenCalled();
    unmount();
    expect(original.end).toHaveBeenCalledTimes(1);
    expect(gesture.end).not.toHaveBeenCalled();
  });

  it('does not end an inactive gesture on StrictMode mount or unmount', () => {
    const { unmount } = render(<React.StrictMode>{boundary(<input aria-label="Level" type="range" />)}</React.StrictMode>);
    unmount();
    expect(gesture.begin).not.toHaveBeenCalled();
    expect(gesture.end).not.toHaveBeenCalled();
  });

  it('begins on keyboard interaction and ends on keyup', () => {
    render(boundary(<input aria-label="Level" type="range" />));
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(gesture.begin).toHaveBeenCalledTimes(1);
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    });
    expect(gesture.end).toHaveBeenCalledTimes(1);
  });
});

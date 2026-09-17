import React, { useCallback, useEffect, useRef } from 'react';

interface HistoryGestureBoundaryProps {
  gesture: { begin: () => void; end: () => void };
  children: React.ReactNode;
}

const adjustmentKeys = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End',
]);

function isRange(target: EventTarget): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'range' && !target.disabled;
}

/** Group native range edits without changing each control's props or layout. */
export function HistoryGestureBoundary({ gesture, children }: HistoryGestureBoundaryProps) {
  const active = useRef<{ input: HTMLInputElement; key?: string; pointerId?: number; end: () => void } | null>(null);
  const end = useCallback(() => {
    const pending = active.current;
    if (!pending) return;
    active.current = null;
    pending.end();
  }, []);
  const begin = (input: HTMLInputElement, key?: string, pointerId?: number) => {
    if (active.current) return;
    active.current = { input, key, pointerId, end: gesture.end };
    gesture.begin();
  };

  useEffect(() => {
    const onBlur = (event: FocusEvent) => {
      // Pointer capture runs before the previously focused control loses focus.
      if (event.target === event.currentTarget || event.target === active.current?.input) end();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (active.current?.key === event.key) end();
    };
    const onPointerEnd = (event: PointerEvent) => {
      const pending = active.current;
      if (pending && pending.key === undefined && pending.pointerId === event.pointerId) end();
    };
    window.addEventListener('pointerup', onPointerEnd, true);
    window.addEventListener('pointercancel', onPointerEnd, true);
    window.addEventListener('blur', onBlur, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd, true);
      window.removeEventListener('pointercancel', onPointerEnd, true);
      window.removeEventListener('blur', onBlur, true);
      window.removeEventListener('keyup', onKeyUp, true);
      end();
    };
  }, [end]);

  return (
    <div
      className="contents"
      onBlurCapture={event => {
        if (event.target === active.current?.input) end();
      }}
      onPointerDownCapture={event => {
        if (isRange(event.target)) begin(event.target, undefined, event.pointerId);
      }}
      onKeyDownCapture={event => {
        if (isRange(event.target) && adjustmentKeys.has(event.key)) begin(event.target, event.key);
      }}
    >
      {children}
    </div>
  );
}

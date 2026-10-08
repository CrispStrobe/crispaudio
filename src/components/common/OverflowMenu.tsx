import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis } from 'lucide-react';

/** A toolbar menu that stays outside scrolling/clipping containers. */
export function OverflowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const button = trigger.current, menu = panel.current;
    if (!button || !menu) return;
    const place = () => {
      const anchor = button.getBoundingClientRect();
      const width = Math.min(256, window.innerWidth - 16);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
      menu.style.maxHeight = `${Math.max(44, window.innerHeight - 16)}px`;
      const height = menu.getBoundingClientRect().height;
      menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - height - 8))}px`;
    };
    place();
    (menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? menu).focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !button.contains(event.target)) close();
    };
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, close]);
  return <>
    <button ref={trigger} type="button" className="timeline-tool icon-tool" title={label} aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}><Ellipsis size={18} aria-hidden="true" /></button>
    {open && createPortal(<div ref={panel} id={id} role="menu" tabIndex={-1} aria-label={label}
      className="fixed z-[60] select-none p-2 rounded-xl border border-gray-700 bg-gray-900 shadow-xl space-y-2 overflow-y-auto"
      onClick={event => { if ((event.target as HTMLElement).closest('[role="menuitem"]:not(:disabled)')) close(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(true); }
        else if (event.key === 'Tab') { close(true); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>{children}</div>, document.body)}
  </>;
}

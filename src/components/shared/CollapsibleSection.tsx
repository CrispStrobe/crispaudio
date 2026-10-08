import { useState, type ReactNode } from 'react';

/** Unmount expensive charts while closed; remount at the visible canvas size. */
export function CollapsibleSection({ title, children, defaultOpen = false, className = '' }: {
  title: string; children: ReactNode; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <details className={`card mb-4 ${className}`} open={open}>
    <summary onClick={e => {e.preventDefault(); setOpen(value => !value);}} className="text-sm font-semibold cursor-pointer py-1 text-gray-300">{title}</summary>
    {open && <div className="mt-3">{children}</div>}
  </details>;
}

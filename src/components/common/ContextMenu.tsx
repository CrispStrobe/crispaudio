import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuItem {
  label?: string;
  icon?: LucideIcon;
  shortcut?: string;
  onClick?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') onClose();
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    };
  }, [onClose]);

  // Focus first item on mount, keyboard nav
  useEffect(() => {
    firstItemRef.current?.focus();
  }, []);

  // Adjust position to stay in viewport
  const { x, y } = position;
  const menuWidth = 200;
  const menuItemH = 28;
  const actionItems = items.filter(i => !i.divider);
  const estimatedH = actionItems.length * menuItemH + items.filter(i => i.divider).length * 9 + 8;

  const adjustedX = typeof window !== 'undefined'
    ? Math.min(x, window.innerWidth - menuWidth - 8)
    : x;
  const adjustedY = typeof window !== 'undefined'
    ? Math.min(y, window.innerHeight - estimatedH - 8)
    : y;

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled || !item.onClick) return;
      item.onClick();
      onClose();
    },
    [onClose]
  );

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])'
      );
      if (!buttons) return;
      const arr = Array.from(buttons);
      const cur = arr.indexOf(e.currentTarget);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        arr[(cur + 1) % arr.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        arr[(cur - 1 + arr.length) % arr.length]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.currentTarget.click();
      }
    },
    []
  );

  let actionIdx = -1;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed z-[9999]"
      style={{ top: adjustedY, left: adjustedX }}
    >
      <div
        className="
          min-w-[180px] py-1
          bg-gray-850 bg-gray-900 border border-gray-700/80
          rounded-lg shadow-2xl shadow-black/70
          backdrop-blur-sm
        "
        style={{ animation: 'ctxIn 0.1s ease-out both' }}
      >
        {items.map((item, i) => {
          // Divider
          if (item.divider) {
            return (
              <div
                key={`divider-${i}`}
                className="my-1 border-t border-gray-700/60"
                role="separator"
              />
            );
          }

          actionIdx++;
          const isFirst = actionIdx === 0;
          const Icon = item.icon;

          return (
            <button
              key={`item-${i}`}
              ref={isFirst ? firstItemRef : undefined}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              onKeyDown={e => handleKeyNav(e, actionIdx)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-1.5
                text-left text-sm leading-none
                transition-colors duration-75
                focus:outline-none
                ${item.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-300 hover:bg-indigo-600/30 hover:text-white focus-visible:bg-indigo-600/30 focus-visible:text-white cursor-pointer'}
              `}
            >
              {Icon ? (
                <Icon
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    item.disabled ? 'text-gray-700' : 'text-gray-500'
                  }`}
                />
              ) : (
                <span className="w-3.5 flex-shrink-0" />
              )}

              <span className="flex-1 truncate">{item.label}</span>

              {item.shortcut && (
                <kbd className="flex-shrink-0 ml-auto text-[10px] font-mono text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 leading-none">
                  {item.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes ctxIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default ContextMenu;

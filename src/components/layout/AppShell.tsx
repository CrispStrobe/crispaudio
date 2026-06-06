// ---------------------------------------------------------------------------
// CrispAudio — AppShell
// Root layout: sidebar | main content area, with status bar at bottom.
// On mobile (< md), sidebar is hidden behind a hamburger toggle.
// ---------------------------------------------------------------------------

import React from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { useUIStore } from '../../stores/uiStore';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <div
      className="flex flex-col"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-indigo-600 focus:text-white focus:rounded">Skip to content</a>

      {/* Mobile hamburger button */}
      <button
        onClick={toggleSidebar}
        className="md:hidden fixed top-3 left-3 z-40 btn-ghost flex items-center justify-center rounded-lg"
        style={{
          width: 40,
          height: 40,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
        aria-label="Toggle navigation menu"
      >
        <Menu size={20} />
      </button>

      {/* Top row: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        <Sidebar mobileOpen={sidebarCollapsed} onClose={toggleSidebar} />
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-hidden md:overflow-hidden overflow-y-auto"
          style={{ background: 'var(--bg-primary)' }}
        >
          {children}
        </main>
      </div>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CrispAudio — AppShell
// Root layout: sidebar | main content area, with status bar at bottom.
// ---------------------------------------------------------------------------

import React from 'react';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="flex flex-col"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0f172a' }}
    >
      {/* Top row: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          className="flex-1 min-w-0 overflow-hidden"
          style={{ background: '#0f172a' }}
        >
          {children}
        </main>
      </div>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  );
}

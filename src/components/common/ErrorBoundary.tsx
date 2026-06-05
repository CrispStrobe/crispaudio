// ---------------------------------------------------------------------------
// CrispAudio — ErrorBoundary
// Catches unhandled runtime errors and shows a recovery UI.
// ---------------------------------------------------------------------------

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('CrispAudio error boundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg-primary, #0f172a)',
            color: 'var(--text-primary, #f1f5f9)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <svg viewBox="0 0 32 32" width="48" height="48" fill="none" style={{ marginBottom: 16 }}>
            <circle cx="16" cy="16" r="12" fill="#3b82f6" opacity="0.15" />
            <path d="M8 16 Q11 10 16 16 Q21 22 24 16" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #94a3b8)', maxWidth: 400, marginBottom: 16 }}>
            CrispAudio encountered an unexpected error. Your work may not be saved.
          </p>
          <pre
            style={{
              fontSize: 12,
              color: '#ef4444',
              background: 'var(--bg-secondary, #1e293b)',
              padding: '12px 16px',
              borderRadius: 8,
              maxWidth: 500,
              overflow: 'auto',
              marginBottom: 16,
              textAlign: 'left',
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

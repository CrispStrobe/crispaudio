// ---------------------------------------------------------------------------
// Theme color helper for canvas rendering
// Reads CSS custom properties so canvases adapt to light/dark theme.
// ---------------------------------------------------------------------------

/** Read a CSS custom property from the document root. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface CanvasTheme {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  isLight: boolean;
}

/** Get current theme colors for canvas rendering. */
export function getCanvasTheme(): CanvasTheme {
  const isLight = document.documentElement.classList.contains('light');
  return {
    bgPrimary: cssVar('--bg-primary') || (isLight ? '#f8fafc' : '#0f172a'),
    bgSecondary: cssVar('--bg-secondary') || (isLight ? '#e2e8f0' : '#1e293b'),
    bgTertiary: cssVar('--bg-tertiary') || (isLight ? '#cbd5e1' : '#334155'),
    textMuted: cssVar('--text-muted') || (isLight ? '#475569' : '#94a3b8'),
    border: cssVar('--border') || (isLight ? '#94a3b8' : '#475569'),
    borderSubtle: cssVar('--border-subtle') || (isLight ? '#e2e8f0' : '#1e2d40'),
    isLight,
  };
}

/** Canvas background gradient (top to bottom). */
export function canvasBgGradient(ctx: CanvasRenderingContext2D, h: number): CanvasGradient {
  const theme = getCanvasTheme();
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  if (theme.isLight) {
    gradient.addColorStop(0, '#f1f5f9');
    gradient.addColorStop(1, '#e2e8f0');
  } else {
    gradient.addColorStop(0, '#1f2937');
    gradient.addColorStop(1, '#111827');
  }
  return gradient;
}

/** Canvas flat background color. */
export function canvasBgFlat(): string {
  return getCanvasTheme().isLight ? '#e2e8f0' : '#111827';
}

/** Canvas grid line color. */
export function canvasGridColor(): string {
  return getCanvasTheme().isLight ? '#cbd5e1' : '#374151';
}

/** Canvas text color for labels. */
export function canvasTextColor(): string {
  return getCanvasTheme().isLight ? '#475569' : '#9ca3af';
}

/** Canvas "no signal" text color. */
export function canvasEmptyColor(): string {
  return getCanvasTheme().isLight ? '#94a3b8' : '#6b7280';
}

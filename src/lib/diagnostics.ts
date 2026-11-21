// In-memory diagnostics for user-initiated feedback. Nothing is stored on disk
// or sent anywhere automatically: the user copies, saves or attaches the report.
// Messages are redacted (home folders, iOS container IDs, file names in paths)
// because errors often quote the user's media paths.

export const APP_VERSION = '0.13.68';
export const FEEDBACK_URL = 'https://github.com/CrispStrobe/crispaudio/issues/new';

const MAX_ENTRIES = 200, MAX_MESSAGE = 600;
export interface DiagnosticEntry { time: string; level: 'error' | 'warn'; message: string }
const entries: DiagnosticEntry[] = [];
let installed = false;

/** Removes personal path segments while keeping the extension, which helps debugging. */
export function redact(text: string): string {
  return text
    .replace(/\/(?:Users|home)\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s'"]+/g, '~')
    .replace(/\/(?:private\/)?var\/mobile\/Containers\/(?:Data|Shared)\/[^/\s]+\/[0-9A-Fa-f-]{36}/g, '<app>')
    // Folder and file names inside user locations can name clients or projects:
    // collapse the whole path, keeping only the extension.
    // A path ending in a file extension may contain spaces; otherwise stop at whitespace.
    .replace(/(~|<app>|\/Volumes|\/private|\/var|\/tmp)[/\\][^'"\n]*?(\.[A-Za-z0-9]{1,8})(?=$|[\s'",):])/g, '$1/…$2')
    .replace(/(~|<app>|\/Volumes|\/private|\/var|\/tmp)(?:[/\\](?!…)[^/\\\s'"]+)+/g, '$1/…');
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split('\n').slice(1, 6).join('\n')}` : ''}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function recordDiagnostic(level: DiagnosticEntry['level'], ...values: unknown[]) {
  const message = redact(values.map(describe).join(' ')).slice(0, MAX_MESSAGE);
  entries.push({ time: new Date().toISOString(), level, message });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export const diagnosticEntries = (): readonly DiagnosticEntry[] => entries;
export function clearDiagnostics() { entries.length = 0; }

/** Captures uncaught errors, rejected promises and console errors/warnings. Idempotent. */
export function installDiagnostics(target: Window = window) {
  if (installed) return;
  installed = true;
  target.addEventListener('error', event => recordDiagnostic('error', event.error ?? event.message));
  target.addEventListener('unhandledrejection', event => recordDiagnostic('error', 'Unhandled rejection:', event.reason));
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => { recordDiagnostic(level, ...values); original(...values); };
  }
}

export interface ReportContext { platform?: string; language?: string; tracks?: number; clips?: number; decodedMiB?: number }

/** Plain-text report: app/platform facts and redacted recent errors, no project names or media. */
export function diagnosticsReport(context: ReportContext = {}, now = new Date()): string {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const lines = [
    `CrispAudio ${APP_VERSION} diagnostics (${now.toISOString()})`,
    `Platform: ${context.platform ?? nav?.userAgent ?? 'unknown'}`,
    `Language: ${context.language ?? nav?.language ?? 'unknown'}`,
    typeof window === 'undefined' ? '' : `Screen: ${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio}x`,
    context.tracks === undefined ? '' : `Session: ${context.tracks} tracks, ${context.clips ?? 0} clips, ${context.decodedMiB ?? 0} MiB decoded audio`,
    '',
    entries.length ? `Recent errors and warnings (${entries.length}):` : 'No errors or warnings recorded in this session.',
    ...entries.map(e => `[${e.time}] ${e.level.toUpperCase()} ${e.message}`),
  ];
  return lines.filter((line, i) => line !== '' || i === 5).join('\n'); // keep one blank separator
}

/** GitHub issue URL; the body keeps the newest log lines within a safe URL length. */
export function feedbackUrl(report: string, title = 'Feedback: '): string {
  const header = 'Describe what you did, what you expected and what happened:\n\n\n\n<details><summary>Diagnostics</summary>\n\n```\n';
  const footer = '\n```\n</details>\n';
  let body = report;
  const make = () => `${FEEDBACK_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(header + body + footer)}`;
  // Keep the facts at the top and drop the oldest log lines until it fits.
  while (make().length > 7000 && body.includes('\n')) {
    const lines = body.split('\n'), firstLog = lines.findIndex(line => line.startsWith('['));
    if (firstLog < 0) { body = body.slice(0, 3000); break; }
    lines.splice(firstLog, 1);
    body = lines.join('\n');
  }
  return make();
}

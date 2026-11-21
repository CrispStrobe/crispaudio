import {afterEach,describe,expect,it} from 'vitest';
import {APP_VERSION,clearDiagnostics,diagnosticEntries,diagnosticsReport,feedbackUrl,recordDiagnostic,redact} from '../../../src/lib/diagnostics';
import pkg from '../../../package.json';

afterEach(()=>clearDiagnostics());
describe('diagnostics',()=>{
  it('tracks the package version',()=>{expect(APP_VERSION).toBe(pkg.version);});
  it('removes user folders and file names but keeps extensions and app script names',()=>{
    expect(redact('Failed to read /Users/anna/Podcasts/Client X/ep 1.wav')).toBe('Failed to read ~/….wav');
    expect(redact("open '/home/anna/take.flac': denied")).toBe("open '~/….flac': denied");
    expect(redact('/private/var/mobile/Containers/Data/Application/0A1B2C3D-1111-2222-3333-444455556666/Documents/Interview Smith.m4a missing')).toBe('<app>/….m4a missing');
    expect(redact('C:\\Users\\anna\\Desktop\\mix.wav')).toBe('~/….wav');
    expect(redact('/Volumes/Rec1/session/raw (2).caf,')).toBe('/Volumes/….caf,');
    expect(redact('cannot open /Users/anna/Projects/secret folder')).not.toContain('anna');
    expect(redact('at render (https://tauri.localhost/assets/index-AbC123.js:12:5)')).toContain('index-AbC123.js');
  });
  it('keeps a bounded, redacted log and reports it with session facts but no names',()=>{
    for(let i=0;i<250;i++)recordDiagnostic('warn',`warning ${i}`);
    recordDiagnostic('error',new Error('decode failed for /Users/anna/a.wav'));
    expect(diagnosticEntries()).toHaveLength(200);
    const report=diagnosticsReport({platform:'test',language:'de',tracks:3,clips:7,decodedMiB:12},new Date('2026-11-21T00:00:00Z'));
    expect(report).toContain(`CrispAudio ${APP_VERSION} diagnostics`);
    expect(report).toContain('Session: 3 tracks, 7 clips, 12 MiB decoded audio');
    expect(report).toContain('ERROR Error: decode failed for ~/….wav');
    expect(report).not.toContain('anna');
    expect(report).not.toContain('warning 0\n');
  });
  it('builds a GitHub issue link that stays within URL limits and keeps the newest entries',()=>{
    for(let i=0;i<200;i++)recordDiagnostic('error',`problem number ${i} `.repeat(10));
    const url=feedbackUrl(diagnosticsReport({platform:'test'}));
    expect(url.startsWith('https://github.com/CrispStrobe/crispaudio/issues/new?title=')).toBe(true);
    expect(url.length).toBeLessThanOrEqual(7000);
    const body=decodeURIComponent(new URL(url).searchParams.get('body')!);
    expect(body).toContain('Platform: test');
    expect(body).toContain('problem number 199');
    expect(body).not.toContain('problem number 0 ');
  });
});

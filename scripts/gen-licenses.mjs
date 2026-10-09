// ---------------------------------------------------------------------------
// gen-licenses.mjs
// Generate a third-party licenses manifest from the installed node_modules of
// the production dependencies declared in package.json. Dependency-free so it
// works offline. Output: src/generated/licenses.json
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {}).sort();

function repoUrl(repository) {
  if (!repository) return undefined;
  const url = typeof repository === 'string' ? repository : repository.url;
  if (!url) return undefined;
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://');
}

const entries = [];
for (const name of deps) {
  const pkgJsonPath = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    entries.push({ name, version: pkg.dependencies[name], license: 'UNKNOWN' });
    continue;
  }
  const dep = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
  const license =
    dep.license ??
    (Array.isArray(dep.licenses)
      ? dep.licenses.map((l) => l.type).join(', ')
      : dep.licenses?.type) ??
    'UNKNOWN';
  entries.push({
    name,
    version: dep.version ?? pkg.dependencies[name],
    license: typeof license === 'string' ? license : 'UNKNOWN',
    repository: repoUrl(dep.repository),
    homepage: dep.homepage,
  });
}

// RustFFT and its already-linked dependencies: distribute under their MIT option.
entries.push(...[
  {
    "name": "rustfft (Rust FFT)",
    "version": "6.4.1",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/ejmahler/RustFFT"
  },
  {
    "name": "strength_reduce (Rust FFT dependency)",
    "version": "0.2.4",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "http://github.com/ejmahler/strength_reduce"
  },
  {
    "name": "transpose (Rust FFT dependency)",
    "version": "0.2.3",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/ejmahler/transpose"
  },
  {
    "name": "num-complex (Rust FFT dependency)",
    "version": "0.4.6",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/rust-num/num-complex"
  },
  {
    "name": "num-integer (Rust FFT dependency)",
    "version": "0.1.47",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/rust-num/num-integer"
  },
  {
    "name": "num-traits (Rust FFT dependency)",
    "version": "0.2.19",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/rust-num/num-traits"
  },
  {
    "name": "primal-check (Rust FFT dependency)",
    "version": "0.3.4",
    "license": "MIT (chosen from MIT OR Apache-2.0)",
    "repository": "https://github.com/huonw/primal"
  }
]);
entries.push({name:'WebKit oversampling filters (Rust adaptation)',version:'ae88abe108bc',license:'BSD-3-Clause',repository:'https://github.com/WebKit/WebKit/tree/ae88abe108bcccf28bd309adeed1d0522595e901/Source/WebCore/platform/audio'});
entries.push({name:'hound (Rust WAV I/O)',version:'3.5.1',license:'Apache-2.0',repository:'https://github.com/ruuda/hound'});
const outDir = join(root, 'src', 'generated');
entries.push({name:'glint (vendored codec WASM)',version:'vendored',license:'MIT',repository:'https://github.com/CrispStrobe/glint'});
entries.push({name:'libFLAC (via libflacjs)',version:'1.3.4 (libflacjs 5.6.0 build)',license:'BSD-3-Clause',repository:'https://github.com/xiph/flac'});
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, 'licenses.json'),
  JSON.stringify(entries, null, 2) + '\n',
  'utf8',
);
console.log(`Wrote ${entries.length} license entries to src/generated/licenses.json`);

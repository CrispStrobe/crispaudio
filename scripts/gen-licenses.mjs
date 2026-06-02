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

const outDir = join(root, 'src', 'generated');
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, 'licenses.json'),
  JSON.stringify(entries, null, 2) + '\n',
  'utf8',
);
console.log(`Wrote ${entries.length} license entries to src/generated/licenses.json`);

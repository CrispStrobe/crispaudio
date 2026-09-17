// Check docs/STORE_LISTING.md against App Store Connect field limits.
import fs from 'node:fs';

const LIMITS = { Name: 30, Subtitle: 30, 'Promotional text': 170, Keywords: 100, Description: 4000 };
const md = fs.readFileSync(new URL('../docs/STORE_LISTING.md', import.meta.url), 'utf8');

let failed = false;
for (const locale of md.split(/^## /m).slice(1)) {
  const [heading, ...rest] = locale.split('\n');
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(heading.trim())) continue;
  for (const section of rest.join('\n').split(/^### /m).slice(1)) {
    const [field, ...body] = section.split('\n');
    const value = body.join('\n').trim();
    const limit = LIMITS[field.trim()];
    if (!limit) continue;
    const length = [...value].length;
    const ok = length <= limit;
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${heading.trim()} ${field.trim()}: ${length}/${limit}`);
  }
}
process.exit(failed ? 1 : 0);

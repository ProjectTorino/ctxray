// Scratch helper: print the structure of a session log file (JSONL or .zstd).
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/inspect.mjs <file>'); process.exit(2); }

let buf = readFileSync(file);
if (file.endsWith('.zstd')) {
  const { decompress } = await import('fzstd');
  buf = Buffer.from(decompress(buf));
}
const text = buf.toString('utf8');
const lines = text.split('\n').filter((l) => l.trim().length > 0);
console.log('lines:', lines.length);

const typeCounts = new Map();
const keySet = new Set();
let first = null;
const samples = {};

for (const line of lines) {
  let o;
  try { o = JSON.parse(line); } catch (e) { console.error('bad line:', line.slice(0, 120)); continue; }
  if (!first) first = o;
  for (const k of Object.keys(o)) keySet.add(k);
  const t = o.type ?? o.kind ?? o.role ?? o.event ?? '(no type field)';
  typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  if (!(t in samples)) samples[t] = o;
}

console.log('distinct keys across all lines:', [...keySet].sort().join(', '));
console.log('line "type" distribution:', JSON.stringify(Object.fromEntries(typeCounts), null, 2));

console.log('\n--- first line keys ---');
for (const k of Object.keys(first)) {
  const v = first[k];
  const shape = Array.isArray(v) ? `array[${v.length}]` : (v && typeof v === 'object' ? 'object' : JSON.stringify(v).slice(0, 120));
  console.log(`  ${k}: ${shape}`);
}

// show one sample of each type, truncated
for (const [t, o] of Object.entries(samples)) {
  console.log(`\n--- sample of type "${t}" (truncated) ---`);
  const s = JSON.stringify(o);
  console.log(s.slice(0, 1800));
}

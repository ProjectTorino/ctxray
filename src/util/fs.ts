import { readFileSync } from 'node:fs';
import { decompress } from 'fzstd';

/** Read a UTF-8 file, transparently decompressing .zstd. */
export function readText(path: string): string {
  const buf = readFileSync(path);
  if (path.endsWith('.zstd') || path.endsWith('.zst')) {
    return Buffer.from(decompress(buf)).toString('utf8');
  }
  return buf.toString('utf8');
}

export function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

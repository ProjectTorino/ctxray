// Cheap, dependency-free token estimation and stable content hashing.
// Estimation is clearly labeled as such everywhere it surfaces in output;
// Codex sessions carry real token_usage_record numbers and skip estimation.

const CJK_RE =
  /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Approximate token count: CJK chars ≈ 1 token each, ASCII ≈ bytes/4. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    if (CJK_RE.test(ch)) cjk++;
    else ascii++;
  }
  // ASCII English ~4 chars/token; punctuation cheap but close enough.
  return cjk + Math.ceil(ascii / 4);
}

/** Total estimated tokens across raw message blocks. */
export function estimateMessageTokens(text: string): number {
  return estimateTokens(text);
}

import { createHash } from 'node:crypto';

/** Short stable fingerprint for content-dedup (two reads of the same bytes). */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

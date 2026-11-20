import type { SourceKind, Trace } from '../types.ts';
import { readText } from '../util/fs.ts';
import { parseCodex } from './codex.ts';
import { parseDsh } from './dsh.ts';
import { parseClaude } from './claude.ts';

function sniffSource(path: string, firstLine: string): SourceKind {
  const p = path.toLowerCase();
  if (p.includes('.dsh') || /session\.v4\.jsonl/.test(p)) return 'dsh';
  if (p.includes('.codex') || /rollout-.*\.jsonl/.test(p)) return 'codex';
  if (p.includes('.claude') || p.includes('claude')) return 'claude-code';

  // Fall back to inspecting the first JSON line.
  try {
    const o = JSON.parse(firstLine);
    if (o && typeof o === 'object') {
      if (o.type === 'session_meta' || (o.payload && o.type === 'token_usage_record')) return 'codex';
      if (o.type && /^(session|turn|step|tool|user|system|assistant|request|permission|sandbox|approval|model|command|agent|job|workspace|goal)\//.test(o.type)) return 'dsh';
      if (o.type === 'summary' || o.type === 'system' || o.type === 'user' || o.type === 'assistant') return 'claude-code';
    }
  } catch {
    /* not JSON */
  }
  return 'unknown';
}

/** Read a session file and parse it into a normalized Trace, auto-detecting the source. */
export function parseFile(path: string): Trace {
  const text = readText(path);
  const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
  const source = sniffSource(path, firstLine);
  switch (source) {
    case 'codex':
      return parseCodex(text, path);
    case 'dsh':
      return parseDsh(text, path);
    case 'claude-code':
      return parseClaude(text, path);
    default:
      return parseDsh(text, path);
  }
}

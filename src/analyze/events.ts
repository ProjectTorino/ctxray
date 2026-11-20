import type { Trace } from '../types.ts';
import type { Finding } from './types.ts';
import { contentHash, estimateTokens } from '../util/tokens.ts';
import { t } from '../i18n.ts';

const OVERSIZE_TOKENS = 4000;
const OVERSIZE_FRACTION = 0.25; // >25% of the declared context window
const READ_TOOLS = /^(read|read_file|ops_inspect_local_file|ops_inspect|view|open)$/i;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Extract filesystem-ish paths from tool arguments (JSON fields + raw regex). */
function extractPaths(args: string): string[] {
  const paths = new Set<string>();
  let isJson = false;
  try {
    const o = JSON.parse(args);
    isJson = o != null && typeof o === 'object';
    for (const k of ['path', 'file_path', 'filePath', 'file', 'command', 'script_path', 'workdir']) {
      const v = o?.[k];
      if (typeof v !== 'string') continue;
      const m = v.match(/(?:[A-Za-z]:\\[^\s"'`]+|\/[^\s"'`]{2,})/g);
      if (m) for (const x of m) paths.add(x.replace(/[),;:]+$/, ''));
      else if (/[\\/]/.test(v) && v.length > 2) paths.add(v);
    }
  } catch {
    /* arguments may not be JSON */
  }
  // Only scan the raw string when it was NOT a JSON object. Scanning JSON text
  // directly double-extracts paths: the escaped `\\` in the raw JSON and the
  // unescaped `\` from JSON.parse yield two different spellings of one path,
  // which double-counts duplicate reads.
  if (!isJson) {
    const m = args.match(/(?:[A-Za-z]:\\[^\s"'`]+|\/[^\s"'`]{2,})/g);
    if (m) for (const x of m) paths.add(x.replace(/[),;:]+$/, ''));
  }
  return [...paths].filter((p) => p.length > 2);
}

/** Duplicate reads and oversized outputs. */
export function analyzeEvents(trace: Trace): Finding[] {
  const findings: Finding[] = [];

  // --- Duplicate reads: same content fetched more than once ---
  const byContent = new Map<string, typeof trace.toolCalls>();
  for (const c of trace.toolCalls) {
    const text = c.resultText ?? '';
    if (text.length < 200) continue; // skip trivial outputs
    const h = contentHash(text);
    const list = byContent.get(h) ?? [];
    list.push(c);
    byContent.set(h, list);
  }

  // --- Duplicate reads: same path re-read (even if content changed) ---
  const byPath = new Map<string, typeof trace.toolCalls>();
  for (const c of trace.toolCalls) {
    if (!c.resultText) continue;
    if (!READ_TOOLS.test(c.name)) continue;
    for (const p of extractPaths(c.arguments)) {
      const list = byPath.get(p) ?? [];
      list.push(c);
      byPath.set(p, list);
    }
  }

  // Calls already reported by a path-based re-read: skip them in the
  // content-based loop, otherwise the same re-read is reported twice
  // (once for identical content, once for the same path).
  const pathCovered = new Set<typeof trace.toolCalls[number]>();
  for (const [, calls] of byPath) {
    if (calls.length < 2) continue;
    for (const c of calls) pathCovered.add(c);
  }

  for (const [, calls] of byContent) {
    if (calls.length < 2) continue;
    if (calls.every((c) => pathCovered.has(c))) continue;
    const tok = estimateTokens(calls[0].resultText ?? '');
    const wasted = (calls.length - 1) * tok;
    findings.push({
      kind: 'duplicate-read',
      turn: calls[calls.length - 1].turn,
      severity: wasted > OVERSIZE_TOKENS ? 'warn' : 'info',
      title: t().dupContentTitle(calls.length),
      detail: t().dupContentDetail(calls.length, wasted),
      evidence: calls.map((c) => ({
        kind: 'tool-call' as const,
        turn: c.turn,
        ref: `tool ${c.name} @ turn ${c.turn}`,
        excerpt: truncate(c.resultText ?? '', 120),
      })),
    });
  }

  for (const [path, calls] of byPath) {
    if (calls.length < 2) continue;
    const tok = estimateTokens(calls[0].resultText ?? '');
    const wasted = (calls.length - 1) * tok;
    findings.push({
      kind: 'duplicate-read',
      turn: calls[calls.length - 1].turn,
      severity: wasted > OVERSIZE_TOKENS ? 'warn' : 'info',
      title: t().dupPathTitle(calls.length),
      detail: t().dupPathDetail(truncate(path, 80), calls.length, wasted),
      evidence: calls.map((c) => ({
        kind: 'tool-call' as const,
        turn: c.turn,
        ref: `tool ${c.name} @ turn ${c.turn}`,
        excerpt: truncate(c.arguments, 120),
      })),
    });
  }

  // --- Oversized outputs: tool results that hog the context ---
  for (const c of trace.toolCalls) {
    const text = c.resultText ?? '';
    const tok = estimateTokens(text);
    const frac = trace.meta.contextWindow ? tok / trace.meta.contextWindow : 0;
    if (tok >= OVERSIZE_TOKENS || frac >= OVERSIZE_FRACTION) {
      findings.push({
        kind: 'oversized-output',
        turn: c.turn,
        severity: frac >= OVERSIZE_FRACTION ? 'critical' : 'warn',
        title: t().oversizedTitle(tok),
        detail: t().oversizedDetail(c.name, Math.round(frac * 100)),
        evidence: [
          { kind: 'tool-call', turn: c.turn, ref: `tool ${c.name} @ turn ${c.turn}`, excerpt: truncate(c.arguments, 120) },
        ],
      });
    }
  }

  return findings;
}

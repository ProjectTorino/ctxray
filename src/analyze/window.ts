import type { Trace } from '../types.ts';
import type { ContextPoint, Finding } from './types.ts';
import { estimateTokens } from '../util/tokens.ts';
import { t } from '../i18n.ts';

export interface WindowResult {
  context: ContextPoint[];
  compactions: Finding[];
  compactionTurns: number[];
}

/** Reconstruct the per-turn context size and detect compaction/reset points. */
export function buildContext(trace: Trace): WindowResult {
  const turns = allTurns(trace);
  const maxTurn = turns.length ? Math.max(...turns) : 0;
  const context: ContextPoint[] = [];
  const compactions: Finding[] = [];

  // 1. Explicit compaction events (Claude `summary` lines).
  for (const c of trace.compactions) {
    compactions.push({
      kind: 'compaction',
      turn: c.turn,
      severity: 'info',
      title: t().compactionExplicitTitle(c.turn),
      detail: t().compactionExplicitDetail(truncate(c.summary, 240)),
      evidence: [
        { kind: 'message', turn: c.turn, ref: `compaction @ turn ${c.turn}`, excerpt: truncate(c.summary, 160) },
      ],
    });
  }

  // (No generic marker scan: matching phrases like "this session is being
  // continued" inside assistant reasoning or harness meta-text produced false
  // positives. Claude Code's real compactions arrive as explicit summary lines
  // captured above; Codex is handled by the token-drop heuristic below.)

  if (trace.tokenUsage.length > 0) {
    // Real token counts (Codex). One point per turn (last record wins).
    const byTurn = new Map<number, (typeof trace.tokenUsage)[number]>();
    for (const u of trace.tokenUsage) byTurn.set(u.turn, u);
    const ordered = [...byTurn.entries()].sort((a, b) => a[0] - b[0]);
    for (const [turn, u] of ordered) {
      context.push({
        turn,
        inputTokens: u.inputTokens,
        cachedTokens: u.cachedInputTokens,
        outputTokens: u.outputTokens,
        estimated: false,
      });
    }
    // 3. Sharp input drop → likely compaction (Codex heuristic).
    for (let i = 1; i < context.length; i++) {
      const prev = context[i - 1];
      const cur = context[i];
      if (prev.inputTokens > 0 && cur.inputTokens < prev.inputTokens * 0.7) {
        const pct = Math.round((1 - cur.inputTokens / prev.inputTokens) * 100);
        compactions.push({
          kind: 'compaction',
          turn: cur.turn,
          severity: 'warn',
          title: t().compactionLikelyTitle(cur.turn),
          detail: t().compactionLikelyDetail(prev.inputTokens, cur.inputTokens, pct),
          evidence: [
            { kind: 'token-usage', turn: cur.turn, ref: `turn ${prev.turn}→${cur.turn}`, excerpt: `${prev.inputTokens} → ${cur.inputTokens} tokens` },
          ],
        });
      }
    }
  } else {
    // Estimated context (DSH and sources without token records).
    const sysTokens = estimateTokens(trace.meta.systemPrompt);
    for (const t of turns) {
      let acc = sysTokens;
      for (const s of trace.steps) {
        if (s.turn > t) continue;
        for (const m of s.messages) {
          for (const b of m.content) acc += estimateTokens(b.text ?? '');
        }
      }
      for (const c of trace.toolCalls) {
        if (c.turn <= t) acc += estimateTokens(c.resultText ?? '');
      }
      context.push({ turn: t, inputTokens: acc, estimated: true });
    }
  }

  const compactionTurns = [...new Set(compactions.map((c) => c.turn))].sort((a, b) => a - b);
  return { context, compactions, compactionTurns };
}

export function allTurns(trace: Trace): number[] {
  const s = new Set<number>();
  for (const st of trace.steps) s.add(st.turn);
  for (const c of trace.toolCalls) s.add(c.turn);
  for (const u of trace.tokenUsage) s.add(u.turn);
  for (const c of trace.compactions) s.add(c.turn);
  return [...s].sort((a, b) => a - b);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

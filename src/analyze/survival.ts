import type { Trace } from '../types.ts';
import type { Finding, Rule, RuleSurvival } from './types.ts';
import type { ExtractedRule } from './rules.ts';

const STOP_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'not', 'for', 'with', 'without', 'from', 'into', 'onto',
  'your', 'you', 'are', 'is', 'was', 'were', 'be', 'been', 'being', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'must', 'shall', 'this', 'that', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'there', 'here', 'when', 'where', 'which', 'what', 'how', 'why', 'who',
  'whom', 'while', 'then', 'than', 'as', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'down', 'out',
  'over', 'under', 'again', 'further', 'once', 'only', 'own', 'same', 'so', 'too', 'very', 'just',
  'about', 'against', 'between', 'through', 'during', 'before', 'after', 'above', 'below', 'any',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'do', 'does', 'did', 'doing',
  'have', 'has', 'had', 'having', 'if', 'unless', 'until', 'use', 'make', 'sure', 'allowed', 'always',
  'never', 'avoid', 'ensure', 'require', 'required', 'forbid', 'forbidden', 'prohibit', 'prohibited',
  'remember', 'important', 'cannot', 'refuse', 'only', 'also', 'all', 'any', 'must', 'note', 'notes',
  'instead', 'otherwise', 'please', 'however', 'therefore', 'whenever', 'when', 'using', 'used',
]);

const STOP_CJK = new Set([
  '必须', '务必', '不要', '禁止', '严禁', '绝不', '一定', '只能', '应该', '请勿', '切记', '不允许',
  '不能', '可以', '需要', '确保', '避免', '使用', '这个', '那个', '一个', '以及', '并且', '或者',
  '如果', '那么', '就是', '不是', '所有', '任何', '但是', '因为', '所以', '然后', '之后', '之前',
]);

/** Distinctive keywords from a rule: quoted strings, CJK runs, and long English words. */
function keywords(rule: Rule): string[] {
  const out = new Set<string>();
  for (const m of rule.text.matchAll(/["'`]([^"'`]{2,})["'`]/g)) out.add(m[1].toLowerCase());
  for (const m of rule.text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    if (!STOP_CJK.has(m[0])) out.add(m[0]);
  }
  for (const m of rule.text.matchAll(/[A-Za-z][A-Za-z0-9._/-]{3,}/g)) {
    const w = m[0].toLowerCase();
    if (!STOP_EN.has(w)) out.add(w);
  }
  return [...out];
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Concatenate all post-compaction text (summaries + messages after turn C), whitespace-normalized. */
function postCompactionText(trace: Trace, C: number, summaries: Finding[]): string {
  const parts: string[] = [];
  for (const f of summaries) if (f.kind === 'compaction') for (const e of f.evidence) parts.push(e.excerpt);
  for (const s of trace.steps) {
    if (s.turn <= C) continue;
    for (const m of s.messages) for (const b of m.content) if (b.type === 'text' || b.type === 'reasoning') parts.push(b.text);
  }
  return norm(parts.join('\n')).toLowerCase();
}

export function analyzeSurvival(
  trace: Trace,
  extracted: ExtractedRule[],
  compactionTurns: number[],
  summaries: Finding[],
): RuleSurvival[] {
  const maxTurn = Math.max(0, ...[...trace.steps.map((s) => s.turn), ...trace.toolCalls.map((c) => c.turn)]);
  const survivals: RuleSurvival[] = [];

  for (const ex of extracted) {
    const s: RuleSurvival = { rule: ex.rule, source: ex.source, firstSeenTurn: ex.firstTurn, lastSeenTurn: maxTurn, violations: [] };

    // System directives are re-sent on every request, so they never truly
    // leave the window. Only user instructions can be evicted by compaction.
    if (ex.source === 'user' && compactionTurns.length > 0) {
      const candidates = compactionTurns.filter((C) => C >= ex.firstTurn);
      if (candidates.length > 0) {
        const C = Math.min(...candidates);
        const post = postCompactionText(trace, C, summaries);
        const survives = post.includes(norm(ex.rule.text).toLowerCase());
        if (!survives) {
          s.evictedAt = C;
          s.lastSeenTurn = C - 1;
          s.violations = linkViolations(trace, ex.rule, keywords(ex.rule), C);
        }
      }
    }
    survivals.push(s);
  }
  return survivals;
}

/** Link post-eviction tool calls whose args overlap the evicted rule's keywords. */
function linkViolations(trace: Trace, rule: Rule, kw: string[], evictedAt: number): Finding[] {
  if (kw.length === 0) return [];
  const out: Finding[] = [];
  for (const c of trace.toolCalls) {
    if (c.turn < evictedAt) continue;
    const hay = (c.name + ' ' + c.arguments).toLowerCase();
    const hits = kw.filter((k) => k.length >= 2 && hay.includes(k));
    if (hits.length === 0) continue;
    out.push({
      kind: 'violation',
      turn: c.turn,
      severity: 'warn',
      title: `规则被挤出后，agent 在第 ${c.turn} 轮执行了相关操作`,
      detail: `该操作引用了被挤出规则的主题（${hits.slice(0, 5).join(', ')}）。请人工确认是否违反了规则。`,
      evidence: [
        { kind: 'rule', ref: 'user instruction', excerpt: rule.text.slice(0, 140) },
        { kind: 'tool-call', turn: c.turn, ref: `tool ${c.name} @ turn ${c.turn}`, excerpt: c.arguments.slice(0, 160) },
      ],
    });
  }
  return out;
}

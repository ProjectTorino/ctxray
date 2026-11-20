import type { Trace } from '../types.ts';
import type { Finding, Report, RuleSurvival } from './types.ts';
import { extractAllRules } from './rules.ts';
import { allTurns, buildContext } from './window.ts';
import { analyzeEvents } from './events.ts';
import { analyzeSurvival } from './survival.ts';
import { t } from '../i18n.ts';

const SEV = { info: 0, warn: 1, critical: 2 } as const;

export function analyze(trace: Trace): Report {
  const extracted = extractAllRules(trace);
  const { context, compactions, compactionTurns } = buildContext(trace);
  const eventFindings = analyzeEvents(trace);
  const survivals = analyzeSurvival(trace, extracted, compactionTurns, compactions);

  const findings: Finding[] = [...compactions, ...eventFindings];
  for (const s of survivals) {
    if (s.evictedAt == null) continue;
    findings.push({
      kind: 'rule-evicted',
      turn: s.evictedAt,
      severity: 'warn',
      title: t().ruleEvictedTitle(s.evictedAt),
      detail: s.rule.text,
      evidence: [
        {
          kind: 'rule',
          ref: s.source === 'user' ? 'user instruction' : 'system prompt',
          excerpt: s.rule.text.slice(0, 160),
        },
      ],
    });
    findings.push(...s.violations);
  }

  findings.sort((a, b) => a.turn - b.turn || SEV[b.severity] - SEV[a.severity]);

  const turns = allTurns(trace);
  const estimated = context.some((c) => c.estimated);
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cachedTokens: number | undefined;

  if (estimated) {
    inputTokens = context.length ? context[context.length - 1].inputTokens : 0;
  } else {
    inputTokens = context.reduce((n, c) => n + c.inputTokens, 0);
    outputTokens = context.reduce((n, c) => n + (c.outputTokens ?? 0), 0);
    cachedTokens = context.reduce((n, c) => n + (c.cachedTokens ?? 0), 0);
  }

  return {
    meta: trace.meta,
    turns: turns.length ? Math.max(...turns) : 0,
    contextWindow: trace.meta.contextWindow,
    context,
    findings,
    rules: survivals,
    totals: {
      toolCalls: trace.toolCalls.length,
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedTokens: estimated,
    },
  };
}

export type { Report, Finding, RuleSurvival } from './types.ts';

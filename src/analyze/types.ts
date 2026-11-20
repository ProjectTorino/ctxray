import type { SessionMeta } from '../types.ts';

export type EventKind =
  | 'duplicate-read'
  | 'oversized-output'
  | 'compaction'
  | 'rule-evicted'
  | 'violation';

export interface Evidence {
  kind: 'tool-call' | 'message' | 'system' | 'token-usage' | 'rule';
  turn?: number;
  step?: number;
  /** Human-readable location, e.g. `tool exec @ turn 2`, `system prompt §3`. */
  ref: string;
  /** Short verbatim quote. */
  excerpt: string;
}

export interface Finding {
  kind: EventKind;
  turn: number;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail: string;
  evidence: Evidence[];
}

export interface Rule {
  id: string;
  text: string;
  heading?: string;
}

export interface RuleSurvival {
  rule: Rule;
  source: 'system' | 'user';
  firstSeenTurn: number;
  lastSeenTurn: number;
  evictedAt?: number;
  violations: Finding[];
}

export interface ContextPoint {
  turn: number;
  inputTokens: number;
  cachedTokens?: number;
  outputTokens?: number;
  estimated: boolean;
}

export interface Report {
  meta: SessionMeta;
  turns: number;
  contextWindow?: number;
  context: ContextPoint[];
  findings: Finding[];
  rules: RuleSurvival[];
  totals: {
    toolCalls: number;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    estimatedTokens: boolean;
  };
}

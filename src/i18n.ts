/**
 * Message catalog for ctxray's user-facing output.
 *
 * English is the default so the demo / README read naturally for an
 * international audience; `--lang zh` (or CTXRAY_LANG=zh) keeps the
 * original Chinese output. Detection keywords (the CJK lists in
 * analyze/rules.ts and analyze/survival.ts) are NOT translated — they are
 * heuristics, not UI.
 */

export type Lang = 'en' | 'zh';

let lang: Lang = 'en';

export function setLang(l: Lang): void {
  lang = l;
}

export function getLang(): Lang {
  return lang;
}

export interface Catalog {
  // ---- analysis findings ----
  dupContentTitle: (n: number) => string;
  dupContentDetail: (n: number, wasted: number) => string;
  dupPathTitle: (n: number) => string;
  dupPathDetail: (path: string, n: number, wasted: number) => string;
  oversizedTitle: (tok: number) => string;
  oversizedDetail: (tool: string, pct: number) => string;
  ruleEvictedTitle: (turn: number) => string;
  violationTitle: (turn: number) => string;
  violationDetail: (topics: string) => string;
  compactionExplicitTitle: (turn: number) => string;
  compactionExplicitDetail: (summary: string) => string;
  compactionLikelyTitle: (turn: number) => string;
  compactionLikelyDetail: (from: number, to: number, pct: number) => string;

  // ---- terminal + HTML shared labels ----
  headlineEvicted: (n: number) => string;
  headlineFull: (pct: number, used: string, total: string) => string;
  headlineUsed: (used: string) => string;
  headlineFindings: (n: number) => string;
  headlineClean: () => string;
  compactMark: () => string;
  estimated: () => string;
  evictedStatus: (turn: number) => string;
  liveStatus: () => string;
  titleContext: () => string;
  titleFindings: (n: number) => string;
  noFindings: () => string;
  titleRules: (total: number, live: number, evicted: number) => string;
  estimateNote: () => string;
}

const en: Catalog = {
  dupContentTitle: (n) => `Same content fetched ${n} times`,
  dupContentDetail: (n, wasted) => `The identical content was pulled ${n} times, wasting ~${wasted} tokens.`,
  dupPathTitle: (n) => `File read ${n} times`,
  dupPathDetail: (path, n, wasted) => `Path ${path} was read ${n} times, wasting ~${wasted} tokens.`,
  oversizedTitle: (tok) => `Oversized tool output (~${tok} tokens)`,
  oversizedDetail: (tool, pct) => `Output of ${tool} takes up ~${pct}% of the context window — a likely culprit for context bloat.`,
  ruleEvictedTitle: (turn) => `Rule dropped from context after turn ${turn}`,
  violationTitle: (turn) => `Agent acted on an evicted rule at turn ${turn}`,
  violationDetail: (topics) => `The action references topics from an evicted rule (${topics}). Check whether it violated the rule.`,
  compactionExplicitTitle: (turn) => `Context compacted at turn ${turn} (explicit)`,
  compactionExplicitDetail: (summary) => `Explicit compaction event: ${summary}`,
  compactionLikelyTitle: (turn) => `Context likely compacted at turn ${turn}`,
  compactionLikelyDetail: (from, to, pct) => `Input tokens dropped from ${from} to ${to} (-${pct}%).`,

  headlineEvicted: (n) => `${n} instruction${n === 1 ? '' : 's'} fell out of the context window`,
  headlineFull: (pct, used, total) => `Context is ${pct}% full (${used} / ${total})`,
  headlineUsed: (used) => `${used} tokens of context in use`,
  headlineFindings: (n) => `${n} issue${n === 1 ? '' : 's'} worth investigating`,
  headlineClean: () => `No obvious context problems detected`,
  compactMark: () => ` ◄ compacted`,
  estimated: () => ` (est.)`,
  evictedStatus: (turn) => `✗ evicted at turn ${turn}`,
  liveStatus: () => `✓ alive`,
  titleContext: () => `Context usage (per turn)`,
  titleFindings: (n) => `${n} issue${n === 1 ? '' : 's'}`,
  noFindings: () => `No issues found.`,
  titleRules: (total, live, evicted) => `Rule survival (${total} rules: ${live} alive / ${evicted} evicted)`,
  estimateNote: () => `Note: token counts are estimates (this source has no per-turn token records).`,
};

const zh: Catalog = {
  dupContentTitle: (n) => `同一内容被读取 ${n} 次`,
  dupContentDetail: (n, wasted) => `相同的内容被拉取 ${n} 次，浪费约 ${wasted} tokens。`,
  dupPathTitle: (n) => `文件被重复读取 ${n} 次`,
  dupPathDetail: (path, n, wasted) => `路径 ${path} 被读取 ${n} 次，浪费约 ${wasted} tokens。`,
  oversizedTitle: (tok) => `工具输出过大（约 ${tok} tokens）`,
  oversizedDetail: (tool, pct) => `工具 ${tool} 的输出约占 ${pct}% 的上下文窗口，是上下文膨胀的候选元凶。`,
  ruleEvictedTitle: (turn) => `规则在第 ${turn} 轮之后被挤出上下文`,
  violationTitle: (turn) => `规则被挤出后，agent 在第 ${turn} 轮执行了相关操作`,
  violationDetail: (topics) => `该操作引用了被挤出规则的主题（${topics}）。请人工确认是否违反了规则。`,
  compactionExplicitTitle: (turn) => `上下文在第 ${turn} 轮被压缩（显式）`,
  compactionExplicitDetail: (summary) => `检测到显式压缩事件：${summary}`,
  compactionLikelyTitle: (turn) => `上下文在第 ${turn} 轮疑似被压缩`,
  compactionLikelyDetail: (from, to, pct) => `输入 token 从 ${from} 骤降到 ${to}（下降 ${pct}%）。`,

  headlineEvicted: (n) => `${n} 条指令被挤出了上下文窗口`,
  headlineFull: (pct, used, total) => `上下文已用掉 ${pct}%（${used} / ${total}）`,
  headlineUsed: (used) => `上下文占用 ${used} tokens`,
  headlineFindings: (n) => `${n} 个问题需要关注`,
  headlineClean: () => `未发现明显的上下文问题`,
  compactMark: () => ` ◄ 压缩点`,
  estimated: () => ` (估算)`,
  evictedStatus: (turn) => `✗ 第 ${turn} 轮被挤出`,
  liveStatus: () => `✓ 存活`,
  titleContext: () => `上下文占用（每轮）`,
  titleFindings: (n) => `发现 ${n} 个问题`,
  noFindings: () => `未发现问题。`,
  titleRules: (total, live, evicted) => `指令存亡（${total} 条：${live} 存活 / ${evicted} 被挤出）`,
  estimateNote: () => `注：token 数为估算值（该来源无逐轮 token 记录）。`,
};

export function t(): Catalog {
  return lang === 'zh' ? zh : en;
}

import type { Finding, Report, RuleSurvival } from '../analyze/types.ts';

type Paint = (s: string) => string;

interface Palette {
  dim: Paint;
  red: Paint;
  yellow: Paint;
  green: Paint;
  cyan: Paint;
  bold: Paint;
}

function palette(enabled: boolean): Palette {
  const wrap = (code: number) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    dim: wrap(2),
    red: wrap(31),
    yellow: wrap(33),
    green: wrap(32),
    cyan: wrap(36),
    bold: wrap(1),
  };
}

function fmtTokens(n?: number): string {
  if (n == null) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const SEV_LABEL: Record<Finding['severity'], string> = {
  critical: 'CRIT',
  warn: 'WARN',
  info: 'INFO',
};

/** One-line headline for a session: the "so what" of the whole trace. */
function headline(r: Report): string {
  const evictions = r.rules.filter((s) => s.evictedAt != null);
  const total = r.totals.inputTokens ?? r.context[r.context.length - 1]?.inputTokens;
  if (evictions.length > 0) {
    return `${evictions.length} 条指令被挤出了上下文窗口`;
  }
  if (r.contextWindow && total != null && total / r.contextWindow > 0.8) {
    return `上下文已用掉 ${Math.round((total / r.contextWindow) * 100)}%（${fmtTokens(total)} / ${fmtTokens(r.contextWindow)}）`;
  }
  if (r.findings.length > 0) {
    return `${r.findings.length} 个问题需要关注`;
  }
  return '未发现明显的上下文问题';
}

/** Compact bar chart of context size per turn (relative to the max). */
function contextBars(r: Report, p: Palette): string {
  const max = Math.max(...r.context.map((c) => c.inputTokens), 1);
  const rows: string[] = [];
  for (const c of r.context) {
    const width = Math.max(1, Math.round((c.inputTokens / max) * 40));
    const bar = '█'.repeat(width);
    const compacted = r.findings.some((f) => f.kind === 'compaction' && f.turn === c.turn);
    const mark = compacted ? p.yellow(' ◄ 压缩点') : '';
    rows.push(`  turn ${String(c.turn).padStart(2)}  ${bar}  ${fmtTokens(c.inputTokens).padStart(8)}${c.estimated ? ' (估算)' : ''}${mark}`);
  }
  return rows.join('\n');
}

function findingBlock(f: Finding, p: Palette, idx: number): string {
  const color = f.severity === 'critical' ? p.red : f.severity === 'warn' ? p.yellow : p.dim;
  const lines: string[] = [];
  lines.push(`  ${color(`${idx + 1}. [${SEV_LABEL[f.severity]}] ${f.title}`)}`);
  if (f.detail) lines.push(`     ${p.dim(f.detail)}`);
  for (const e of f.evidence) {
    const where = e.turn != null ? `turn ${e.turn} ` : '';
    lines.push(`     ${p.dim('· ' + where + (e.ref ?? '') + ':')} ${p.dim(e.excerpt.slice(0, 140))}`);
  }
  return lines.join('\n');
}

function survivalBlock(s: RuleSurvival, p: Palette, idx: number): string {
  const tag = s.source === 'user' ? 'user' : 'sys ';
  const status = s.evictedAt != null ? p.red(`✗ 第 ${s.evictedAt} 轮被挤出`) : p.green('✓ 存活');
  const lines: string[] = [];
  lines.push(`  ${p.bold(`${idx + 1}. [${tag}]`)} ${status}  ${s.rule.text.slice(0, 72)}`);
  for (const v of s.violations) lines.push(`     ${p.yellow('↳ ' + v.title)}`);
  return lines.join('\n');
}

export function renderTerminal(r: Report, color = true): string {
  const p = palette(color);
  const L: string[] = [];
  const src = r.meta.source;
  const model = r.meta.model ? ` · ${r.meta.model}` : '';

  L.push(p.bold('ctxray — Context Forensics'));
  L.push('');
  L.push(`  ${p.dim(src)}${model} · ${r.turns} turns · ${r.totals.toolCalls} tool calls`);
  if (r.contextWindow) L.push(`  context window ${fmtTokens(r.contextWindow)}`);
  L.push('');
  L.push(p.cyan('  ' + headline(r)));
  L.push('');
  L.push(p.bold('上下文占用（每轮）'));
  L.push(contextBars(r, p));
  L.push('');

  if (r.findings.length > 0) {
    L.push(p.bold(`发现 ${r.findings.length} 个问题`));
    const critical = r.findings.filter((f) => f.severity === 'critical');
    const warn = r.findings.filter((f) => f.severity === 'warn');
    const info = r.findings.filter((f) => f.severity === 'info');
    const ordered = [...critical, ...warn, ...info];
    for (let i = 0; i < ordered.length; i++) L.push(findingBlock(ordered[i], p, i));
    L.push('');
  } else {
    L.push(p.green('  未发现问题。'));
    L.push('');
  }

  const evicted = r.rules.filter((s) => s.evictedAt != null);
  const live = r.rules.filter((s) => s.evictedAt == null);
  L.push(p.bold(`指令存亡（${r.rules.length} 条：${live.length} 存活 / ${evicted.length} 被挤出）`));
  const orderedRules = [...evicted, ...live];
  for (let i = 0; i < orderedRules.length; i++) L.push(survivalBlock(orderedRules[i], p, i));
  L.push('');

  if (r.totals.estimatedTokens) {
    L.push(p.dim('  注：token 数为估算值（该来源无逐轮 token 记录）。'));
  }
  return L.join('\n');
}

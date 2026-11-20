import type { Finding, Report, RuleSurvival } from '../analyze/types.ts';
import { getLang, t } from '../i18n.ts';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTokens(n?: number): string {
  if (n == null) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const SEV_COLOR: Record<Finding['severity'], string> = {
  critical: '#ff5d5d',
  warn: '#ffb454',
  info: '#8b93a7',
};

/** Inline SVG line chart of context size per turn. */
function contextSvg(r: Report): string {
  const pts = r.context;
  if (pts.length === 0) return '<svg class="chart"></svg>';
  const W = 720;
  const H = 200;
  const P = 24;
  const max = Math.max(...pts.map((c) => c.inputTokens), 1);
  const x = (i: number) => (pts.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (pts.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = pts.map((c, i) => `${x(i).toFixed(1)},${y(c.inputTokens).toFixed(1)}`).join(' ');
  const compactTurns = new Set(r.findings.filter((f) => f.kind === 'compaction').map((f) => f.turn));
  const markers = pts
    .map((c, i) => {
      const dot = `<circle cx="${x(i).toFixed(1)}" cy="${y(c.inputTokens).toFixed(1)}" r="3.5" fill="${compactTurns.has(c.turn) ? '#ffb454' : '#7c9cff'}"/>`;
      const label = `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="axis">${c.turn}</text>`;
      return dot + label;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <polyline points="${line}" fill="none" stroke="#7c9cff" stroke-width="2"/>
    ${markers}
  </svg>`;
}

function findingCard(f: Finding): string {
  const color = SEV_COLOR[f.severity];
  const evidence = f.evidence
    .map((e) => {
      const where = e.turn != null ? `turn ${e.turn} · ` : '';
      return `<div class="ev"><span class="ref">${esc(where + (e.ref ?? ''))}</span><span class="excerpt">${esc(e.excerpt.slice(0, 200))}</span></div>`;
    })
    .join('');
  return `<div class="card" style="border-left:3px solid ${color}">
    <div class="card-head"><span class="sev" style="color:${color}">${f.severity.toUpperCase()}</span><span class="title">${esc(f.title)}</span></div>
    ${f.detail ? `<div class="detail">${esc(f.detail)}</div>` : ''}
    ${evidence}
  </div>`;
}

function ruleRow(s: RuleSurvival): string {
  const tag = s.source === 'user' ? 'user' : 'sys';
  const evicted = s.evictedAt != null;
  const status = evicted
    ? `<span class="status evicted">${esc(t().evictedStatus(s.evictedAt!))}</span>`
    : `<span class="status live">${esc(t().liveStatus())}</span>`;
  const violations = s.violations
    .map((v) => `<div class="violation">↳ ${esc(v.title)}</div>`)
    .join('');
  return `<div class="rule">
    <span class="tag ${tag}">${tag}</span> ${status}
    <div class="rule-text">${esc(s.rule.text)}</div>
    ${violations}
  </div>`;
}

export function renderHtml(r: Report): string {
  const title = `ctxray · ${esc(r.meta.id || r.meta.origin || 'session')}`;
  const findings = [...r.findings].sort(
    (a, b) => (['critical', 'warn', 'info'].indexOf(b.severity) - ['critical', 'warn', 'info'].indexOf(a.severity)) || a.turn - b.turn,
  );
  const evicted = r.rules.filter((s) => s.evictedAt != null);
  const live = r.rules.filter((s) => s.evictedAt == null);
  const orderedRules = [...evicted, ...live];
  const total = r.totals.inputTokens ?? r.context[r.context.length - 1]?.inputTokens;
  const pct = r.contextWindow && total != null ? Math.round((total / r.contextWindow) * 100) : null;

  return `<!doctype html>
<html lang="${getLang() === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0e1116; color: #d7dce4; font: 15px/1.55 -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: #8b93a7; margin-bottom: 28px; }
  .headline { font-size: 18px; color: #9db4ff; margin: 0 0 20px; }
  .chart { width: 100%; height: auto; background: #141923; border-radius: 10px; }
  .axis { fill: #8b93a7; font-size: 11px; text-anchor: middle; }
  .section { margin-top: 36px; }
  .section h2 { font-size: 17px; border-bottom: 1px solid #232a38; padding-bottom: 8px; }
  .card { background: #141923; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
  .card-head { display: flex; gap: 10px; align-items: baseline; }
  .sev { font-weight: 700; font-size: 12px; letter-spacing: .5px; }
  .title { font-weight: 600; }
  .detail { color: #aeb6c4; margin-top: 6px; }
  .ev { margin-top: 8px; font-size: 13px; display: flex; gap: 10px; }
  .ref { color: #7c9cff; white-space: nowrap; }
  .excerpt { color: #8b93a7; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; overflow-wrap: anywhere; }
  .rule { background: #141923; border-radius: 10px; padding: 12px 16px; margin: 10px 0; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 5px; margin-right: 8px; font-weight: 700; }
  .tag.user { background: #2b3a5c; color: #9db4ff; }
  .tag.sys { background: #1f2a3d; color: #7d8ca6; }
  .status { font-size: 13px; }
  .status.live { color: #57c47c; }
  .status.evicted { color: #ff5d5d; }
  .rule-text { margin-top: 6px; color: #d7dce4; overflow-wrap: anywhere; }
  .violation { margin-top: 6px; color: #ffb454; font-size: 13px; }
  .note { color: #8b93a7; font-size: 13px; margin-top: 24px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>ctxray — Context Forensics</h1>
  <div class="sub">${esc(r.meta.source)}${r.meta.model ? ' · ' + esc(r.meta.model) : ''} · ${r.turns} turns · ${r.totals.toolCalls} tool calls${r.contextWindow ? ' · window ' + fmtTokens(r.contextWindow) : ''}</div>
  ${pct != null ? `<p class="headline">${esc(t().headlineFull(pct, fmtTokens(total), fmtTokens(r.contextWindow)))}</p>` : `<p class="headline">${esc(t().headlineUsed(fmtTokens(total)))}</p>`}
  ${contextSvg(r)}
  <div class="section">
    <h2>${esc(t().titleFindings(r.findings.length))}</h2>
    ${findings.length ? findings.map(findingCard).join('') : `<p style="color:#57c47c">${esc(t().noFindings())}</p>`}
  </div>
  <div class="section">
    <h2>${esc(t().titleRules(r.rules.length, live.length, evicted.length))}</h2>
    ${orderedRules.map(ruleRow).join('')}
  </div>
  ${r.totals.estimatedTokens ? `<p class="note">${esc(t().estimateNote())}</p>` : ''}
</div>
</body>
</html>`;
}

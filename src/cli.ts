import { parseFile, analyze } from './index.ts';
import { renderTerminal } from './render/terminal.ts';
import { renderHtml } from './render/html.ts';

const USAGE = `ctxray — context forensics for AI coding agents

usage:
  ctxray <session-file>                  terminal report (auto-detects source)
  ctxray <session-file> --json           machine-readable JSON
  ctxray <session-file> --html [--out f] single-file HTML report
  ctxray <session-file> --budget <tokens> CI gate: fail if context > budget
                                          or any critical finding (exit 1)

flags:
  --no-color          disable ANSI colors in the terminal report
  -h, --help          show this help
  -v, --version       print version

sources: Claude Code / Codex / DeepSeek Harness session files
         (.jsonl, .jsonl.zstd, or .zstd — decompressed transparently)
`;

interface Opts {
  path?: string;
  json: boolean;
  html: boolean;
  out?: string;
  budget?: number;
  color: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { json: false, html: false, color: true, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--html') o.html = true;
    else if (a === '--no-color') o.color = false;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--budget') o.budget = Number(argv[++i]);
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (!a.startsWith('-') && !o.path) o.path = a;
  }
  return o;
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));

  if (o.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (o.version) {
    process.stdout.write('ctxray 0.1.0\n');
    return;
  }
  if (!o.path) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const trace = await parseFile(o.path);
  const report = analyze(trace);

  // CI gate: context budget or critical findings. The budget compares the
  // PEAK per-turn context (a context window is re-sent each turn), not the
  // cumulative token total across turns.
  if (o.budget != null) {
    const peak = report.context.length
      ? Math.max(...report.context.map((c) => c.inputTokens))
      : 0;
    const critical = report.findings.filter((f) => f.severity === 'critical').length;
    const overBudget = peak > o.budget;
    const fail = overBudget || critical > 0;
    process.stdout.write(
      `ctxray check: budget=${o.budget} context=${peak} critical=${critical} → ${fail ? 'FAIL' : 'PASS'}\n`,
    );
    process.exit(fail ? 1 : 0);
  }

  if (o.json) {
    const text = JSON.stringify(report, null, 2);
    await writeOut(o.out, text);
    return;
  }
  if (o.html) {
    await writeOut(o.out, renderHtml(report));
    return;
  }

  process.stdout.write(renderTerminal(report, o.color) + '\n');
}

async function writeOut(out: string | undefined, text: string): Promise<void> {
  if (out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(out, text, 'utf8');
    process.stderr.write(`wrote ${out}\n`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  process.stderr.write(`ctxray: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

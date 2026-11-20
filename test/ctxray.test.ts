import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, analyze } from '../src/index.ts';
import { extractRules } from '../src/analyze/rules.ts';
import { estimateTokens } from '../src/util/tokens.ts';
import { demoReport, DEMO_JSONL } from '../src/demo.ts';
import type { Trace, ToolCall } from '../src/types.ts';

const FIXTURE = 'test/fixtures/rollout-compaction-demo.jsonl';

test('--demo stays in sync with the committed fixture', () => {
  const fromFile = analyze(parseFile(FIXTURE));
  const fromDemo = demoReport();
  assert.equal(fromDemo.findings.length, fromFile.findings.length);
  assert.equal(fromDemo.rules.length, fromFile.rules.length);
  assert.equal(fromDemo.turns, fromFile.turns);
});

test('a Windows path read twice yields exactly one duplicate-read finding', () => {
  const read = (id: string, result: string): ToolCall => ({
    turn: 1,
    step: 1,
    time: 0,
    name: 'read',
    arguments: JSON.stringify({ path: 'D:\\repo\\src\\a.ts' }),
    callId: id,
    resultText: result,
  });
  const trace: Trace = {
    meta: { id: 't', cwd: '', source: 'codex', systemPrompt: 'Always use TypeScript.', origin: 'test' },
    steps: [{ turn: 1, step: 1, time: 0, messages: [] }],
    toolCalls: [read('c1', 'A'.repeat(300)), read('c2', 'B'.repeat(300))],
    tokenUsage: [],
    compactions: [],
  };
  const report = analyze(trace);
  const dups = report.findings.filter((f) => f.kind === 'duplicate-read');
  assert.equal(dups.length, 1, 'one path spelled two ways must not double-count');
});

test('goal_round harness text is not extracted as a user instruction', () => {
  const trace: Trace = {
    meta: { id: 't', cwd: '', source: 'dsh', systemPrompt: 'Always use TypeScript.', origin: 'test' },
    steps: [
      {
        turn: 1,
        step: 1,
        time: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<goal_round>\nObjective: "ship it"\nRound: 1/40\nContinue working toward the objective.\n</goal_round>',
              },
            ],
          },
        ],
      },
    ],
    toolCalls: [],
    tokenUsage: [],
    compactions: [],
  };
  const report = analyze(trace);
  const userRules = report.rules.filter((r) => r.source === 'user');
  assert.equal(userRules.length, 0, 'harness goal_round text must not become a user rule');
});

test('parses a Codex rollout into a normalized trace', () => {
  const trace = parseFile(FIXTURE);
  assert.equal(trace.meta.source, 'codex');
  assert.equal(trace.meta.model, 'gpt-5-codex');
  assert.equal(trace.meta.contextWindow, 200000);
  assert.equal(trace.toolCalls.length, 2);
  assert.equal(trace.tokenUsage.length, 2);
});

test('detects compaction from a sharp input-token drop', () => {
  const report = analyze(parseFile(FIXTURE));
  const compactions = report.findings.filter((f) => f.kind === 'compaction');
  assert.equal(compactions.length, 1);
  assert.equal(compactions[0].turn, 2);
  assert.match(compactions[0].detail, /50000/);
  assert.match(compactions[0].detail, /8000/);
});

test('evicts user instructions but keeps system directives alive', () => {
  const report = analyze(parseFile(FIXTURE));
  const evicted = report.rules.filter((r) => r.evictedAt != null);
  const system = report.rules.filter((r) => r.source === 'system');
  assert.ok(evicted.some((r) => r.source === 'user' && r.rule.text.includes('migrations')));
  assert.ok(system.length >= 2, 'system directives should be extracted');
  assert.ok(system.every((r) => r.evictedAt == null), 'system directives never evicted');
});

test('links a post-eviction tool call to the evicted rule', () => {
  const report = analyze(parseFile(FIXTURE));
  const violations = report.findings.filter((f) => f.kind === 'violation');
  assert.equal(violations.length, 1);
  assert.equal(violations[0].turn, 2);
  assert.match(violations[0].detail, /migrations/);
});

test('extractRules surfaces directive lines and skips prose', () => {
  const rules = extractRules(
    'You are a helpful assistant.\nNever commit secrets or API keys.\nCall when asked to do something.',
  );
  assert.ok(rules.some((r) => r.text.includes('Never commit secrets')));
  assert.ok(!rules.some((r) => r.text.includes('helpful assistant')));
});

test('estimateTokens counts CJK as ~1 token per char', () => {
  assert.equal(estimateTokens('你好世界'), 4);
  assert.ok(estimateTokens('hello world') < 10);
});

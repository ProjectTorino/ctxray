// Built-in demo session: a synthetic Codex "rollout" that shows the product's
// core story — a compaction drops a user instruction, and the agent violates it
// one turn later. Kept in sync with test/fixtures/rollout-compaction-demo.jsonl
// (a consistency test guards against drift). Inlined so the single-file dist is
// fully self-contained: `npx ctxray --demo` works with no session file on disk.
import { parseCodex } from './adapters/codex.ts';
import { analyze } from './analyze/index.ts';
import type { Report } from './analyze/index.ts';

export const DEMO_JSONL = [
  '{"timestamp":"2026-11-20T12:00:00Z","ordinal":1,"type":"session_meta","payload":{"session_id":"synth-demo-1","cwd":"/repo/payments","model_provider":"gpt-5-codex","base_instructions":{"text":"You are a senior software engineer.\\nAlways use TypeScript for new code.\\nNever commit secrets or API keys.\\nFollow the repository\'s existing conventions."}}}',
  '{"timestamp":"2026-11-20T12:00:01Z","ordinal":2,"type":"event_msg","payload":{"type":"task_started","turn_id":"t1","model_context_window":200000}}',
  '{"timestamp":"2026-11-20T12:00:02Z","ordinal":3,"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Implement the payment module.\\nDo not modify the migrations directory."}]}}',
  '{"timestamp":"2026-11-20T12:00:03Z","ordinal":4,"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Sure, let me look at the current directory structure first."}]}}',
  '{"timestamp":"2026-11-20T12:00:04Z","ordinal":5,"type":"response_item","payload":{"type":"function_call","name":"bash","arguments":"ls -la","call_id":"c1"}}',
  '{"timestamp":"2026-11-20T12:00:05Z","ordinal":6,"type":"response_item","payload":{"type":"function_call_output","call_id":"c1","output":"README.md  src/  migrations/  tests/"}}',
  '{"timestamp":"2026-11-20T12:00:06Z","ordinal":7,"type":"token_usage_record","payload":{"turn_id":"t1","usage":{"input_tokens":50000,"cached_input_tokens":20000,"output_tokens":500,"total_tokens":50500}}}',
  '{"timestamp":"2026-11-20T12:01:00Z","ordinal":8,"type":"event_msg","payload":{"type":"task_started","turn_id":"t2","model_context_window":200000}}',
  '{"timestamp":"2026-11-20T12:01:01Z","ordinal":9,"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Continue."}]}}',
  '{"timestamp":"2026-11-20T12:01:02Z","ordinal":10,"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"I will just edit the migration script directly."}]}}',
  '{"timestamp":"2026-11-20T12:01:03Z","ordinal":11,"type":"response_item","payload":{"type":"function_call","name":"bash","arguments":"edit migrations/001_init.sql","call_id":"c2"}}',
  '{"timestamp":"2026-11-20T12:01:04Z","ordinal":12,"type":"response_item","payload":{"type":"function_call_output","call_id":"c2","output":"updated migrations/001_init.sql"}}',
  '{"timestamp":"2026-11-20T12:01:05Z","ordinal":13,"type":"token_usage_record","payload":{"turn_id":"t2","usage":{"input_tokens":8000,"cached_input_tokens":3000,"output_tokens":400,"total_tokens":8400}}}',
].join('\n');

/** Run the full pipeline over the built-in demo session. */
export function demoReport(): Report {
  return analyze(parseCodex(DEMO_JSONL, 'demo'));
}

# Contributing to ctxray

Thanks for helping make agent context visible. The fastest, highest-impact way
to contribute is **adding an adapter for an agent we don't support yet** — it's
about 80 lines.

## Add an adapter (~80 lines)

Every agent writes its session log a little differently. An adapter's only job
is to turn that log into the normalized `Trace` shape in
[`src/types.ts`](src/types.ts) — everything else (window reconstruction, rule
survival, events, rendering) works on the normalized form for free.

1. **Create** `src/adapters/<agent>.ts` exporting `parse<Agent>(text, origin): Trace`.
   Copy the closest existing adapter:
   - [`src/adapters/codex.ts`](src/adapters/codex.ts) — JSONL with real token counts
   - [`src/adapters/dsh.ts`](src/adapters/dsh.ts) — JSONL (zstd), no per-turn tokens
   - [`src/adapters/claude.ts`](src/adapters/claude.ts) — JSONL with summary/compaction lines

2. **Fill in** the three responsibilities:
   - `meta` — id, cwd, model, provider, `systemPrompt`, `contextWindow` if the log has it.
   - `steps` / `messages` — turn → ordered `RawMessage{role, content: Block[]}`.
   - `toolCalls` — every tool invocation with `name`, `arguments`, `resultText`, `turn`.
   - `tokenUsage` — per-turn `inputTokens` if the log records it (real beats estimated).
   - `compactions` — any explicit summary/compaction event.

3. **Register it** in `src/adapters/index.ts`:
   - `sniffSource()` — detect from path or the first JSON line.
   - `parseFile()` — dispatch to your parser.

4. **Test it** against a real session file. Add a fixture to `test/fixtures/`
   and a case in `test/ctxray.test.ts`.

### The normalized contract (`src/types.ts`)

```ts
interface Trace {
  meta: SessionMeta;        // id, cwd, model, systemPrompt, contextWindow?
  steps: Step[];            // Step { turn, step, time, messages: RawMessage[] }
  toolCalls: ToolCall[];    // ToolCall { turn, name, arguments, resultText? }
  tokenUsage: TokenUsage[]; // TokenUsage { turn, inputTokens, ... }
  compactions: Compaction[];// Compaction { turn, time, summary }
}
```

If your agent's log has **real per-turn token counts**, capture them in
`tokenUsage` — the window reconstruction then uses exact numbers instead of
estimation. That's the single most valuable thing an adapter can provide.

## Non-adapter contributions

- **More event detectors** in `src/analyze/events.ts` (failed-retry chains,
  output bloat, …) — keep every finding backed by `evidence[]` with a turn + excerpt.
- **A new renderer** (SVG cards, Markdown) in `src/render/`.
- **Rule extraction** improvements in `src/analyze/rules.ts` (more languages,
  smarter noise filtering).

## Ground rules

- Every conclusion ships with evidence (rule text, turn, tool call). No unevidenced judgments.
- Local-first: no network, no API key, logs never leave the machine.
- `npm test` must stay green (7 tests, no build step required — Node runs `.ts` directly).

## Development

```bash
npm install
npm run build   # esbuild → dist/ctxray.mjs + dist/index.mjs
npm test        # node --test
```

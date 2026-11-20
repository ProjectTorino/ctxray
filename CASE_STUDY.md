# Case study: ctxray analyzes the session that built it

`ctxray` is a context-forensics tool for AI coding agents. The most honest way to
show what it does is to point it at a real session log — so this case study runs
ctxray on the DeepSeek Harness session that wrote ctxray itself. The tool reads
its own construction log and reports back where that agent's context went.

> Snapshot taken mid-build. The session is still growing, so re-running
> `npx ctxray <session>` on your own logs will show different (larger) numbers.

## The session under analysis

| Field | Value |
| --- | --- |
| Source | DeepSeek Harness (`session.v4.jsonl.zstd`) |
| Model | `deepseek-v4-pro` |
| Turns | 3 |
| Tool calls | 180 |
| Context window | 1,048,576 tokens (1M) |
| Session id | `session-49052641-e500-4e1b-941b-82f30b632070` |

## What ctxray reported

```text
ctxray — Context Forensics

  dsh · deepseek-v4-pro · 3 turns · 180 tool calls
  context window 1.05M

  11 issues worth investigating

Context usage (per turn)
  turn  1  ███████████                         83.7K (est.)
  turn  2  ██████████████████████████████████  270.4K (est.)
  turn  3  ██████████████████████████████████  315.1K (est.)

Rule survival (14 rules: 14 alive / 0 evicted)
  13. [user] ✓ alive  帮我构思一个开源项目，…
  14. [user] ✓ alive  开始做，不要问我任何问题，所有决定权在你

  Note: token counts are estimates (this source has no per-turn token records).
```

## The three findings that matter

### 1. Context grew 3.8× across 3 turns (83.7K → 315.1K)

ctxray rebuilds the per-request context window turn by turn. In three turns this
agent's context went from ~84K to ~315K tokens — a 3.8× balloon. The growth is
not the user's fault: it is tool output and repeated reads accumulating.

### 2. Two oversized `web_fetch` results hogged ~20K tokens

Early in the build the agent fetched the full npm registry document for
`glassbox` (~12.5K tokens) and an unpaginated GitHub search response (~7.3K
tokens), both dumped raw into context instead of being trimmed to the one field
that mattered.

```text
[WARN] 工具输出过大（约 12483 tokens）
   web_fetch @ turn 1  {"url": "https://registry.npmjs.org/glassbox"}
[WARN] 工具输出过大（约 7300 tokens）
   web_fetch @ turn 1  {"url": "https://api.github.com/search/repositories?q=glassbox+agent"}
```

### 3. Eight files were re-read, `events.ts` four times

The agent re-opened its own source files as it edited them. ctxray collapses
these into one finding per path, with the wasted tokens, and links every
evidence line to the exact tool call and turn.

```text
[WARN] 文件被重复读取 4 次
   D:\dsh-workspace\ctxray\src\analyze\events.ts 浪费约 4227 tokens
   · turn 2 ops_inspect_local_file   · turn 3 read
```

`events.ts` was read four times because it was edited three times; each
`edit`-then-verify cycle cost a full re-read. The wasted-token figure is the
direct cost of that habit.

## Instruction survival: nothing was evicted (correct)

ctxray separates **system directives** (re-sent on every request, never truly
evicted) from **user instructions** (evictable once a compaction summarizes the
conversation). This session had no compaction, so both user instructions are
correctly reported as alive:

- `帮我构思一个开源项目…` (conceive an open-source project)
- `开始做，不要问我任何问题…` (start building, make every decision)

The killer demo — a user rule evicted by compaction and then violated — is
reproducible with the synthetic fixture shipped in the repo
(`npx ctxray --demo`), because no real compaction happened in this particular
session.

## Methodology and a disclosed limitation

- **Window reconstruction** — ctxray walks the normalized trace and accumulates
  the system prompt + every message + every tool result into a per-turn
  estimate, detecting compaction as an explicit summary event (Claude Code) or a
  >30% input-token drop (Codex).
- **DeepSeek Harness logs no per-turn token counts**, so ctxray estimates
  (CJK ≈ 1 token/char, ASCII ≈ bytes/4) and marks the whole report `(估算)`.
- **Codex rollouts carry exact `token_usage_record` entries**, so for those
  sessions the curve and wasted-token figures are precise, not estimated.

The important thing is not the exact token count — it is the *shape*: which
tool result ballooned, which file was re-read, and which instruction died. That
is what ctxray is built to surface.

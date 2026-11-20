# ctxray — 上下文取证（Context Forensics for AI Agents）

> 工作名，npm 上 `ctxray` / `contextlens` / `context-budget` 均未被占用（已查）。
> 一句话：**你的 Agent 不是变笨了，是它的上下文被挤掉了。ctxray 告诉你被挤掉了什么，以及之后它做错了什么。**

---

## 1. 为什么是现在

2026 年的现实：编码 Agent（Claude Code / Codex / Cursor / Gemini CLI / DSH / opencode）每天产生海量本地会话日志，而开发者最常抱怨的三件事全部指向同一个根因：

1. "它忘了我 CLAUDE.md 里的规矩"
2. "它反复读同一个文件，越跑越贵"
3. "压缩（compaction）之后它就跑偏了"

现有工具全部停在**计数层**：花了多少 token、多少钱、调了几次工具（ccusage、clicodelog、context-profiler、cozempic、session-devtools 等，见 §5）。
**没有人回答因果问题**：哪条指令、哪个约束、哪段证据，在第几轮从窗口里消失了？消失之后，Agent 做了什么？

这就是空档。而且这个空档天然自带传播性——它输出的不是图表，是**事故报告**。

## 2. 核心洞察（产品的全部差异化）

> 上下文工具在回答「token 去哪了」；ctxray 回答「**哪条规则被挤掉了，代价是什么**」。

三个可验证、可复现、别人没做的能力：

- **指令存亡追踪（Instruction Survival）**：把 system prompt / CLAUDE.md / skills / 用户约束拆成一条条"规则块"，逐请求追踪它们是否还在窗口里、何时被压缩掉、被谁挤掉（工具输出膨胀？重复读文件？）。
- **挤出→后果关联（Eviction → Consequence）**：规则消失之后的 N 轮里，Agent 是否恰好违反了它（改了 migrations、跳过了测试、删了校验）。输出一句人话结论 + 行级证据。
- **浪费账本（Waste Ledger）**：重复读同一文件、超大工具输出、失败重试链、被压缩掉又立刻重读的内容，逐条折算成 token 与美元，**每条都带出处**。

没有 LLM 也能跑（纯结构化推断），可选接 LLM 做归因增强。这保证：零 API key、离线、可复现、可在 CI 里当门禁。

## 3. 产品形态

```
npx ctxray                     # 自动发现本机所有 Agent 会话，给一个总览
npx ctxray open <session>      # 本地 Web UI：上下文栈时间轴 + 指令存亡带 + 后果标记
npx ctxray autopsy <session>   # 终端输出"事故报告"（可 --json / --md）
npx ctxray diff a.jsonl b.jsonl# 两次会话的上下文行为对比（换模型/换 prompt 后）
npx ctxray check --budget 60k  # CI 门禁：上下文浪费率/重复读超阈值即失败
```

三个 killer demo（README 首屏就放这三个 GIF）：

1. **"规则在第 34 轮被挤掉了"** — 指令存亡带可视化，红色断点，点击跳到那一轮。
2. **"之后它改了 3 个 migration"** — 断点右侧直接列出违反规则的 action，带文件行号。
3. **"这次会话 41% 的 token 是重复读"** — 浪费账本 + 折算金额 + 一句 `--fix` 建议。

## 4. 技术架构（刻意做小）

```
adapters/      每个 Agent 一个 JSONL/DB 适配器 → 归一化成 Turn[]（DSH、Claude Code、Codex 优先）
reconstruct/   用每轮 messages 重建"该次请求的窗口快照"（关键：不是猜，是日志里就有）
attribute/     块级归因：system / rules / skills / file_read / tool_output / history / compaction_summary
detect/        事件检测：重复读、输出膨胀、压缩点、规则消失、失败重试链
causal/        规则消失 ↔ 后续违规动作 的关联打分
render/        TUI（终端）+ 单文件 HTML 报告 + SVG 卡片（可贴 PR / 发推）
```

数据 100% 本地；不联网、不传日志；单文件 HTML 可离线打开。

## 5. 竞争与差异（已调研，别自欺）

| 工具 | 它做什么 | 缺什么 |
|---|---|---|
| ccusage（~2.8k★） | 从本地 JSONL 汇总花费 | 只有钱，没有上下文结构 |
| clicodelog | 多 Agent 日志浏览/导出 | 是"看日志"，不是"做诊断" |
| context-profiler | token 分布、icicle 图、增长曲线 | 停在计数层，无因果 |
| cozempic | 诊断+压缩"治疗" | 偏改日志，不解释后果 |
| session-devtools | 逐 call 的上下文归因 | 归因到来源，但不追规则存亡与后果 |
| Langfuse / Opik / lmnr | SaaS/自建可观测平台 | 云优先、接入成本高、面向团队平台而非个人 CLI |

结论：**赛道拥挤，但拥挤在"计数"，空在"因果"。** 2026 年每个 idea 都有 3–10 个实现，赢的不会是第一个，而是**唯一一个把话说到位的**。

## 6. MVP（两周内可交付，必须砍）

做：
- 2 个适配器（本机 DSH + Claude Code，优先用真实日志验证）
- 窗口重建 + 块级归因 + 4 类事件（重复读、输出膨胀、压缩点、规则消失）
- 终端报告 + 单文件 HTML（含时间轴与存亡带）
- `--json` 输出 + 一份真实会话的 case study

不做（v1 明确拒绝）：云端、账号、团队协作、实时 hook、LLM 归因、多语言适配器全家桶。

## 7. Star 增长策略

1. **首屏即结论**：README 第一屏是"规则被挤掉"的 GIF + 一句统计，不是功能列表。
2. **零安装**：`npx`，读完即出结果；再给 `--demo` 内置一份脱敏真实会话，没有 Agent 的人也能跑。
3. **可分享产物**：SVG 会话卡片，带二维码/短链，方便发 X / HN。
4. **发帖时机**：HN "Show HN: I built a tool that shows which of your rules the agent forgot"、r/ClaudeAI、r/LocalLLaMA；中文侧 V2EX/即刻。
5. **生态钩子**：GitHub Action（上下文预算门禁）、adapter 贡献模板（"加一个 Agent 只要 80 行"），把"支持更多 Agent"变成社区任务。
6. **诚实标签**：不做"又一个 dashboard"，定位为 *postmortem tool*（事故复盘），这是开发者文化里天然受尊重的位置。

## 8. 风险

| 风险 | 对策 |
|---|---|
| 日志格式随 Agent 版本变 | 适配器层薄 + 版本嗅探 + 快照测试；格式变更当 issue 对待 |
| 归因不准 → 结论被质疑 | 每个结论必须带出处（行号/轮次/原文），绝不输出无证据判断 |
| 用户觉得"又一个玩具" | v1 必须能回答一个真实事故；用真实 case study 开场 |
| 被大厂原生功能覆盖 | 保持跨 Agent、本地优先、可脚本化；平台不会做"跨竞品" |

## 9. 命名备选

`ctxray`（首选，npm 可用）· `contextlens`（可用）· `context-budget`（可用）· `evicted` · `lostrules`

---

**下一步**：搭仓库骨架 → 用本机真实会话跑通"窗口重建 + 规则存亡"这一条链路 → 做出第一张存亡带图 → 再决定是否公开。

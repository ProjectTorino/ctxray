import type { Block, Compaction, RawMessage, Role, SessionMeta, Step, ToolCall, Trace } from '../types.ts';

interface ClaudeLine {
  type: string;
  subtype?: string;
  cwd?: string;
  sessionId?: string;
  model?: string;
  message?: any;
  content?: any;
  summary?: string;
  timestamp?: string;
}

function isoMs(s?: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function toBlocks(content: any): Block[] {
  if (!Array.isArray(content)) return [];
  const out: Block[] = [];
  for (const c of content) {
    if (c == null) continue;
    if (c.type === 'text' && c.text) out.push({ type: 'text', text: c.text });
    else if (c.type === 'thinking' && c.thinking) out.push({ type: 'reasoning', text: c.thinking });
    else if (c.type === 'tool_use') {
      out.push({
        type: 'tool_call',
        id: c.id ?? '',
        name: c.name ?? '',
        arguments: typeof c.input === 'string' ? c.input : JSON.stringify(c.input ?? {}),
      });
    } else if (c.type === 'tool_result') {
      const text = (c.content ?? [])
        .map((b: any) => (typeof b === 'string' ? b : b?.text ?? ''))
        .join('\n');
      out.push({
        type: 'tool_result',
        callId: c.tool_use_id ?? '',
        name: '',
        text,
        isError: !!c.is_error,
      });
    }
  }
  return out;
}

const ROLE: Record<string, Role> = { system: 'system', user: 'user', assistant: 'assistant', tool: 'tool' };

/**
 * Best-effort parser for Claude Code JSONL (`~/.claude/projects/**\/*.jsonl`).
 * Not yet validated against live Claude Code data; structure follows the
 * documented line types (system/user/assistant/summary) and content blocks.
 */
export function parseClaude(text: string, origin: string): Trace {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as ClaudeLine;
      } catch {
        return null;
      }
    })
    .filter((l): l is ClaudeLine => l !== null);

  const meta: SessionMeta = { id: '', cwd: '', source: 'claude-code', systemPrompt: '', origin };
  const steps: Step[] = [];
  const toolCalls: ToolCall[] = [];
  const compactions: Compaction[] = [];

  let turn = 0;
  let currentStep: Step | null = null;
  const toolById = new Map<string, ToolCall>();

  const ensureStep = (t: number, time: number): Step => {
    if (!currentStep || currentStep.turn !== t) {
      currentStep = { turn: t, step: 1, time, messages: [] };
      steps.push(currentStep);
    }
    return currentStep;
  };

  for (const line of lines) {
    const time = isoMs(line.timestamp);
    switch (line.type) {
      case 'system': {
        if (line.cwd) meta.cwd = line.cwd;
        if (line.sessionId) meta.id = line.sessionId;
        if (line.model) meta.model = line.model;
        // System prompt: init subtype carries `content` text blocks.
        const blocks = toBlocks(line.content ?? line.message?.content);
        if (blocks.some((b) => b.type === 'text') && !meta.systemPrompt) {
          meta.systemPrompt = blocks
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
        }
        break;
      }
      case 'user': {
        turn++;
        const blocks = toBlocks(line.message?.content);
        ensureStep(turn, time).messages.push({ role: 'user', content: blocks });
        break;
      }
      case 'assistant': {
        const blocks = toBlocks(line.message?.content);
        for (const b of blocks) {
          if (b.type === 'tool_call') {
            const call: ToolCall = {
              turn,
              step: 1,
              time,
              name: b.name,
              arguments: b.arguments,
              callId: b.id,
            };
            toolCalls.push(call);
            toolById.set(b.id, call);
          } else if (b.type === 'tool_result') {
            const call = toolById.get(b.callId);
            if (call) {
              call.resultText = b.text;
              call.isError = b.isError;
            }
          }
        }
        ensureStep(turn, time).messages.push({ role: 'assistant', content: blocks });
        break;
      }
      case 'summary': {
        if (line.summary) compactions.push({ turn, time, summary: line.summary });
        break;
      }
    }
  }

  return { meta, steps, toolCalls, tokenUsage: [], compactions };
}

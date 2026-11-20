import type { Block, RawMessage, Role, SessionMeta, Step, ToolCall, TokenUsage, Trace } from '../types.ts';

interface RolloutLine {
  timestamp?: string;
  ordinal?: number;
  type: string;
  payload: any;
}

function isoMs(s?: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function normalizeText(o: any): string {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (Array.isArray(o)) {
    return o
      .map((b) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? ''))
      .join('\n');
  }
  if (typeof o === 'object') return JSON.stringify(o);
  return String(o);
}

function blocksFromContent(content: any): Block[] {
  if (!Array.isArray(content)) return [];
  const out: Block[] = [];
  for (const c of content) {
    if (c == null) continue;
    const t = typeof c === 'string' ? 'text' : c.type;
    const text = typeof c === 'string' ? c : (c.text ?? '');
    if (t === 'input_text' || t === 'output_text' || t === 'text') {
      if (text) out.push({ type: 'text', text });
    } else if (text) {
      out.push({ type: 'text', text });
    }
  }
  return out;
}

const ROLE_MAP: Record<string, Role> = {
  developer: 'developer',
  system: 'system',
  user: 'user',
  assistant: 'assistant',
  tool: 'tool',
};

/** Parse a Codex "rollout-*.jsonl" into a normalized Trace. */
export function parseCodex(text: string, origin: string): Trace {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as RolloutLine;
      } catch {
        return null;
      }
    })
    .filter((l): l is RolloutLine => l !== null);

  const meta: SessionMeta = {
    id: '',
    cwd: '',
    source: 'codex',
    systemPrompt: '',
    origin,
  };

  const steps: Step[] = [];
  const toolCalls: ToolCall[] = [];
  const tokenUsage: TokenUsage[] = [];
  const turnIdToNum = new Map<string, number>();

  let turnNum = 0;
  let currentStep: Step | null = null;

  const pushMessage = (role: Role, blocks: Block[]) => {
    if (!currentStep) return;
    if (blocks.length === 0) return;
    currentStep.messages.push({ role, content: blocks });
  };

  const toolCallByCallId = new Map<string, ToolCall>();

  for (const line of lines) {
    const p = line.payload ?? {};
    switch (line.type) {
      case 'session_meta': {
        meta.id = p.session_id ?? p.id ?? '';
        meta.cwd = p.cwd ?? '';
        meta.model = p.model_provider ?? p.model ?? '';
        meta.createdAt = isoMs(p.timestamp);
        meta.systemPrompt = p.base_instructions?.text ?? '';
        break;
      }
      case 'event_msg': {
        if (p.type === 'task_started') {
          turnNum++;
          const tid = p.turn_id as string | undefined;
          if (tid) turnIdToNum.set(tid, turnNum);
          if (p.model_context_window) meta.contextWindow = p.model_context_window;
          currentStep = { turn: turnNum, step: 1, time: isoMs(line.timestamp), messages: [] };
          steps.push(currentStep);
        }
        break;
      }
      case 'response_item': {
        const t = p.type as string;
        const turn = currentStep?.turn ?? turnNum;
        if (t === 'message') {
          const role = ROLE_MAP[p.role] ?? 'assistant';
          pushMessage(role, blocksFromContent(p.content));
        } else if (t === 'reasoning') {
          const summary = normalizeText(p.summary);
          if (summary) pushMessage('assistant', [{ type: 'reasoning', text: summary }]);
        } else if (t === 'function_call' || t === 'custom_tool_call') {
          const call: ToolCall = {
            turn,
            step: currentStep?.step ?? 1,
            time: isoMs(line.timestamp),
            name: p.name ?? t,
            arguments: typeof p.arguments === 'string' ? p.arguments : normalizeText(p.input ?? p.arguments),
            callId: p.call_id,
          };
          toolCalls.push(call);
          toolCallByCallId.set(p.call_id, call);
          pushMessage('assistant', [{ type: 'tool_call', id: p.call_id ?? '', name: call.name, arguments: call.arguments }]);
        } else if (t === 'function_call_output' || t === 'custom_tool_call_output') {
          const call = toolCallByCallId.get(p.call_id);
          const outText = normalizeText(p.output);
          if (call) call.resultText = outText;
          pushMessage('tool', [
            { type: 'tool_result', callId: p.call_id ?? '', name: call?.name ?? '', text: outText },
          ]);
        }
        break;
      }
      case 'token_usage_record': {
        const tid = p.turn_id as string | undefined;
        const t = tid ? turnIdToNum.get(tid) : undefined;
        if (t) {
          const u = p.usage ?? {};
          tokenUsage.push({
            turn: t,
            inputTokens: u.input_tokens ?? 0,
            cachedInputTokens: u.cached_input_tokens,
            outputTokens: u.output_tokens,
          });
        }
        break;
      }
    }
  }

  return { meta, steps, toolCalls, tokenUsage, compactions: [] };
}

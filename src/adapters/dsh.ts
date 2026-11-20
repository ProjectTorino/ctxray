import type { Block, Role, SessionMeta, Step, ToolCall, TokenUsage, Trace } from '../types.ts';

interface DshLine {
  type: string;
  seq?: number;
  time?: number;
  data?: any;
}

function toBlocks(content: any): Block[] {
  if (!Array.isArray(content)) return [];
  const out: Block[] = [];
  for (const c of content) {
    if (c == null) continue;
    const t = c.type ?? 'text';
    const text = c.text ?? '';
    if (t === 'reasoning') out.push({ type: 'reasoning', text });
    else if (t === 'text' && text) out.push({ type: 'text', text });
    else if (text) out.push({ type: 'text', text });
  }
  return out;
}

/** Parse a DeepSeek Harness "session.v4.jsonl" (already decompressed) into a Trace. */
export function parseDsh(text: string, origin: string): Trace {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as DshLine;
      } catch {
        return null;
      }
    })
    .filter((l): l is DshLine => l !== null);

  const meta: SessionMeta = { id: '', cwd: '', source: 'dsh', systemPrompt: '', origin };

  const steps: Step[] = [];
  const toolCalls: ToolCall[] = [];
  const tokenUsage: TokenUsage[] = [];

  let curTurn = 0;
  let curStep = 0;
  const stepByTurnStep = new Map<string, Step>();
  let systemPromptParts: string[] = [];
  const seenSystemText = new Set<string>();

  const getStep = (turn: number, step: number, time: number): Step => {
    const key = `${turn}/${step}`;
    let s = stepByTurnStep.get(key);
    if (!s) {
      s = { turn, step, time, messages: [] };
      stepByTurnStep.set(key, s);
      steps.push(s);
    }
    return s;
  };

  for (const line of lines) {
    const d = line.data ?? {};
    const time = line.time ?? 0;
    switch (line.type) {
      case 'session': {
        // The `session` line is flattened: fields sit at the top level, not in `data`.
        meta.id = d.id ?? (line as any).id ?? '';
        meta.cwd = d.cwd ?? (line as any).cwd ?? '';
        meta.createdAt = d.createdAt ?? (line as any).createdAt;
        break;
      }
      case 'model/selection': {
        if (d.model) meta.model = d.model;
        if (d.provider) meta.provider = d.provider;
        break;
      }
      case 'turn/start': {
        curTurn = d.turn ?? curTurn;
        curStep = 0;
        break;
      }
      case 'step/start': {
        if (d.turn != null) curTurn = d.turn;
        if (d.step != null) curStep = d.step;
        getStep(curTurn, curStep, time);
        break;
      }
      case 'request/context': {
        if (d.contextWindow) meta.contextWindow = d.contextWindow;
        if (d.model) meta.model = d.model;
        if (d.provider) meta.provider = d.provider;
        break;
      }
      case 'request/header': {
        const h = d.header?.config;
        if (h?.model) meta.model = h.model;
        if (h?.provider) meta.provider = h.provider;
        break;
      }
      case 'system/message': {
        const turn = d.turn ?? curTurn;
        const step = d.step ?? curStep;
        const msg = d.message ?? {};
        const blocks = toBlocks(msg.content);
        getStep(turn, step, time).messages.push({ role: 'system', content: blocks });
        for (const b of blocks) {
          if (b.type === 'text' && !seenSystemText.has(b.text)) {
            seenSystemText.add(b.text);
            systemPromptParts.push(b.text);
          }
        }
        break;
      }
      case 'user/message': {
        const turn = d.turn ?? curTurn;
        const step = d.step ?? curStep;
        const blocks = toBlocks(d.content);
        getStep(turn, step, time).messages.push({ role: 'user', content: blocks });
        break;
      }
      case 'assistant/message': {
        const turn = d.turn ?? curTurn;
        const step = d.step ?? curStep;
        const msg = d.message ?? {};
        const blocks = toBlocks(msg.content);
        getStep(turn, step, time).messages.push({ role: 'assistant', content: blocks });
        break;
      }
      case 'tool/call': {
        const turn = d.turn ?? curTurn;
        const step = d.step ?? curStep;
        const call: ToolCall = {
          turn,
          step,
          time,
          name: d.name ?? 'unknown',
          arguments: typeof d.arguments === 'string' ? d.arguments : JSON.stringify(d.arguments ?? {}),
          callId: d.callId,
        };
        toolCalls.push(call);
        break;
      }
      case 'tool/result': {
        const msg = d.message ?? {};
        const turn = d.turn ?? curTurn;
        const step = d.step ?? curStep;
        const blocks = toBlocks(msg.content);
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        const callId = msg.toolCallId ?? msg.source?.callId ?? '';
        const target =
          toolCalls.find((c) => c.callId && c.callId === callId && c.resultText === undefined) ??
          toolCalls.find((c) => c.turn === turn && c.step === step && c.resultText === undefined);
        if (target) target.resultText = text;
        getStep(turn, step, time).messages.push({ role: 'tool', content: blocks });
        break;
      }
    }
  }

  if (systemPromptParts.length === 0 && meta.id) {
    // fallback: no system/message observed (should not happen for v4).
  }
  meta.systemPrompt = systemPromptParts.join('\n');

  // Sort steps by turn/step.
  steps.sort((a, b) => (a.turn - b.turn) || (a.step - b.step));
  return { meta, steps, toolCalls, tokenUsage, compactions: [] };
}

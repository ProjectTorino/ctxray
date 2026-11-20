// Normalized model shared by every adapter and the analysis engine.
// A "trace" is the whole of one agent session, reduced to the facts the
// forensics engine needs: messages, tool calls, token usage, and metadata.

export type SourceKind = 'claude-code' | 'codex' | 'dsh' | 'unknown';

export type Block =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; callId: string; name: string; text: string; isError?: boolean }
  | { type: 'other' };

export type Role = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

export interface RawMessage {
  role: Role;
  content: Block[];
}

/** Messages appended during one agent step (turn + step within turn). */
export interface Step {
  turn: number;
  step: number;
  /** epoch millis when this step started (best-effort). */
  time: number;
  messages: RawMessage[];
}

export interface ToolCall {
  turn: number;
  step: number;
  time: number;
  name: string;
  arguments: string;
  callId?: string;
  resultText?: string;
  isError?: boolean;
}

export interface TokenUsage {
  turn: number;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}

/** An explicit context-compaction / summarization event, when the source emits one. */
export interface Compaction {
  turn: number;
  time: number;
  summary: string;
}

export interface SessionMeta {
  id: string;
  cwd?: string;
  model?: string;
  provider?: string;
  createdAt?: number;
  source: SourceKind;
  /** The full system / base instructions (the "rules" source). */
  systemPrompt: string;
  /** Declared model context window size, when known. */
  contextWindow?: number;
  /** Raw path the trace was loaded from. */
  origin: string;
}

export interface Trace {
  meta: SessionMeta;
  steps: Step[];
  toolCalls: ToolCall[];
  tokenUsage: TokenUsage[];
  compactions: Compaction[];
}

import { createHash } from 'node:crypto';
import type { Trace } from '../types.ts';
import type { Rule } from './types.ts';

const DIRECTIVE =
  /\b(must|never|always|do not|don'?t|avoid|ensure|require(?:d)?|forbid(?:den)?|prohibit(?:ed)?|should not|must not|only use|remember|important|make sure|not allowed|cannot|can'?t|refuse|严禁|禁止|绝不|务必|必须|不要|切勿|请勿|只能|应当|切记|不允许)\b/i;

const NOISE = /^(?:```|[|>]|[-*_=]{3,}$)/;
const JSON_KEY = /^"(?:type|description|properties|required|enum|default|name|parameters|items|format|title|minimum|maximum)"\s*:/;

// Harness-injected text that is NOT a user instruction and must not be
// mistaken for one (system reminders, time notices, compressed-context headers).
const USER_META =
  /<system-reminder>|<\/?goal_round\b|<acp\b|\[model changed|\[Compressed conversation section\]|Time sampled while preparing|The user changed the approval policy|TASK AS OF THIS BLOCK|Open objectives:|Fingerprints show|No compressible ranges|^Objective:\s|^Round:\s+\d+\/\d+|^Continue working toward/;

const ACK =
  /^(?:ok|okay|yes|no|thanks|thank you|acknowledged|got it|sure|fine|continue|proceed|go on|go ahead|next|looks good|lgtm|好|好的|嗯|行|可以|继续|收到|明白|谢谢|知道了|了解|哦|对|是|嗯嗯)[.!！。～~]*$/i;

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * Extract imperative "rules" from a system prompt. Each rule is a verbatim
 * line carrying a directive verb (must / never / always / 禁止 / 必须 / …).
 * Tool-catalog lines (JSON schemas, "Call when asked") are skipped so we
 * surface behavioral instructions, not the harness's tool listing.
 */
export function extractRules(systemPrompt: string): Rule[] {
  const lines = systemPrompt.split('\n');
  const rules: Rule[] = [];
  let heading = '';
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^#{1,6}\s+\S/.test(raw)) {
      heading = line.replace(/^#{1,6}\s+/, '').trim();
      continue;
    }

    if (!line || line.length < 6) continue;
    if (NOISE.test(line)) continue;
    if (JSON_KEY.test(line)) continue;
    if (!DIRECTIVE.test(line)) continue;

    // Skip tool-catalog prose: "Call when asked …" without a real directive.
    if (/call when|call this tool|parameters|max_uses|^usage:/i.test(line) && !/(never|must|always|do not|don'?t|禁止|必须|不要|务必|严禁)/i.test(line)) {
      continue;
    }

    const id = hash(line);
    if (rules.some((r) => r.id === id)) continue;
    rules.push({ id, text: line, heading: heading || undefined });
  }

  return rules;
}

/** A rule plus where it came from — this is what determines eviction. */
export interface ExtractedRule {
  rule: Rule;
  source: 'system' | 'user';
  /** Turn the rule first entered context (1 for system rules). */
  firstTurn: number;
}

/** Substantive lines of a single user message (the evictable constraints). */
export function extractUserRules(text: string, turn: number): Rule[] {
  const rules: Rule[] = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line || line.length < 6) continue;
    if (NOISE.test(line) || JSON_KEY.test(line)) continue;
    if (ACK.test(line) || USER_META.test(line)) continue;
    const id = hash(line);
    if (rules.some((r) => r.id === id)) continue;
    rules.push({ id, text: line, heading: `user @ turn ${turn}` });
  }
  return rules;
}

/** System-prompt directives (always re-sent, never truly evicted) + user instructions (evictable). */
export function extractAllRules(trace: Trace): ExtractedRule[] {
  const out: ExtractedRule[] = [];
  for (const r of extractRules(trace.meta.systemPrompt)) {
    out.push({ rule: r, source: 'system', firstTurn: 1 });
  }
  const seen = new Set<string>(out.map((e) => e.rule.id));

  for (const s of trace.steps) {
    for (const m of s.messages) {
      if (m.role !== 'user') continue;
      const text = m.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      if (!text || USER_META.test(text)) continue;
      for (const r of extractUserRules(text, s.turn)) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ rule: r, source: 'user', firstTurn: s.turn });
      }
    }
  }
  return out;
}

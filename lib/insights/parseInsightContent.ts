// The webhook's response shape isn't controlled by this app — it's
// whatever the configured n8n workflow returns. In practice that
// workflow's own JSON-parsing of the model's output can itself fail
// (most commonly because the model wrapped its JSON in a ```json fence,
// which many n8n "parse model output" steps don't strip first), landing
// here as {error: "...", raw: "```json\n{...}\n```"} instead of the
// intended structured object. This unwraps as far as it reasonably can
// rather than assuming one fixed shape, and only falls back to plain
// text when nothing recognizable is found — never nothing at all.

export interface StructuredInsight {
  summary: string;
  patterns: string[];
  considerations: string[];
  doctorDiscussionTopics: string[];
}

export interface ParsedInsight {
  structured: StructuredInsight | null;
  // Always populated, even when `structured` isn't, so the caller never
  // has literally nothing to render.
  fallbackText: string;
}

function stripJsonFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1] : text;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Each entry is usually a plain string, but some workflows nest
// {observation, confidence} objects per pattern instead — surface the
// observation text with confidence folded in parenthetically rather than
// silently dropping either shape.
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.observation === 'string') {
          return typeof obj.confidence === 'string' ? `${obj.observation} (confidence: ${obj.confidence})` : obj.observation;
        }
      }
      return null;
    })
    .filter((s): s is string => s != null);
}

function asStructured(candidate: unknown): StructuredInsight | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  if (typeof obj.summary !== 'string') return null;
  return {
    summary: obj.summary,
    patterns: asStringArray(obj.patterns),
    considerations: asStringArray(obj.considerations),
    doctorDiscussionTopics: asStringArray(obj.doctor_discussion_topics ?? obj.doctorDiscussionTopics),
  };
}

export function parseInsightContent(insight: unknown): ParsedInsight {
  let candidate: unknown = insight;

  // A bare (possibly fenced) JSON string rather than an already-parsed object.
  if (typeof candidate === 'string') {
    candidate = tryParseJson(stripJsonFence(candidate)) ?? candidate;
  }

  // The n8n "couldn't parse model output" fallback shape described above
  // — unwrap `raw` rather than showing the error wrapper verbatim.
  if (candidate && typeof candidate === 'object' && !asStructured(candidate)) {
    const obj = candidate as Record<string, unknown>;
    if (typeof obj.raw === 'string') {
      candidate = tryParseJson(stripJsonFence(obj.raw)) ?? candidate;
    }
  }

  const structured = asStructured(candidate);
  if (structured) return { structured, fallbackText: structured.summary };

  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    for (const key of ['text', 'message', 'insight']) {
      if (typeof obj[key] === 'string') return { structured: null, fallbackText: obj[key] as string };
    }
  }

  if (typeof insight === 'string') return { structured: null, fallbackText: insight };
  return { structured: null, fallbackText: JSON.stringify(insight) };
}

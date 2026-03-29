export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

export const TRIANGLE_FALLBACK: Skeleton = {
  points: [[0.5, 0], [0, 1], [1, 1]],
  edges: [[0, 1], [1, 2], [2, 0]],
};

const MODEL = 'anthropic/claude-3-5-haiku';

// Step 1 — describe the iconic silhouette in plain language
export const DESCRIBE_PROMPT = (word: string): string =>
  `What is the single most iconic, instantly recognisable visual silhouette of "${word}"?

Describe it in one sentence as if guiding someone to draw it from scratch. Be precise about the positions of key features. Examples:
- "love" → "A heart: two rounded lobes side-by-side at the top, curving down and inward to meet at a sharp downward point at the bottom center."
- "dog" → "A dog in left-facing profile: a horizontal oval body in the center, a raised rectangular head with a snout extending left, four short legs hanging down, and a tail curving upward at the right."
- "eiffel tower" → "The Eiffel Tower: a sharp spire at the top center, two diagonal struts spreading outward to mid-height, then two wider diagonal legs splaying further to a broad rectangular base at the bottom."
- "lightning bolt" → "A zigzag lightning bolt: a line going down-right, then sharply down-left, then down-right again, ending in a point."

Respond with only the one-sentence description, no preamble.`;

// Step 2 — convert description to connect-the-dots skeleton
export const DRAW_PROMPT = (description: string): string =>
  `Convert this silhouette description into a connect-the-dots skeleton:

"${description}"

Return a JSON object with exactly these fields:
- "points": 8–15 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": [i, j] index pairs connecting points into lines.

Place points to faithfully trace the described shape. Concentrate more points where the shape has distinctive curves or corners.

Respond with only the JSON object, no explanation.`;

async function llmText(prompt: string, apiKey: string): Promise<string | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function llmJson(prompt: string, apiKey: string): Promise<unknown | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}

export function isValidSkeleton(obj: unknown): obj is Skeleton {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as Record<string, unknown>;
  if (!Array.isArray(s.points) || s.points.length < 3 || s.points.length > 15) return false;
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 2) return false;
    if (typeof p[0] !== 'number' || typeof p[1] !== 'number') return false;
    if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return false;
  }
  if (!Array.isArray(s.edges) || s.edges.length < 2) return false;
  for (const e of s.edges) {
    if (!Array.isArray(e) || e.length !== 2) return false;
    if (typeof e[0] !== 'number' || typeof e[1] !== 'number') return false;
    if (e[0] < 0 || e[0] >= s.points.length || e[1] < 0 || e[1] >= s.points.length) return false;
  }
  return true;
}

export async function callLlm(word: string, apiKey: string): Promise<Skeleton | null> {
  const description = await llmText(DESCRIBE_PROMPT(word), apiKey);
  if (!description) return null;
  const parsed = await llmJson(DRAW_PROMPT(description), apiKey);
  return isValidSkeleton(parsed) ? parsed : null;
}

export async function generateSkeleton(word: string, apiKey: string): Promise<Skeleton> {
  let skeleton = await callLlm(word, apiKey);
  if (!skeleton) skeleton = await callLlm(word, apiKey);
  return skeleton ?? TRIANGLE_FALLBACK;
}

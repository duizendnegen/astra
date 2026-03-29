export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

export const TRIANGLE_FALLBACK: Skeleton = {
  points: [[0.5, 0], [0, 1], [1, 1]],
  edges: [[0, 1], [1, 2], [2, 0]],
};

const MODEL = 'anthropic/claude-3-5-haiku';

// Step 1 — describe 3 iconic silhouettes in plain language
export const DESCRIBE_MULTI_PROMPT = (word: string): string =>
  `Name 3 different iconic visual silhouettes of "${word}" that would work perfectly as a simple emoji or pictogram.

CRITICAL: Each silhouette must be:
- Instantly recognisable to any human at a glance — like 🐕 🌙 ❤️ 🗼
- Drawn from the most natural viewing angle a person would see it
- Reducible to 8–15 connected dots that capture the essential outline
- Bold, clean, and unambiguous — no fine detail, no texture, no interior structure

IMPORTANT rules:
- Draw from the perspective a person naturally sees it — NOT overhead, NOT a floor plan, NOT a cross-section, NOT a technical diagram
- Each of the 3 variants should depict a different recognisable aspect of "${word}"
- Think street sign / emoji / app icon level of simplicity

Bad examples (do NOT do this):
- "shower" → bathroom floor plan seen from above ✗
- "house" → architectural floor plan ✗
- "tree" → botanical cross-section ✗
- "eiffel tower" → square base with internal lattice detail ✗

Good examples:
- "shower" → shower head angled toward viewer with water spray arcing downward; OR person silhouette standing under falling water; OR close-up of circular shower rose with water jets
- "dog" → dog in left-facing profile with body, head, tail; OR front-facing dog face with ears and snout; OR seated dog silhouette
- "eiffel tower" → narrow tapering tower silhouette: wide arched base, two narrowing tiers, pointed antenna on top; OR just the iconic top half with antenna

Respond with a JSON object: { "descriptions": ["<sentence 1>", "<sentence 2>", "<sentence 3>"] }
Each sentence should guide someone to draw the silhouette from scratch in 8–15 dots. No preamble.`;

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

async function getDescriptions(word: string, apiKey: string): Promise<string[]> {
  const raw = await llmJson(DESCRIBE_MULTI_PROMPT(word), apiKey);
  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as Record<string, unknown>).descriptions)
  ) {
    const descs = (raw as { descriptions: unknown[] }).descriptions
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      .slice(0, 3);
    if (descs.length > 0) return descs;
  }
  return [];
}

async function generateVariants(word: string, apiKey: string): Promise<Skeleton[]> {
  const descriptions = await getDescriptions(word, apiKey);
  if (descriptions.length === 0) return [];

  const results = await Promise.all(
    descriptions.map((desc) => llmJson(DRAW_PROMPT(desc), apiKey)),
  );

  return results.filter(isValidSkeleton);
}

export async function generateSkeleton(word: string, apiKey: string): Promise<Skeleton[]> {
  let skeletons = await generateVariants(word, apiKey);
  if (skeletons.length === 0) skeletons = await generateVariants(word, apiKey);
  return skeletons.length > 0 ? skeletons : [TRIANGLE_FALLBACK];
}

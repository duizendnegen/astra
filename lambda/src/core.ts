export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

// Re-export retrieveSkeleton as the primary skeleton generation path.
// generateSkeleton is kept below for reference and experiment runs.
export { retrieveSkeleton, type PipelineResult, type MatchProvenance } from './retrieval.js';
import { createLogger } from './logger.js';

const log = createLogger('core');

export const TRIANGLE_FALLBACK: Skeleton = {
  points: [[0.5, 0], [0, 1], [1, 1]],
  edges: [[0, 1], [1, 2], [2, 0]],
};

const MODEL = process.env.SKELETON_MODEL ?? 'anthropic/claude-haiku-4.5';

// Step 1 — describe 3 iconic silhouettes in plain language
export const DESCRIBE_MULTI_PROMPT = (word: string): string =>
  `Name 3 different iconic visual silhouettes of "${word}" that would work perfectly as a simple emoji or pictogram.

CRITICAL: Each silhouette must be:
- Instantly recognisable to any human at a glance
- Drawn from the most natural viewing angle a person would see it
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

MUST respond with a ONLY a JSON object: { "descriptions": ["<sentence 1>", "<sentence 2>", "<sentence 3>"] }`;

// Q-series describe step — single iconic description, emphasises outline recognisability
export const DESCRIBE_SINGLE_PROMPT = (word: string): string =>
  `Describe the single most iconic visual silhouette of "${word}" — the version that is instantly recognisable purely from its outer outline, with no interior detail needed.

CRITICAL requirements:
- The shape must be identifiable from its silhouette outline alone — imagine it as a solid black cut-out
- Choose the most universally recognised form: as seen on signs, emoji, badges, or logos
- Natural viewing angle: the perspective a person normally encounters it in real life
- Bold and unambiguous — no fine detail, texture, or interior structure

Bad examples (NOT these):
- "shower" → bathroom floor plan seen from above ✗
- "house" → architectural floor plan ✗
- "eiffel tower" → square base with internal lattice detail ✗

Good examples:
- "heart" → classic symmetrical heart: two rounded lobes at top curving down to a sharp point at the bottom
- "star" → five-pointed star with evenly-spaced pointed tips and indented sides between them
- "bird" → bird in left-facing profile: rounded body, small head with beak, folded wing, fan tail, two thin legs

The description must start with "the outline of a ${word}: " followed by one to three sentences describing the outline.

MUST respond with ONLY a JSON object: { "descriptions": ["the outline of a ${word}: <description>"] }`;

// Step 2 — convert description to connect-the-dots skeleton (baseline)
export const DRAW_PROMPT = (description: string): string =>
  `Convert this silhouette description into a connect-the-dots skeleton:

"${description}"

Return a JSON object with exactly these fields:
- "points": 8–15 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": [i, j] index pairs connecting points into lines.

Place points to faithfully trace the described shape. Concentrate more points where the shape has distinctive curves or corners.

CRITICAL: Only draw outline/silhouette edges. Do NOT add chords, interior cross-braces, or fill lines. Every edge MUST trace the outer boundary of the shape.

MUST respond with a ONLY a JSON object, no explanation.`;


async function llmText(prompt: string, apiKey: string, model: string = MODEL): Promise<string | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function llmJson(prompt: string, apiKey: string, model: string = MODEL): Promise<unknown | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    log.warn({ status: response.status, body: errText.slice(0, 200) }, 'llmJson HTTP error');
    return null;
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: unknown };
  if (data.error) log.warn({ error: JSON.stringify(data.error)?.slice(0, 200) }, 'llmJson API error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    log.warn({ data: JSON.stringify(data)?.slice(0, 300) }, 'llmJson no content');
    return null;
  }
  // Strip markdown code fences and JS-style comments that some LLMs inject into JSON output
  const stripped = content
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  try { return JSON.parse(stripped); } catch (e) {
    log.warn({ content: content.slice(0, 200) }, 'llmJson JSON parse failed');
    return null;
  }
}

export function normaliseSkeleton(obj: unknown): Skeleton | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const s = obj as Record<string, unknown>;
  if (!Array.isArray(s.points) || s.points.length < 5) return null;
  const points: [number, number][] = [];
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    if (typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
    // Clamp to [0,1] instead of rejecting — catches slightly-out-of-bounds LLM output
    points.push([Math.max(0, Math.min(1, p[0])), Math.max(0, Math.min(1, p[1]))]);
  }
  if (!Array.isArray(s.edges) || s.edges.length < 2) return null;
  const edges: [number, number][] = [];
  for (const e of s.edges) {
    if (!Array.isArray(e) || e.length !== 2) return null;
    if (typeof e[0] !== 'number' || typeof e[1] !== 'number') return null;
    if (e[0] < 0 || e[0] >= points.length || e[1] < 0 || e[1] >= points.length) return null;
    edges.push([e[0], e[1]]);
  }
  return { points, edges };
}

export function isValidSkeleton(obj: unknown): obj is Skeleton {
  return normaliseSkeleton(obj) !== null;
}

async function getDescriptions(word: string, apiKey: string, promptFn: (w: string) => string = DESCRIBE_MULTI_PROMPT, model: string = MODEL, max: number = 3): Promise<string[]> {
  const raw = await llmJson(promptFn(word), apiKey, model);
  log.debug({ word, raw: JSON.stringify(raw)?.slice(0, 200) }, 'getDescriptions raw');
  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as Record<string, unknown>).descriptions)
  ) {
    const descs = (raw as { descriptions: unknown[] }).descriptions
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      .slice(0, max);
    if (descs.length > 0) return descs;
  }
  return [];
}

async function generateVariants(word: string, apiKey: string, model: string = MODEL): Promise<Skeleton[]> {
  const descriptions = await getDescriptions(word, apiKey, DESCRIBE_MULTI_PROMPT, model, 3);
  if (descriptions.length === 0) {
    log.warn({ word }, 'no descriptions');
    return [];
  }
  log.debug({ word, descriptions: descriptions.map((d, i) => `${i}: ${d.slice(0, 60)}...`) }, 'descriptions');

  const results = await Promise.all(
    descriptions.map((desc) => llmJson(DRAW_PROMPT(desc), apiKey, model)),
  );

  const validated = results.map((r, i) => {
    const s = normaliseSkeleton(r);
    if (!s) {
      const pts = (r as Record<string, unknown>)?.points;
      log.warn({ word, index: i, pts: Array.isArray(pts) ? pts.length : 'none', raw: JSON.stringify(r)?.slice(0, 120) }, 'skeleton INVALID');
    } else {
      log.debug({ word, index: i, points: s.points.length, edges: s.edges.length }, 'skeleton OK');
    }
    return s;
  });

  return validated.filter((s): s is Skeleton => s !== null);
}

export async function generateSkeleton(word: string, apiKey: string, model?: string): Promise<Skeleton[]> {
  const m = model ?? MODEL;
  let skeletons = await generateVariants(word, apiKey, m);
  if (skeletons.length === 0) skeletons = await generateVariants(word, apiKey, m);
  return skeletons.length > 0 ? skeletons : [TRIANGLE_FALLBACK];
}

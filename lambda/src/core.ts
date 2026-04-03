export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

// Re-export retrieveSkeleton as the primary skeleton generation path.
// generateSkeleton is kept below for reference and experiment runs.
export { retrieveSkeleton, type PipelineResult, type MatchProvenance } from './retrieval.js';

export const TRIANGLE_FALLBACK: Skeleton = {
  points: [[0.5, 0], [0, 1], [1, 1]],
  edges: [[0, 1], [1, 2], [2, 0]],
};

const MODEL = process.env.SKELETON_MODEL ?? 'anthropic/claude-haiku-4.5';

// PROMPT_VARIANT selects the P-series experiment variant: null (default), 'p1', 'p2', 'p3', 'p4'
const PROMPT_VARIANT = process.env.PROMPT_VARIANT ?? null;

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

// P3 — cultural/contextual framing: ground each variant in how it appears in human culture
export const DESCRIBE_MULTI_PROMPT_P3 = (word: string): string =>
  `Name 3 different iconic visual silhouettes of "${word}" as it appears in everyday human culture — on signs, flags, badges, logos, and emoji.

CRITICAL: Each silhouette must be:
- The version most universally recognised across cultures
- Drawn from the perspective a person naturally encounters it in the real world
- Bold, clean, and unambiguous — as simple as a street sign or emoji

For each variant, ground it in a specific cultural context that defines the shape and proportions. Examples of good cultural framing:
- "star" → "a five-pointed star as used on national flags and sheriff badges — pointed tips, indented sides"
- "crown" → "a crown as depicted in European heraldry — three or five peaks, open top, band at base"
- "sword" → "a broadsword as shown on a coat of arms — straight double-edged blade, cross-guard, grip"
- "bird" → "a dove silhouette as used on peace symbols — body in profile, wings slightly raised"

Each of the 3 variants should depict a different recognisable aspect of "${word}".

MUST respond with a ONLY a JSON object: { "descriptions": ["<sentence 1>", "<sentence 2>", "<sentence 3>"] }`;

// P4 — perspective + orientation hint: each description must specify canonical viewing angle
export const DESCRIBE_MULTI_PROMPT_P4 = (word: string): string =>
  `Name 3 different iconic visual silhouettes of "${word}" that would work perfectly as a simple emoji or pictogram.

CRITICAL: Each silhouette must be:
- Instantly recognisable to any human at a glance
- Bold, clean, and unambiguous — no fine detail, no texture, no interior structure

For EACH variant, your description must include two things:
1. What the shape looks like (key features, proportions, distinctive elements)
2. The canonical viewing angle and orientation — e.g. "viewed from the side, facing left" or "seen from directly in front, upright and symmetrical" or "from a 3/4 angle, tilted 30° clockwise"

Each of the 3 variants should depict a different recognisable aspect of "${word}".

MUST respond with a ONLY a JSON object: { "descriptions": ["<sentence 1>", "<sentence 2>", "<sentence 3>"] }`;

// A2 — direct one-step: skip description phase, produce skeleton JSON directly for the word
export const DRAW_DIRECT_PROMPT = (word: string): string =>
  `Convert the word "${word}" into a connect-the-dots skeleton of its most iconic silhouette.

Think of the most universally recognised visual form of "${word}" — as seen on a sign, badge, or emoji. Picture it clearly, then trace its outline as a minimal set of key points.

Return a JSON object with exactly these fields:
- "points": 8–15 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": [i, j] index pairs connecting points into lines.

CRITICAL: Only draw outline/silhouette edges. Do NOT add chords, interior cross-braces, or fill lines. Every edge MUST trace the outer boundary of the shape.

MUST respond with a ONLY a JSON object, no explanation.`;

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

// P1 — appearance-first: visualise the shape before applying skeleton rules
export const DRAW_PROMPT_P1 = (description: string): string =>
  `You are drawing a connect-the-dots skeleton of a visual shape.

The shape is: "${description}"

Before placing any points, picture the silhouette clearly in your mind: what are its most distinctive features? Where are its sharpest corners? What proportions define it? Now trace those key structural points.

Return a JSON object with exactly these fields:
- "points": 8–15 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": [i, j] index pairs connecting points into lines.

Place points at the most visually distinctive positions — tips, corners, and major direction changes that define the shape's silhouette.

CRITICAL: Only draw outline/silhouette edges. Do NOT add chords, interior cross-braces, or fill lines. Every edge MUST trace the outer boundary of the shape.

MUST respond with a ONLY a JSON object, no explanation.`;

// P2 — minimal instruction: appearance description + output schema only, no geometric rules
export const DRAW_PROMPT_P2 = (description: string): string =>
  `Convert this visual description into a skeleton of key outline points and connecting edges:

"${description}"

Return a JSON object with exactly these fields:
- "points": 8–15 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom.
- "edges": [i, j] index pairs connecting points.

MUST respond with a ONLY a JSON object, no explanation.`;

// Q1 — fewer points, turning-points-only instruction
export const DRAW_PROMPT_Q1 = (description: string): string =>
  `Convert this visual description into a connect-the-dots skeleton:

"${description}"

Return a JSON object with exactly these fields:
- "points": 5–8 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom.
  Place points ONLY at major direction changes — corners, peaks, and tips.
  Do NOT add intermediate points on smooth curves or straight sections.
- "edges": [i, j] index pairs connecting points into the outline.

MUST respond with ONLY a JSON object, no explanation.`;

// Q2 — forced closed polygon (no interior edges)
export const DRAW_PROMPT_Q2 = (description: string): string =>
  `Convert this visual description into a closed outline polygon:

"${description}"

The shape's outline is a single closed loop. Place 5–9 points clockwise around
the outer silhouette, starting from the topmost point.

Return a JSON object with exactly these fields:
- "points": 5–9 [x, y] pairs in clockwise order. x=0 is left, x=1 is right,
  y=0 is top, y=1 is bottom.
- "edges": connect them as a closed polygon: [[0,1],[1,2],...,[N-1,0]].

MUST respond with ONLY a JSON object, no explanation.`;

// Q3 — named points first, then coordinates (two-step draw)
export const DRAW_PROMPT_Q3 = (description: string): string =>
  `Convert this visual description into a skeleton:

"${description}"

Step 1 — identify the 5–8 key structural points of this shape by name.
  A "key structural point" is a corner, tip, or peak where the outline
  changes direction. List them in order around the outline.

Step 2 — for each named point, give its [x, y] position.
  x=0 is left, x=1 is right, y=0 is top, y=1 is bottom.

Return a JSON object with exactly these fields:
- "points": [[x,y], ...] one entry per named point, in outline order
- "edges": connect consecutive points plus close the loop: [[0,1],[1,2],...,[N-1,0]]

MUST respond with ONLY a JSON object, no explanation.`;

// Q4 — worked example + calibration anchor
export const DRAW_PROMPT_Q4 = (description: string): string =>
  `Convert this visual description into a connect-the-dots skeleton:

"${description}"

Return a JSON object with exactly these fields:
- "points": 5–9 [x, y] pairs. x=0 is left, x=1 is right, y=0 is top, y=1 is bottom.
  Use ONLY key turning points of the outer outline — corners, tips, and peaks.
- "edges": a CLOSED polygon connecting points in outline order: [[0,1],[1,2],...,[N-1,0]].

EXAMPLE — "a classic heart: two rounded lobes at top, meeting at a downward point":
{
  "points": [[0.5,0.28],[0.76,0.08],[0.96,0.32],[0.82,0.62],[0.5,0.96],[0.18,0.62],[0.04,0.32],[0.24,0.08]],
  "edges": [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0]]
}

MUST respond with ONLY a JSON object, no explanation.`;

// Q5 — high-density outline: 30–50 points tracing the full silhouette smoothly
export const DRAW_PROMPT_Q5 = (description: string): string =>
  `Convert this visual description into a dense connect-the-dots outline:

"${description}"

Trace the complete outer silhouette of the shape with 30–50 points, placed closely enough
that connecting consecutive points produces smooth, recognisable curves. Think of it as
drawing the shape with a pencil — enough dots to capture every curve and corner clearly.

Return a JSON object with exactly these fields:
- "points": 30–50 [x, y] pairs in order around the outline. x=0 is left, x=1 is right,
  y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": connect them as a closed polygon: [[0,1],[1,2],...,[N-1,0]].

MUST respond with a ONLY a JSON object, no explanation.`;

// Q6 — unconstrained detail: use as many points as needed to accurately describe the shape
export const DRAW_PROMPT_Q6 = (description: string): string =>
  `Convert this visual description into a detailed connect-the-dots outline:

"${description}"

Trace the complete outer silhouette accurately and ensure the shape is recognizable. Use as many points as the shape requires —
add more points wherever the outline curves or changes direction, fewer where it is straight.
Prioritise accuracy over brevity.

Return a JSON object with exactly these fields:
- "points": [x, y] pairs in order around the outline. x=0 is left, x=1 is right,
  y=0 is top, y=1 is bottom. Use decimal values precise to 0.01.
- "edges": connect them as a closed polygon: [[0,1],[1,2],...,[N-1,0]].

MUST respond with ONLY a JSON object, no explanation, no annotations.`;

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
    console.log(`[core] llmJson HTTP ${response.status}: ${errText.slice(0, 200)}`);
    return null;
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: unknown };
  if (data.error) console.log(`[core] llmJson API error:`, JSON.stringify(data.error)?.slice(0, 200));
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.log(`[core] llmJson no content, data:`, JSON.stringify(data)?.slice(0, 300));
    return null;
  }
  // Strip markdown code fences and JS-style comments that some LLMs inject into JSON output
  const stripped = content
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  try { return JSON.parse(stripped); } catch (e) {
    console.log(`[core] llmJson JSON parse failed: ${content.slice(0, 200)}`);
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
  console.log(`[core] getDescriptions "${word}" raw:`, JSON.stringify(raw)?.slice(0, 200));
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

async function generateVariants(word: string, apiKey: string, model: string = MODEL, promptVariant: string | null = PROMPT_VARIANT): Promise<Skeleton[]> {
  // A2: one-step — skip description phase entirely
  if (promptVariant === 'a2') {
    const result = await llmJson(DRAW_DIRECT_PROMPT(word), apiKey, model);
    const s = normaliseSkeleton(result);
    if (s) {
      console.log(`[core] "${word}" direct skel OK: ${s.points.length} pts, ${s.edges.length} edges`);
      return [s];
    }
    console.log(`[core] "${word}" direct skel INVALID`);
    return [];
  }

  const isQSeries = promptVariant !== null && /^q\d/.test(promptVariant);
  const describePromptFn = promptVariant === 'p3' ? DESCRIBE_MULTI_PROMPT_P3
    : promptVariant === 'p4' ? DESCRIBE_MULTI_PROMPT_P4
    : isQSeries ? DESCRIBE_SINGLE_PROMPT
    : DESCRIBE_MULTI_PROMPT;
  const maxDescriptions = isQSeries ? 1 : 3;
  const drawPromptFn = promptVariant === 'p1' ? DRAW_PROMPT_P1
    : promptVariant === 'p2' ? DRAW_PROMPT_P2
    : promptVariant === 'q1' ? DRAW_PROMPT_Q1
    : promptVariant === 'q2' ? DRAW_PROMPT_Q2
    : promptVariant === 'q3' ? DRAW_PROMPT_Q3
    : promptVariant === 'q4' ? DRAW_PROMPT_Q4
    : promptVariant === 'q5' ? DRAW_PROMPT_Q5
    : promptVariant === 'q6' ? DRAW_PROMPT_Q6
    : DRAW_PROMPT;

  const descriptions = await getDescriptions(word, apiKey, describePromptFn, model, maxDescriptions);
  if (descriptions.length === 0) {
    console.log(`[core] no descriptions for "${word}"`);
    return [];
  }
  console.log(`[core] "${word}" descriptions:`, descriptions.map((d, i) => `${i}: ${d.slice(0, 60)}...`));

  const results = await Promise.all(
    descriptions.map((desc) => llmJson(drawPromptFn(desc), apiKey, model)),
  );

  const validated = results.map((r, i) => {
    const s = normaliseSkeleton(r);
    if (!s) {
      const pts = (r as Record<string, unknown>)?.points;
      console.log(`[core] "${word}" skel${i} INVALID: pts=${Array.isArray(pts) ? pts.length : 'none'} raw=${JSON.stringify(r)?.slice(0, 120)}`);
    } else {
      console.log(`[core] "${word}" skel${i} OK: ${s.points.length} pts, ${s.edges.length} edges`);
    }
    return s;
  });

  return validated.filter((s): s is Skeleton => s !== null);
}

export async function generateSkeleton(word: string, apiKey: string, model?: string, promptVariant?: string | null): Promise<Skeleton[]> {
  const m = model ?? MODEL;
  const pv = promptVariant !== undefined ? promptVariant : PROMPT_VARIANT;
  let skeletons = await generateVariants(word, apiKey, m, pv);
  if (skeletons.length === 0) skeletons = await generateVariants(word, apiKey, m, pv);
  return skeletons.length > 0 ? skeletons : [TRIANGLE_FALLBACK];
}

# astra.plusx.black
### Project Plan

---

## Concept

Users enter any word — a person, object, animal, feeling, place — and the application finds a real pattern in the night sky that matches its shape, drawing a novel constellation. The result is named, shareable as a link, and exportable as a PNG. Every constellation is anchored in real star data, so it genuinely exists in the sky.

The experience is intentionally minimal: a dark star field, a single input, a slow animation of lines connecting stars, the word as overlay. The moment of the constellation appearing is the product.

---

## Scope & Iterations

### Iteration 1 — Core Experience

A fixed, beautiful star field rendered from real star data. Users create constellations from any word, share them via link, and export as PNG. The sky is not time- or location-specific in this version — it is a stable, aesthetically curated view of the full sky.

### Iteration 2 — Live Sky

Users can optionally filter to stars visible from their current location at the current time. Constellations created in Iteration 1 remain valid — they are stored in real sky coordinates and can be located from anywhere on Earth at the right time of year. The overlay text evolves from just the word to include "visible from \<city\>".

---

## Technical Architecture

### Star Data

Source: **HYG Database** (Hipparcos/Yale/Gliese combined catalogue). Contains ~120,000 stars with right ascension, declination, visual magnitude, and common names. Filtered to magnitude ≤ 6 for the visible star field (~9,000 stars). This dataset serves both iterations without modification — Iteration 2 adds coordinate transformation on top of the same source.

> Store star IDs from HYG as the canonical reference throughout. All constellations are encoded as HYG star IDs, making them stable and future-proof.

### Rendering

D3.js for coordinate projection (RA/Dec → screen x,y), rendered onto an HTML Canvas element. Stars drawn as canvas arcs scaled by magnitude. PNG export is `canvas.toDataURL()` — no conversion step needed. The word overlay is HTML/CSS positioned over the canvas, composited onto the canvas at export time via `ctx.fillText()`.

The constellation sits within a "portrait with context" framing: the matched stars are centred and brightened, surrounding stars visible but dimmed, giving the sense of a larger sky receding around the subject.

### Camera Model

The canvas has a single camera defined by two values: a projection centre (RA/Dec) and a field of view. Landing and result are two states of the same camera; the transition between them is an animated pan and zoom through the real sky.

**Scale calculation** — anchored to the short viewport dimension (height on desktop landscape, width on mobile portrait), so angular coverage is consistent across devices:

```
scale = (shortDimension / 2) / (2 × tan(fov / 2))
```

**Landing state**
- Centre: RA 83.8°, Dec −5.4° (Orion, near Alnilam)
- Field of view: 60° in short viewport dimension
- Stars: uniform brightness by magnitude

**Result state**
- Centre: matched patch RA/Dec (from Hungarian algorithm)
- Field of view: 25° in short viewport dimension (~2.6× zoom from landing)
- Stars: brightness dimmed by distance from constellation centre

**Transition sequence**
1. Page loads → canvas renders at landing state
2. User submits word → LLM call begins, star field remains visible
3. Skeleton arrives → matching runs instantly (<100ms)
4. Camera animates to result state: projection centre and scale interpolated over ~2s, ease-in-out. Stars move and scale naturally throughout — no special handling, falls out of the projection math.
5. Camera settles → brightness effect applies, constellation lines appear, word overlay fades in.

Default constellation size: **25° patch** (range 20–30°), matching the intuitive scale of familiar constellations like Orion or Cassiopeia. A size parameter can be exposed later without redesign.

### Coordinate System

All internal coordinates use RA/Dec (right ascension / declination). Pixel positions for rendering are computed at runtime from the projection. This means constellation data is always in sky-space, never screen-space — a prerequisite for Iteration 2's location filtering.

---

## The Shape Pipeline

The core loop: word → skeleton → star matching → drawn constellation.

### Step 1 — Word to Skeleton (LLM)

An LLM is prompted to return a JSON skeleton of the word as a simple line drawing: 6–10 normalised (x,y) keypoints (0–1 range) capturing the most recognisable silhouette or profile of the thing, plus an edge list as index pairs defining which points connect.

> Prompt: *"Return a JSON skeleton of [word] as a connect-the-dots drawing. Give 6–10 points as normalised x,y coordinates (0–1 range), a list of edges as index pairs, and a poetic constellation name of 1–2 words. Capture the most recognisable silhouette or profile. If the word is abstract, depict a conventional visual symbol or metaphor — scales for justice, a figure reaching forward for longing, a flame for passion. Prioritise readability over completeness."*
>
> Response schema: `{ name: string, points: [x,y][], edges: [number,number][] }`

The edge list is as important as the points — it encodes which stars to connect, so the drawn lines tell the shape's story rather than just plotting dots.

**Failure handling:** If the response is malformed or fails schema validation, retry once. If the second attempt also fails, fall back to a triangle skeleton `{ points: [[0.5,0],[0,1],[1,1]], edges: [[0,1],[1,2],[2,0]] }` — a valid shape that still produces a real constellation.

### Step 2 — Matching (Loose)

Loose matching is intentional. Real constellations barely resemble their names — the lines and the label do the storytelling. The algorithm finds a plausible fit, not a precise one.

1. Select a candidate 25° patch of the star field (random, or from pre-seeded regions with good star density).
2. Take the N brightest stars in the patch, where N approximates the skeleton's point count.
3. Normalise both the skeleton points and the candidate star positions to the same scale.
4. Run the **Hungarian algorithm** (optimal assignment) to map skeleton points to stars, minimising total distance. Allow rotation and scale variation.
5. Score = percentage of points matched within a distance threshold.
6. Accept if score ≥ 60%. Otherwise sample a new patch and retry.

> Not all skeleton points need to match — sufficient coverage is the goal. This mirrors how real constellations work.

### Step 3 — Drawing

Edges from the skeleton are redrawn between the matched real stars. Matched stars are slightly enlarged and brightened relative to the background field.

> Line drawing animation (lines growing in slowly) is deferred to a post-MVP iteration.

---

## UI & UX

### Landing

Full-screen dark star field. Single centred text input. Minimal prompt beneath — something like *"a person, object, animal, feeling…"* to spark creativity. No other interface chrome.

### Result View

The constellation appears centred in the star field. Lines draw themselves slowly. The user's word appears as a clean text overlay — large, light-weight, positioned above or below the constellation. Two action buttons: **Share Link** and **Download PNG**.

A **Regenerate** option (light, secondary) re-runs the matching on a different sky patch without re-querying the LLM. Same shape, new stars.

> Iteration 2 adds "visible from \<city\>" in lighter weight below the word, using the same typographic treatment.

### Aesthetic

Portrait with context: the constellation is the subject, but the surrounding star field is visible, giving a sense of depth and scale. Background stars dim progressively from the constellation outward. The feeling is intimate but cosmic.

---

## Export & Sharing

### PNG Export

Canvas export of the result view: dark background, star field, constellation lines, word overlay, and a small credit in the lower corner reading **astra.plusx.black**. Clean enough to share on any platform. No additional UI chrome in the export.

### Share Link

Encodes the full constellation as a URL parameter: the original word, the HYG star IDs of matched stars, the edge list, and the sky patch centre (RA/Dec). Everything needed to reproduce the constellation exactly is in the URL — no backend required to *replay* a shared link.

> Encoding strategy: compact JSON → base64 → URL parameter. Keep the link human-shareable in length.

---

## Implementation Phases

### Phase 1 — Canvas
Download HYG dataset. Build D3 star field renderer with stereographic projection, magnitude filtering, and basic star sizing. Render a clean, beautiful sky with no constellations. This is the foundation everything else sits on.

### Phase 2 — Shape Pipeline
Wire up Lambda `/skeleton` endpoint with OpenRouter. Define and test the JSON schema for skeleton output. Build the Hungarian matching algorithm with normalisation, rotation tolerance, and scoring. Test end-to-end with 5–10 words of varying complexity.

### Phase 3 — Drawing
Render matched constellation on the star field. Implement brightness differentiation between constellation stars and background. Add word overlay with final typography.

### Phase 4 — Export & Share
Implement PNG canvas export with credit. Build URL encoding/decoding for share links. Test round-trip: generate → encode → share → decode → render identically.

### Phase 5 — Polish & Deploy
Final visual polish, mobile responsiveness, performance optimisation (star field rendering, LLM latency handling). Deploy to astra.plusx.black.

### Phase 6 — Iteration 2 (Live Sky)
Add location detection (browser geolocation). Implement RA/Dec → altitude/azimuth transformation for a given time and location. Filter star field to above-horizon stars. Add "visible from \<city\>" overlay. Allow user to toggle between full sky and tonight's sky.

---

## Infrastructure & Deployment

**Deployment target:** AWS, with all infrastructure defined in AWS CDK.

**Domain:** astra.plusx.black — DNS managed via Route53 (plusx.black zone already owned).

**Architecture:**

```
Route53 (plusx.black)
  └── astra.plusx.black (A alias record)
        └── CloudFront distribution
              │   SSL: ACM certificate (us-east-1, covers astra.plusx.black)
              ├── Origin 1: S3 bucket (static site: HTML/JS/CSS, HYG star data)
              │             Access via OAC — bucket is private, not public
              └── Origin 2: API Gateway (path /api/*)
                    └── Lambda     (POST /api/skeleton — LLM proxy)
                          ├── DynamoDB (skeleton cache, on-demand billing)
                          └── OpenRouter API (LLM calls on cache miss)
```

**Frontend deployment:** S3 bucket (private) + CloudFront. CloudFront uses Origin Access Control (OAC) so the bucket is never publicly accessible — all traffic goes through CloudFront. HTTPS is handled by an ACM certificate provisioned in `us-east-1` (required for CloudFront regardless of the stack's primary region). Route53 A record for `astra.plusx.black` is an alias pointing to the CloudFront distribution. CDK handles the certificate validation automatically via DNS validation against the existing Route53 zone.

**Skeleton endpoint:** A single Lambda function exposes `POST /api/skeleton` accepting `{ word }` and returning `{ points, edges }`. It checks DynamoDB first; on a miss it calls OpenRouter and writes the result back. The browser never sees an API key.

**LLM provider:** OpenRouter. Decouples model choice from deployment — swap models by config, not code.

**Skeleton cache:** DynamoDB (on-demand mode). Schema: `word` (PK) → `skeleton` (JSON). Skeletons do not expire. Cost is negligible at expected traffic levels.

> The "no backend" claim in the original plan applies only to share link *replay* — generating a new constellation always requires the Lambda. Everything after generation (matching, rendering, export, decode) is client-side.

---

## Open Questions for Implementation

- ~~How to handle very abstract inputs~~ — single prompt strategy, LLM uses visual metaphor for abstract words. Fallback to triangle on schema failure after one retry. ✓
- Sky patch selection: fully random, or pre-seeded regions that tend to produce good constellation density?
- ~~Constellation naming~~ — LLM generates a poetic name (max 2 words) returned alongside the skeleton in the same API call. The user's input word is shown as the large overlay; the generated name appears as a smaller secondary label. ✓

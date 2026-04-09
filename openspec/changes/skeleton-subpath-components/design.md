## Context

`svg-to-skeleton.ts` currently supports two strategies — `concave-hull` and `polygon-union` — both of which collapse all subpaths into a single outer contour before simplification. This works for silhouette-style icons but fails for line drawings, where the structural information lives in the individual subpaths.

vtracer (`--colormode bw --mode polygon`) consistently encodes a line drawing as:
- **Subpath 0**: outer contour of all connected ink (noisy, spans the full bounding box)
- **Subpaths 1+**: white holes punched through the ink (structurally informative: wheel interiors, body cavities, frame spaces)

For "bicycle": subpaths 3 and 4 are each ~192×193px — the two wheel interiors — which is exactly the structural signal needed for a recognisable constellation. The current hull includes subpath 0 and produces a shapeless blob.

The vetting server (`03-vet-server.ts`) shows one skeleton per word. Operators cannot compare strategies and must accept/retry blindly.

## Goals / Non-Goals

**Goals:**
- Add `subpath-components` as a third strategy in `svg-to-skeleton.ts`
- Pre-compute all three skeletons in the vet server; show them side-by-side
- Let operators pick a strategy per word via keyboard shortcut; persist choice to CSV
- Carry the chosen strategy into the accepted record for potential downstream use

**Non-Goals:**
- Changing `retrieval.ts` or the live Lambda pipeline
- Auto-selecting a strategy algorithmically (manual vetting is the quality gate)
- Supporting strategies in the ingest step beyond recording the chosen name
- Modifying `04-ingest.ts` to re-run skeleton generation with the chosen strategy

## Decisions

### D1: subpath-components algorithm

**Decision**: For each subpath independently:
1. Sample points via the existing `samplePath()` function (reuse as-is)
2. Normalise coordinates via viewBox (same as existing strategies)
3. Allocate a point budget proportional to each subpath's raw point count (as a proxy for perimeter); minimum 3 points per subpath
4. RDP-simplify each subpath to its allocated budget
5. Build edges:
   - **Intra-subpath**: closed sequential loop `[0→1→…→n→0]` per subpath (index-local, offset by cumulative point count)
   - **Inter-subpath**: for each subpath, find the nearest point in any other subpath and add one bridge edge
6. If only one subpath exists: fall back to `concave-hull`

**Rationale**: Proportional budget allocation naturally gives more points to large structural subpaths (wheels) and fewer to small decorative ones, without requiring per-shape tuning.

**Alternative considered**: Allocate budget by bounding-box area rather than point count. Rejected — point count is already computed and is a good proxy for stroke complexity.

### D2: Point budget allocation formula

**Decision**:
```
perimeters[i] = subpaths[i].length  (raw sampled point count)
totalPerimeter = sum(perimeters)
allocated[i] = max(3, round(targetMax * perimeters[i] / totalPerimeter))
```
After initial allocation, if `sum(allocated) > targetMax`, scale down proportionally. Then run `simplifyToTarget(subpath, rdp, epsilon, allocated[i], allocated[i])` per subpath.

**Rationale**: Simple, parameter-free, naturally self-normalising.

### D3: Vetting UI layout

**Decision**: Replace the single skeleton canvas with three labelled canvases rendered side-by-side, one per strategy. Keyboard shortcuts `1`/`2`/`3` highlight the selected strategy for the current word. `A` accepts with the currently highlighted strategy recorded in `skeleton_strategy`. Default selection: none (operator must actively pick before accepting).

**Alternative considered**: Radio buttons instead of keyboard shortcuts. Rejected — operators already use keyboard-first workflow; adding mouse interaction slows vetting.

### D4: CSV schema extension

**Decision**: Add `skeleton_strategy` column to `words.csv` with values `concave-hull | polygon-union | subpath-components | ""` (empty = not yet selected). The column is written by `03-vet-server.ts` on accept and read by downstream scripts for reference only.

**Rationale**: Minimal schema change, backward-compatible (empty default). No changes to `04-ingest.ts` or the database.

### D5: Cache key update for new strategy

**Decision**: The skeleton cache key already includes `strategy` as a segment. Adding `subpath-components` to the strategy union requires no cache key changes — the new strategy name naturally differentiates its cache entries from existing ones.

## Risks / Trade-offs

- **Subpath ordering assumption**: The strategy assumes subpath 0 is the "outer contour" that dominates the hull, which is consistent with all vtracer outputs inspected (bicycle, anchor, apple, arrow). If vtracer changes its ordering in a future version this assumption could break. Mitigation: the strategy is additive — operators still have `concave-hull` and `polygon-union` as fallbacks.
- **Single-subpath shapes**: Icons with only one subpath (degenerate case) silently fall back to `concave-hull`. This is correct behaviour and is tested.
- **Inter-subpath bridges may look noisy**: If two subpaths are geometrically far apart, the bridge edge crosses empty space and may look unnatural. Mitigation: bridge edges are thin/de-emphasised in the UI, and operators can choose a different strategy.
- **Point budget rounding**: Small subpaths may hit the minimum (3 pts) and inflate the total beyond `targetMax`. Mitigation: scale-down pass after initial allocation.

## Migration Plan

1. Add `subpath-components` strategy to `svg-to-skeleton.ts` + unit tests
2. Update `03-vet-server.ts`: pre-compute 3 skeletons, update HTML/JS, handle `skeleton_strategy` in `/api/decide`
3. Update `csv.ts`: add `skeleton_strategy` field to `WordRow`
4. Run vet server locally; verify bicycle shows recognisable two-circle constellation under `subpath-components`
5. No deployment changes required (vet server is local-only)

## Open Questions

- Should the UI default-select `subpath-components` as the highlighted strategy (since it is the new hypothesis), requiring an explicit override to pick another? This would speed up vetting if `subpath-components` is usually correct. Decision deferred to vetting pilot results.

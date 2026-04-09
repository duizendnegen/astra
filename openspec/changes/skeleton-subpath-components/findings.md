# Vetting Findings: Strategy Comparison

Observations from the first visual vetting pass using the three-skeleton UI.
Screenshots taken 2026-04-09.

---

## Bicycle

**Concave hull**: Works. The outer ink contour of a bicycle is itself bicycle-shaped — the wheel circles bulge the outer boundary outward, the frame arch and handlebar curl are preserved. Tight enough at concavity=1.5 to follow the curves.

**Polygon union**: Best for bicycle. Two distinct circular regions, frame triangle and handlebars visible between them. Clean geometry, no excess edges. Reads as a textbook bicycle constellation.

**Subpath components**: Also a bicycle, but busier. Bridge edges between nearby subpaths (frame→wheel, frame→handlebar) add crossing lines that increase visual noise without adding information. Still recognizable but you have to work harder to see it.

**Winner: polygon-union**

---

## Tree

**Concave hull**: Best for tree. The outer blob is genuinely tree-shaped — canopy bumps, slight narrowing toward the base. For shapes where the outer silhouette *is* the recognizable form, concave hull wins.

**Polygon union**: Adds angular corners, makes the shape less natural-looking. Strictly worse than concave hull for tree — more geometric noise, same lack of trunk/branch information.

**Subpath components**: Noisy mess. The tree's curly canopy strokes create dozens of tiny, densely packed holes between leaf loops. The strategy treats every one as a structural element. With ~6 subpaths producing ~7 points each plus proximity bridges between all nearby neighbours, the result is a dense hairball. No discernible trunk, no canopy blob, no branch structure.

**Winner: concave-hull**

---

## Emerging pattern

| Shape type | Characteristic | Best strategy |
|---|---|---|
| Sparse structural (bicycle, anchor, chair) | Outer contour is meaningless; internal holes are informative | `polygon-union` |
| Dense organic (tree, cloud, flower) | Outer silhouette is the recognizable form; holes are decorative noise | `concave-hull` |
| Shapes with well-separated large distinct holes | TBD — hypothesis only | `subpath-components` candidate |

`subpath-components` has not yet found its best use case. The bridge edges between adjacent subpaths create noise in both tested shapes. It may shine on shapes with large, spatially separated, well-defined holes — **anchor** (ring + two large flukes) or **padlock** (body + shackle) are the next candidates to test.

---

## Earlier prediction vs. actual result

We predicted that concave hull would fail for bicycle and subpath-components would win. The actual result:

- **Concave hull** works for bicycle because the outer ink contour of a connected line drawing naturally follows the structural silhouette when concavity is tight (1.5). The earlier "blob" failure was the old default concavity of 3.0 being too loose, not the strategy itself.
- **Subpath-components** adds complexity without adding clarity for bicycle — the bridge edges are the culprit. May work better for shapes with fewer, larger, more spatially separated subpaths.

---

## Open questions

- **Trunk problem**: None of the three strategies captures the tree trunk. It is a thin, elongated subpath with very few points — absorbed into the outer hull or allocated only ~3 points under subpath-components where it disappears into canopy noise. Hypothesis worth testing: weight small *elongated* subpaths more heavily (they often represent structural connectors like trunks, stems, spokes).
- **When does subpath-components win?** Test anchor, padlock, bicycle-wheel (isolated), or any shape where 2–3 large holes dominate and are spatially separated.
- **Concavity tuning per shape**: The `/api/word/:word?concavity=N` endpoint already supports this. For organic shapes, higher concavity (looser hull) may be worth experimenting with via the UI.

## 1. svg-to-skeleton: subpath-components strategy

- [x] 1.1 Add `'subpath-components'` to the `strategy` union type in `SvgToSkeletonOptions` in `lambda/src/svg-to-skeleton.ts`
- [x] 1.2 Implement `buildSubpathComponentsSkeleton(normSubpaths, targetMin, targetMax)` helper: allocate point budget per subpath proportional to raw point count (min 3 per subpath), scale down if total exceeds targetMax, RDP-simplify each subpath to its budget
- [x] 1.3 Implement intra-subpath closed loop edge builder: sequential edges within each subpath with globally offset indices
- [x] 1.4 Implement inter-subpath proximity bridge: for each subpath find nearest point in any other subpath, add one bridge edge (deduplicated)
- [x] 1.5 Wire `subpath-components` into the `svgToSkeleton` strategy dispatch (Step 3 in the main function); single-subpath input falls back to `concave-hull`
- [x] 1.6 Update skeleton cache key comment to document the three valid strategy values

## 2. svg-to-skeleton: tests

- [x] 2.1 Add unit test: bicycle SVG with `strategy: 'subpath-components'` produces a skeleton with multiple edge components (not a single closed loop)
- [x] 2.2 Add unit test: single-subpath SVG with `strategy: 'subpath-components'` falls back to `concave-hull` output
- [x] 2.3 Add unit test: point budget allocation — verify proportional allocation and minimum-3 enforcement
- [x] 2.4 Add unit test: bridge edges are deduplicated (no pair appears twice)
- [x] 2.5 Run existing test suite to confirm no regressions in `concave-hull` and `polygon-union` strategies

## 3. CSV schema: skeleton_strategy column

- [x] 3.1 Add `skeleton_strategy` field to the `WordRow` interface in `scripts/custom-pipeline/csv.ts`
- [x] 3.2 Ensure `readCsv` treats missing `skeleton_strategy` column as empty string (backward-compatible)
- [x] 3.3 Ensure `writeCsv` includes `skeleton_strategy` in the header and all rows

## 4. Vetting server: three-skeleton layout

- [x] 4.1 Update `buildWordCache` in `03-vet-server.ts` to pre-compute and cache all three skeletons per word (`concave-hull`, `polygon-union`, `subpath-components`)
- [x] 4.2 Update `/api/words` response shape to include `skeletons: { concaveHull, polygonUnion, subpathComponents }` instead of a single `skeleton` field
- [x] 4.3 Replace the single skeleton canvas in `HTML_PAGE` with three labelled canvases side-by-side; update canvas rendering JS to draw all three
- [x] 4.4 Add strategy selection state to the frontend JS: `selectedStrategy` variable, updated by keys `1`/`2`/`3`; pressing same key twice clears selection
- [x] 4.5 Highlight the selected canvas with a coloured border; de-emphasise unselected canvases
- [x] 4.6 Block the `A` (accept) shortcut when no strategy is selected; show a brief visual hint (e.g. flash the strategy canvases)
- [x] 4.7 Update `/api/decide` POST handler to accept and write `skeleton_strategy` to the CSV row on accept; clear it on retry
  - ⚠️ **Known issue**: `skeleton_strategy` is not persisting to CSV on accept. A bug was found and fixed (strategy was cleared before being captured in the fetch body), but persistence is still not working as of 2026-04-09. Needs investigation.

## 5. Visual verification with Playwright

- [ ] 5.0 Debug and fix `skeleton_strategy` persistence: accepted words are not writing the chosen strategy to CSV. Verify the fix from 2026-04-09 (capture strategy before clearing) is applied, then trace through readCsv/writeCsv to confirm the new column is being written correctly.

## 6. Follow-up: Improve subpath-components strategy

- [ ] 6.1 Investigate bridge edge noise: bridge edges between adjacent subpaths create visual clutter (seen in bicycle and tree). Consider limiting bridges to subpaths above a minimum spatial distance threshold, or only bridging the N most spatially distant subpaths.
- [ ] 6.2 Test on anchor and padlock — shapes with large, well-separated holes — to find the shape class where subpath-components outperforms the hull strategies.
- [ ] 6.3 Explore weighting elongated subpaths more heavily in the budget allocation: thin, elongated subpaths (high aspect ratio, small area) often represent structural connectors (trunks, stems, spokes) and currently get the minimum point budget, causing them to disappear. Increasing their weight may recover these structural elements.
- [ ] 6.4 Re-run vetting after improvements and update findings.md with results.

## 5. Visual verification with Playwright
- [ ] 5.2 Use Playwright to navigate to `http://localhost:4242` and take a screenshot of the bicycle card showing all three skeleton canvases
- [ ] 5.3 Verify the `subpath-components` skeleton visually shows two distinct circular clusters (wheel shapes) rather than a single outer blob
- [ ] 5.4 Use Playwright to press key `3` and then `A`; verify the API call includes `skeleton_strategy: 'subpath-components'` and the CSV is updated correctly

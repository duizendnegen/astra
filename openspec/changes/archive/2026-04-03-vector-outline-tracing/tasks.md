## 1. Dependency

- [x] 1.1 Add `polygon-clipping` to `lambda/package.json` and install

## 2. Outline Extraction

- [x] 2.1 In `svg-to-skeleton.ts`, modify `samplePath` (or add a wrapper) to return each subpath's dense points separately rather than as a single concatenated array
- [x] 2.2 Implement `extractOutlineContour(subpathPolygons: Point[][]): Point[]` using `polygon-clipping` union — returns outer ring of largest resulting polygon, falls back to concatenated points on error

## 3. Pipeline Integration

- [x] 3.1 Update `svgToSkeleton` to call `extractOutlineContour` after sampling, replacing the step that feeds all points into simplification
- [x] 3.2 Update skeleton cache key to append `__outline-v1` suffix

## 4. Edge Derivation

- [x] 4.1 Replace the `deriveEdges` call with a simple closed-loop edge builder: `[i, i+1]` for all points plus `[last, 0]`

## 5. Verification

- [x] 5.1 Run the test harness against the existing retrieval fixture set and visually confirm double-lines are gone on icons like arrow, guitar, crown
- [x] 5.2 Confirm skeleton point counts remain in the 15–40 range for a sample of icons

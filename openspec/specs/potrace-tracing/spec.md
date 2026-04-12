### Requirement: Potrace traces PNG alongside vtracer
The trace step SHALL run Potrace on each PNG that has been successfully traced by vtracer, producing a second SVG file for comparison purposes.

#### Scenario: Potrace SVG produced
- **WHEN** a word has a `png_path` and a vtracer `svg_path` in `words.csv`
- **THEN** the trace step produces a `{word}-linedrawing-potrace.svg` file and records its path in `potrace_svg_path`

#### Scenario: Potrace failure does not affect vtracer result
- **WHEN** Potrace tracing fails for a word
- **THEN** the word's vtracer `svg_path` and `status` are unchanged, a warning is logged, and `potrace_svg_path` remains empty

### Requirement: Potrace SVG path recorded in CSV
The `words.csv` schema SHALL include a `potrace_svg_path` column storing the absolute path to the Potrace-traced SVG, or empty if tracing failed or has not run.

#### Scenario: Path stored after successful trace
- **WHEN** Potrace produces a valid SVG for a word
- **THEN** `potrace_svg_path` in `words.csv` is set to the absolute path of the output file

### Requirement: Vet UI displays both SVGs for comparison
The vetting UI SHALL display the vtracer SVG and the Potrace SVG side-by-side, in that order, so the operator can visually compare tracing quality.

#### Scenario: Both SVGs present
- **WHEN** a word has both `svg_path` and `potrace_svg_path`
- **THEN** the vet UI renders both as images with labels "vtracer" and "potrace"

#### Scenario: Potrace SVG absent
- **WHEN** a word has `svg_path` but no `potrace_svg_path`
- **THEN** the vet UI renders the vtracer SVG and shows a placeholder for the Potrace column

## MODIFIED Requirements

### Requirement: Word list
The harness SHALL maintain a word list in `test-harness/words.ts` organised into five categories that exercise distinct pipeline layers. The list SHALL always be run in full; subsetting is not supported.

Categories:
- **A — direct index match** (should hit L1): wolf, eagle, mushroom, guitar, crown, anchor, bicycle, butterfly, shark, telescope, sloth, oak
- **B — near-match** (should hit L1 via embedding proximity): hound, automobile, spectacles
- **C — concept mapping + translation** (should hit L3): justice, Beethoven, capitalism, melancholy, pirate, Faultier, Löwe, Fernsehturm
- **D — no index match** (should fall through to L4): eternity, quantum, bureaucracy, serendipity
- **E — edge cases** (multiple valid shapes or cross-source candidates): mercury, star

#### Scenario: Word list is imported by the runner
- **WHEN** `run.ts` starts
- **THEN** it imports the word list from `words.ts` and processes every word across all categories

#### Scenario: Category metadata available in results
- **WHEN** the runner completes
- **THEN** each entry in `results.json` includes the word's category (A–E) and the pipeline layer that fired (1, 3, 4, or "fallback")

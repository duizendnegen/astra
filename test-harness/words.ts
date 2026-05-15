/**
 * Word list for constellation matching evaluation.
 *
 * Organised into five categories that exercise distinct pipeline layers:
 *
 *   A  Direct index match  — should hit L1 embedding search
 *   B  Near-match          — should hit L1 via embedding proximity of close synonyms
 *   C  Concept mapping     — should reach L3 (LLM candidates + translate)
 *   D  No index match      — should fall through to L4 (LLM SVG generation)
 *   E  Edge cases          — multiple valid shapes or cross-source candidates
 */

export interface WordEntry {
  word: string;
  category: 'A' | 'B' | 'C' | 'D' | 'E';
}

// A — should hit L1 directly (present in Phosphor or Phylopic index)
const categoryA: WordEntry[] = [
  { word: 'wolf', category: 'A' },
  { word: 'eagle', category: 'A' },
  { word: 'mushroom', category: 'A' },
  { word: 'guitar', category: 'A' },
  { word: 'crown', category: 'A' },
  { word: 'anchor', category: 'A' },
  { word: 'bicycle', category: 'A' },
  { word: 'butterfly', category: 'A' },
  { word: 'shark', category: 'A' },
  { word: 'telescope', category: 'A' },
  { word: 'sloth', category: 'A' },
  { word: 'oak', category: 'A' },
  { word: 'banana', category: 'A' },
  { word: 'bunny', category: 'A' },
  { word: 'tree', category: 'A' },
];

// B — should hit L1 via embedding proximity (close synonyms, near-matches)
const categoryB: WordEntry[] = [
  { word: 'hound', category: 'B' },       // → dog
  { word: 'automobile', category: 'B' },  // → car
  { word: 'spectacles', category: 'B' },  // → eyeglasses
];

// C — should reach L3: LLM concept mapping + translation
const categoryC: WordEntry[] = [
  { word: 'justice', category: 'C' },       // → scales
  { word: 'Beethoven', category: 'C' },     // → piano or musical note
  { word: 'capitalism', category: 'C' },    // → factory or coin
  { word: 'melancholy', category: 'C' },    // → broken heart
  { word: 'pirate', category: 'C' },        // → skull or ship
  { word: 'Faultier', category: 'C' },      // German: sloth
  { word: 'Löwe', category: 'C' },          // German: lion
  { word: 'Fernsehturm', category: 'C' },   // German: TV tower
];

// D — should fall through to L4: no plausible index match
const categoryD: WordEntry[] = [
  { word: 'eternity', category: 'D' },
  { word: 'quantum', category: 'D' },
  { word: 'bureaucracy', category: 'D' },
  { word: 'serendipity', category: 'D' },
];

// E — edge cases: multiple valid shapes or both Phosphor and Phylopic candidates
const categoryE: WordEntry[] = [
  { word: 'mercury', category: 'E' },  // planet, liquid metal, or Roman god symbol
  { word: 'star', category: 'E' },     // geometric star (Phosphor) vs astronomical (Phylopic)
  { word: 'love', category: 'E' },
];

export const wordEntries: WordEntry[] = [
  ...categoryA,
  ...categoryB,
  ...categoryC,
  ...categoryD,
  ...categoryE,
];

// Flat list for harness code that uses words: string[]
export const words: string[] = wordEntries.map((e) => e.word);

export const wordCategoryMap: Record<string, WordEntry['category']> = Object.fromEntries(
  wordEntries.map((e) => [e.word, e.category]),
);

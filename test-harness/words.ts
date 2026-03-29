// ~40 words across three categories for constellation matching evaluation

// Concrete — clear physical shape, strong visual association
const concrete = [
  'potato', 'dog', 'cat', 'bird', 'fish',
  'tree', 'house', 'car', 'rocket', 'moon',
  'sun', 'key', 'sword', 'hammer', 'crown',
];

// Moderate — recognisable form but more variable or stylised
const moderate = [
  'boat', 'mountain', 'island', 'wave', 'skull',
  'butterfly', 'cloud', 'fire', 'eye', 'hand',
  'leaf', 'spider', 'heart', 'bone', 'arrow',
];

// Abstract — difficult to represent geometrically; tests matcher robustness
const abstract = [
  'love', 'desire', 'hope', 'fear', 'chaos',
  'freedom', 'death', 'music', 'time', 'joy',
  'anger', 'peace',
];

export const words: string[] = [...concrete, ...moderate, ...abstract];

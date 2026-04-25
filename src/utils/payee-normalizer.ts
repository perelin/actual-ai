const SUFFIX_PATTERNS = [
  /\s*\(de\d{2}\s+xxx\s+\S+\)\s*$/,
  /\s*\/\/[^/]+\/de\s*$/,
  /\s+\d{4,}\s*$/,
  /[\s.,;:\-—|]+$/,
];

const MAX_ITERATIONS = 5;

function normalizePayee(s: string): string {
  let result = s.trim().toLowerCase().replace(/\s+/g, ' ');

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    let changed = false;
    // eslint-disable-next-line no-restricted-syntax
    for (const pattern of SUFFIX_PATTERNS) {
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return result.replace(/\s+/g, ' ').trim();
}

export default normalizePayee;

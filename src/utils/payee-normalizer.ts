// Strips a trailing IBAN-style legal suffix in any country (e.g. "(DE88 XXX 6303)",
// "(LU89 XXX 200E)") so that PayPal Europe and other multi-country aggregators
// don't fragment by IBAN country prefix.
const SUFFIX_PATTERNS = [
  /\s*\([a-z]{2}\d{2}\s+xxx\s+\S+\)\s*$/,
  /\s*\/\/[^/]+\/de\s*$/,
  // Anchored on a leading street-number (e.g. "22-24 boulevard royal, 2449 luxembourg"):
  // requires <num>(-<num>)? <word>+, <plz> <word> at end. Keeps "Müller GmbH, 69115
  // Heidelberg" intact (no street number → no match) so distinct local merchants
  // don't collapse onto each other.
  /\s+\d+(?:-\d+)?\s+[a-zäöüß]+(?:\s+[a-zäöüß]+){0,3},\s*\d{4,5}\s+[a-zäöüß]+\s*$/,
  /\s+\d{4,}\s*$/,
  /[\s.,;:\-—|]+$/,
];

const MAX_ITERATIONS = 5;

// Flatten parens around a single bare-region word ("(europe)", "(europa)") so
// "Paypal (Europe) …" matches "Paypal Europe …". Restricted to alphabetic
// content so IBAN-bracket suffixes like "(de88 xxx 6303)" are preserved for the
// SUFFIX_PATTERNS pass.
function flattenRegionParens(s: string): string {
  return s.replace(/\(\s*(europe|europa)\s*\)/g, '$1');
}

// PayPal Europe's imported_payee strings vary in legal-form punctuation
// ("S.A.R.L." vs "S.A R.L."), comma placement, address block, and IBAN
// country prefix. Generic regex can't reliably collapse all variations
// without false-positives on non-PayPal payees, so we hardcode the canonical
// key — same approach as SumUp's startsWith match in config.ts.
function canonicalizeAggregator(s: string): string {
  if (s.startsWith('paypal')) return 'paypal europe';
  return s;
}

function normalizePayee(s: string): string {
  let result = flattenRegionParens(s.trim().toLowerCase().replace(/\s+/g, ' '));

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

  result = result.replace(/\s+/g, ' ').trim();
  return canonicalizeAggregator(result);
}

export default normalizePayee;

import PayeeHistoryService from '../src/transaction/payee-history-service';
import SimilarityCalculator from '../src/similarity-calculator';

const sim = new SimilarityCalculator();

function tx(
  id: string,
  importedPayee: string,
  categoryId: string | undefined,
  notes = '',
  date = '2024-01-01',
  amount = -1000,
) {
  return {
    id,
    amount,
    starting_balance_flag: false,
    imported_payee: importedPayee,
    account: 'acc1',
    date,
    notes,
    payee: undefined as string | undefined,
    is_parent: false as const,
    category: categoryId,
  };
}

const categories = [
  { id: 'cat-groceries', name: 'Groceries' },
  { id: 'cat-travel', name: 'Travel' },
  { id: 'cat-hobby', name: 'Hobby' },
  { id: 'cat-unknown', name: 'UNBEKANNT' },
];

const emptyBlocklist = new Set<string>();

describe('PayeeHistoryService', () => {
  it('skips aggregator payees by blocklist', () => {
    const blocklist = new Set(['paypal europe s.a.r.l. et cie s.c.a']);
    const service = new PayeeHistoryService(
      [tx('1', 'Paypal Europe S.A.R.L. Et Cie S.C.A', 'cat-groceries')],
      categories,
      blocklist,
      sim,
    );
    const match = service.getMatch(tx('new', 'Paypal Europe S.A.R.L. Et Cie S.C.A', undefined));
    expect(match.matchType).toBe('aggregator-skip');
    expect(match.entries).toHaveLength(0);
  });

  it('skips aggregator payees by prefix (sumup)', () => {
    const service = new PayeeHistoryService(
      [tx('1', 'Sumup *Neckar Wave Fo', 'cat-groceries')],
      categories,
      emptyBlocklist,
      sim,
    );
    const match = service.getMatch(tx('new', 'Sumup *Some Other Merchant', undefined));
    expect(match.matchType).toBe('aggregator-skip');
  });

  it('returns exact match when bucket size >= exactMatchTarget', () => {
    const transactions = [
      tx('1', 'Rewe Markt Gmbh (DE80 XXX 0759)', 'cat-groceries', '', '2024-01-01'),
      tx('2', 'Rewe Markt Gmbh (DE80 XXX 0759)', 'cat-groceries', '', '2024-01-02'),
      tx('3', 'Rewe Markt Gmbh (DE80 XXX 0759)', 'cat-travel', '', '2024-01-03'),
    ];
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim, {
      exactMatchTarget: 3,
    });
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh (DE80 XXX 0759)', undefined));
    expect(match.matchType).toBe('exact');
    expect(match.entries.length).toBeLessThanOrEqual(5);
    expect(match.histogram.get('Groceries')).toBe(2);
    expect(match.histogram.get('Travel')).toBe(1);
  });

  it('falls back to fuzzy when exact bucket < exactMatchTarget', () => {
    const transactions = [
      tx('1', 'Rewe Markt Gmbh', 'cat-groceries', '', '2024-01-01'),
      tx('2', 'Rewe Markt GmbH Berlin', 'cat-groceries', '', '2024-01-02'),
    ];
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim, {
      exactMatchTarget: 3,
      fuzzyThreshold: 0.5,
    });
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh', undefined));
    expect(match.matchType).toBe('fuzzy');
    expect(match.entries.length).toBeGreaterThan(0);
  });

  it('caps entries at maxExamples', () => {
    const transactions = Array.from({ length: 10 }, (_, i) => tx(
      `${i}`,
      'Rewe Markt Gmbh',
      'cat-groceries',
      '',
      `2024-01-${String(i + 1).padStart(2, '0')}`,
    ));
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim, {
      exactMatchTarget: 1,
      maxExamples: 3,
    });
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh', undefined));
    expect(match.matchType).toBe('exact');
    expect(match.entries).toHaveLength(3);
  });

  it('returns none for unknown payees', () => {
    const service = new PayeeHistoryService([], categories, emptyBlocklist, sim);
    const match = service.getMatch(tx('new', 'Unknown Merchant', undefined));
    expect(match.matchType).toBe('none');
  });

  it('ignores transactions with #actual-ai tag in notes', () => {
    const transactions = [
      tx('1', 'Rewe Markt Gmbh', 'cat-groceries', '#actual-ai guessed', '2024-01-01'),
      tx('2', 'Rewe Markt Gmbh', 'cat-groceries', '', '2024-01-02'),
    ];
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim, {
      exactMatchTarget: 1,
    });
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh', undefined));
    expect(match.entries).toHaveLength(1);
  });

  it('ignores transactions without imported_payee', () => {
    const base = tx('1', 'Rewe', 'cat-groceries');
    const transactions = [{ ...base, imported_payee: undefined as string | undefined }];
    const service = new PayeeHistoryService(
      transactions,
      categories,
      emptyBlocklist,
      sim,
      { exactMatchTarget: 1 },
    );
    const match = service.getMatch(tx('new', 'Rewe', undefined));
    expect(match.matchType).toBe('none');
  });

  it('ignores transactions without category', () => {
    const transactions = [tx('1', 'Rewe Markt Gmbh', undefined)];
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim);
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh', undefined));
    expect(match.matchType).toBe('none');
  });

  it('returns sorted entries (most recent first)', () => {
    const transactions = [
      tx('1', 'Rewe Markt Gmbh', 'cat-groceries', '', '2024-01-01'),
      tx('2', 'Rewe Markt Gmbh', 'cat-travel', '', '2024-03-01'),
      tx('3', 'Rewe Markt Gmbh', 'cat-groceries', '', '2024-02-01'),
    ];
    const service = new PayeeHistoryService(transactions, categories, emptyBlocklist, sim, {
      exactMatchTarget: 1,
    });
    const match = service.getMatch(tx('new', 'Rewe Markt Gmbh', undefined));
    expect(match.matchType).toBe('exact');
    expect(match.entries[0].date).toBe('2024-03-01');
    expect(match.entries[1].date).toBe('2024-02-01');
    expect(match.entries[2].date).toBe('2024-01-01');
  });
});

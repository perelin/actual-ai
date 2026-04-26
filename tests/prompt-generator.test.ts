import { TransactionEntity, RuleEntity } from '@actual-app/core/src/types/models';
import fs from 'fs';
import PromptGenerator from '../src/prompt-generator';
import GivenActualData from './test-doubles/given/given-actual-data';
import PromptTemplateException from '../src/exceptions/prompt-template-exception';
import * as config from '../src/config';

jest.spyOn(config, 'isToolEnabled').mockReturnValue(false);

const STATIC_TEMPLATE = fs.readFileSync('./src/templates/prompt-static.hbs', 'utf8').trim();
const VARIABLE_TEMPLATE = fs.readFileSync('./src/templates/prompt-variable.hbs', 'utf8').trim();

const newGenerator = (): PromptGenerator => new PromptGenerator(STATIC_TEMPLATE, VARIABLE_TEMPLATE);

const combined = (p: { staticPart: string; variablePart: string }): string => `${p.staticPart}\n${p.variablePart}`;

describe('PromptGenerator', () => {
  const promptSet: [TransactionEntity][] = [
    [
      GivenActualData.createTransaction(
        '1',
        -34169,
        'Airbnb * XXXX1234567',
        'AIRBNB * XXXX1234567 822-307-2000',
        undefined,
        undefined,
        '2021-01-01',
      ),
    ],
    [
      GivenActualData.createTransaction(
        '2',
        -1626,
        'Steam Purc',
        'Steam Purc   16.26_V #actual-ai-miss',
        undefined,
        undefined,
        '2025-02-18',
      ),
    ],
  ];

  it.each(promptSet)('splits output: static contains catalog, variable contains transaction', (
    transaction: TransactionEntity,
  ) => {
    const categoryGroups = GivenActualData.createSampleCategoryGroups();
    const payees = GivenActualData.createSamplePayees();

    const split = newGenerator().generate(categoryGroups, transaction, payees, []);

    // Static block: catalog + format. Must NOT contain per-transaction details.
    expect(split.staticPart).toContain('Existing categories by group:');
    expect(split.staticPart).toContain('RESPONSE FORMAT:');
    expect(split.staticPart).not.toContain('Transaction details:');
    expect(split.staticPart).not.toContain(`* Amount: ${Math.abs(transaction.amount)}`);

    // Variable block: transaction-specific data.
    expect(split.variablePart).toContain('Transaction details:');
    expect(split.variablePart).toContain(`* Amount: ${Math.abs(transaction.amount)}`);
  });

  it('should throw exception on invalid prompt', () => {
    const categoryGroups = GivenActualData.createSampleCategoryGroups();
    const payees = GivenActualData.createSamplePayees();
    const transaction = GivenActualData.createTransaction('1', 1000, 'Carrefour 2137');
    const promptGenerator = new PromptGenerator('{{#each categories}}', VARIABLE_TEMPLATE);
    const t = () => {
      promptGenerator.generate(categoryGroups, transaction, payees, []);
    };

    expect(t).toThrow(PromptTemplateException);
  });

  it('should include rules in static and tx details in variable', () => {
    const transaction = GivenActualData.createTransaction(
      '1',
      -1000,
      'Carrefour 2137',
      '',
      GivenActualData.PAYEE_CARREFOUR,
      undefined,
      '2021-01-01',
    );

    const rules: RuleEntity[] = GivenActualData.createSampleRules();
    const categoryGroups = GivenActualData.createSampleCategoryGroups();
    const payees = GivenActualData.createSamplePayees();

    const split = newGenerator().generate(categoryGroups, transaction, payees, rules);

    expect(split.staticPart).toContain('Existing Rules:');
    expect(split.staticPart).toContain('1. Unnamed rule → unknown');
    expect(split.staticPart).toContain('2. Unnamed rule → unknown');
    expect(split.staticPart).toContain('Conditions:');

    expect(split.variablePart).toContain('Transaction details:');
    expect(split.variablePart).toContain('* Amount: 1000');
    expect(split.variablePart).toContain('* Type: Outcome');
    expect(split.variablePart).toContain('* Date: 2021-01-01');
  });

  describe('web search tool', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should include web search tool message when webSearch is enabled', () => {
      jest.spyOn(config, 'isToolEnabled').mockImplementation((tool) => tool === 'webSearch');

      const transaction = GivenActualData.createTransaction(
        '1',
        -1000,
        'Carrefour 2137',
        '',
        GivenActualData.PAYEE_CARREFOUR,
        undefined,
        '2021-01-01',
      );

      const split = newGenerator().generate(
        GivenActualData.createSampleCategoryGroups(),
        transaction,
        GivenActualData.createSamplePayees(),
        [],
      );

      expect(split.staticPart).toContain('You can use the web search tool to find more information about the transaction');
    });

    it('should include web search tool message when freeWebSearch is enabled', () => {
      jest.spyOn(config, 'isToolEnabled').mockImplementation((tool) => tool === 'freeWebSearch');

      const transaction = GivenActualData.createTransaction(
        '1',
        -1000,
        'Carrefour 2137',
        '',
        GivenActualData.PAYEE_CARREFOUR,
        undefined,
        '2021-01-01',
      );

      const split = newGenerator().generate(
        GivenActualData.createSampleCategoryGroups(),
        transaction,
        GivenActualData.createSamplePayees(),
        [],
      );

      expect(split.staticPart).toContain('You can use the web search tool to find more information about the transaction');
    });

    it('should not include web search tool message when both are disabled', () => {
      jest.spyOn(config, 'isToolEnabled').mockImplementation(() => false);

      const transaction = GivenActualData.createTransaction(
        '1',
        -1000,
        'Carrefour 2137',
        '',
        GivenActualData.PAYEE_CARREFOUR,
        undefined,
        '2021-01-01',
      );

      const split = newGenerator().generate(
        GivenActualData.createSampleCategoryGroups(),
        transaction,
        GivenActualData.createSamplePayees(),
        [],
      );

      expect(combined(split)).not.toContain('You can use the web search tool to find more information about the transaction');
    });
  });

  describe('payee history (few-shot)', () => {
    const baseTx = () => GivenActualData.createTransaction(
      '1',
      -1500,
      'Rewe Markt Gmbh (DE80 XXX 0759)',
      '',
      undefined,
      undefined,
      '2026-04-20',
    );
    const baseCategoryGroups = () => GivenActualData.createSampleCategoryGroups();
    const basePayees = () => GivenActualData.createSamplePayees();

    it('renders the few-shot block when payeeHistory has entries', () => {
      const split = newGenerator().generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        {
          normalizedKey: 'rewe markt gmbh',
          matchType: 'exact',
          histogramLine: '',
          entries: [
            {
              date: '2026-04-15', amount: 1234, importedPayee: 'Rewe Markt Gmbh (DE80 XXX 0759)', categoryName: 'Groceries',
            },
            {
              date: '2026-04-10', amount: 999, importedPayee: 'Rewe Markt Gmbh (DE80 XXX 0759)', categoryName: 'Groceries',
            },
          ],
          histogram: new Map([['Groceries', 12]]),
        },
      );

      expect(split.variablePart).toContain('Past classifications for this payee');
      expect(split.variablePart).toContain('match: exact');
      expect(split.variablePart).toContain('rewe markt gmbh');
      expect(split.variablePart).toContain('Most recent examples:');
      expect(split.variablePart).toContain('"Rewe Markt Gmbh (DE80 XXX 0759)" → Groceries');
      expect(split.variablePart).toContain('12 prior: 12× Groceries');
    });

    it('is silent when payeeHistory is null', () => {
      const split = newGenerator().generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        null,
      );
      expect(combined(split)).not.toContain('Past classifications for this payee');
      expect(combined(split)).not.toContain('Most recent examples');
    });

    it('is silent when payeeHistory.entries is empty', () => {
      const split = newGenerator().generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        {
          normalizedKey: 'rewe markt gmbh',
          matchType: 'exact',
          histogramLine: '',
          entries: [],
          histogram: new Map(),
        },
      );
      expect(combined(split)).not.toContain('Past classifications for this payee');
    });

    it('histogram line tails count transactions, not categories', () => {
      const histogram = new Map<string, number>([
        ['A', 50], ['B', 30], ['C', 10], ['D', 5], ['E', 3], ['F', 1], ['G', 1],
      ]);

      const split = newGenerator().generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        {
          normalizedKey: 'merchant x',
          matchType: 'exact',
          histogramLine: '',
          entries: [
            {
              date: '2026-04-20', amount: 1, importedPayee: 'Merchant X', categoryName: 'A',
            },
          ],
          histogram,
        },
      );

      expect(split.variablePart).toContain('100 prior:');
      expect(split.variablePart).toContain('50× A');
      expect(split.variablePart).toContain('30× B');
      expect(split.variablePart).toContain('10× C');
      expect(split.variablePart).toContain('5× D');
      expect(split.variablePart).toContain('3× E');
      expect(split.variablePart).toContain('+2 in other categories');
      expect(split.variablePart).not.toContain('+2 others,');
    });

    it('omits the tail clause when histogram fits within topN', () => {
      const histogram = new Map<string, number>([['A', 5], ['B', 3]]);
      const split = newGenerator().generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        {
          normalizedKey: 'merchant y',
          matchType: 'fuzzy',
          histogramLine: '',
          entries: [
            {
              date: '2026-04-20', amount: 1, importedPayee: 'Merchant Y', categoryName: 'A',
            },
          ],
          histogram,
        },
      );
      expect(split.variablePart).toContain('8 prior: 5× A, 3× B');
      expect(split.variablePart).not.toContain('in other categories');
    });
  });
});

import { TransactionEntity, RuleEntity } from '@actual-app/core/src/types/models';
import type { APICategoryGroupEntity } from '@actual-app/core/src/server/api-models';
import fs from 'fs';
import PromptGenerator from '../src/prompt-generator';
import GivenActualData from './test-doubles/given/given-actual-data';
import PromptTemplateException from '../src/exceptions/prompt-template-exception';
import handlebars from '../src/handlebars-helpers';
import * as config from '../src/config';

// Mock the isToolEnabled function
jest.spyOn(config, 'isToolEnabled').mockReturnValue(false);

describe('PromptGenerator', () => {
  const promptTemplate = fs.readFileSync('./src/templates/prompt.hbs', 'utf8').trim();

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

  // Helper function to safely create template data
  const loadAndRenderTemplate = (
    templateContent: string,
    transaction: TransactionEntity,
    categoryGroups: APICategoryGroupEntity[],
  ): string => {
    const template = handlebars.compile(templateContent);
    const payees = GivenActualData.createSamplePayees();

    // Create a type-safe copy of category groups with only required properties
    const safeCategoryGroups = categoryGroups.map((group) => {
      // Extract only properties we know exist in APICategoryGroupEntity
      const safeGroup: APICategoryGroupEntity = {
        id: group.id,
        name: group.name,
        is_income: group.is_income,
        categories: [],
      };

      // Type-safe mapping of categories
      const categories = (group.categories ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        group_id: category.group_id,
        is_income: category.is_income,
      }));

      safeGroup.categories = categories;
      return safeGroup;
    });

    return template({
      categoryGroups: safeCategoryGroups,
      amount: Math.abs(transaction.amount),
      type: transaction.amount > 0 ? 'Income' : 'Outcome',
      description: transaction.notes ?? '',
      payee: payees.find((p) => p.id === transaction.payee)?.name ?? '',
      importedPayee: transaction.imported_payee ?? '',
      date: transaction.date ?? '',
      cleared: transaction.cleared ?? false,
      reconciled: transaction.reconciled ?? false,
      hasWebSearchTool: false,
      rules: [],
    });
  };

  it.each(promptSet)('should generate prompts in both modern and legacy formats', (
    transaction: TransactionEntity,
  ) => {
    const categoryGroups = GivenActualData.createSampleCategoryGroups();
    const payees = GivenActualData.createSamplePayees();

    // Modern format test
    const modernTemplate = fs.readFileSync('./src/templates/prompt.hbs', 'utf8').trim();
    const modernPromptGenerator = new PromptGenerator(modernTemplate);
    const generatedModern = modernPromptGenerator.generate(categoryGroups, transaction, payees, []);
    const expectedModern = loadAndRenderTemplate(modernTemplate, transaction, categoryGroups);
    expect(generatedModern.trim()).toEqual(expectedModern.trim());

    // Legacy format test
    const legacyTemplate = `
I want to categorize the given bank transactions into the following categories:
{{#each categoryGroups}}
{{#each categories}}
* {{name}} ({{../name}}) (ID: "{{id}}")
{{/each}}
{{/each}}
Please categorize the following transaction:
* Amount: {{amount}}
* Type: {{type}}
{{#if description}}
* Description: {{description}}
{{/if}}
{{#if payee}}
* Payee: {{payee}}
{{^}}
* Payee: {{importedPayee}}
{{/if}}
ANSWER BY A CATEGORY ID - DO NOT CREATE ENTIRE SENTENCE - DO NOT WRITE CATEGORY NAME, JUST AN ID. Do not guess, if you don't know the answer, return "uncategorized".`.trim();

    const legacyPromptGenerator = new PromptGenerator(legacyTemplate);
    const generatedLegacy = legacyPromptGenerator.generate(categoryGroups, transaction, payees, []);
    const expectedLegacy = loadAndRenderTemplate(legacyTemplate, transaction, categoryGroups);
    expect(generatedLegacy.trim()).toEqual(expectedLegacy.trim());
  });

  it('should throw exception on invalid prompt', () => {
    const categoryGroups = GivenActualData.createSampleCategoryGroups();
    const payees = GivenActualData.createSamplePayees();
    const transaction = GivenActualData.createTransaction('1', 1000, 'Carrefour 2137');
    const promptGenerator = new PromptGenerator('{{#each categories}}');
    const t = () => {
      promptGenerator.generate(categoryGroups, transaction, payees, []);
    };

    expect(t).toThrow(PromptTemplateException);
  });

  it('should include rules in modern format when provided', () => {
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

    const promptGenerator = new PromptGenerator(promptTemplate);
    const prompt = promptGenerator.generate(categoryGroups, transaction, payees, rules);

    // Check for rule-specific content
    expect(prompt).toContain('Existing Rules:');
    expect(prompt).toContain('1. Unnamed rule → unknown');
    expect(prompt).toContain('2. Unnamed rule → unknown');
    expect(prompt).toContain('Conditions:');

    // Check for transaction details
    expect(prompt).toContain('Transaction details:');
    expect(prompt).toContain('* Amount: 1000');
    expect(prompt).toContain('* Type: Outcome');
    expect(prompt).toContain('* Date: 2021-01-01');
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

      const categoryGroups = GivenActualData.createSampleCategoryGroups();
      const payees = GivenActualData.createSamplePayees();

      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(categoryGroups, transaction, payees, []);

      expect(prompt).toContain('You can use the web search tool to find more information about the transaction.');
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

      const categoryGroups = GivenActualData.createSampleCategoryGroups();
      const payees = GivenActualData.createSamplePayees();

      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(categoryGroups, transaction, payees, []);

      expect(prompt).toContain('You can use the web search tool to find more information about the transaction.');
    });

    it('should not include web search tool message when both are disabled', () => {
      jest.spyOn(config, 'isToolEnabled').mockImplementation((_tool) => false);

      const transaction = GivenActualData.createTransaction(
        '1',
        -1000,
        'Carrefour 2137',
        '',
        GivenActualData.PAYEE_CARREFOUR,
        undefined,
        '2021-01-01',
      );

      const categoryGroups = GivenActualData.createSampleCategoryGroups();
      const payees = GivenActualData.createSamplePayees();

      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(categoryGroups, transaction, payees, []);

      expect(prompt).not.toContain('You can use the web search tool to find more information about the transaction.');
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
      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(
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

      expect(prompt).toContain('Past classifications for this payee');
      expect(prompt).toContain('match: exact');
      expect(prompt).toContain('rewe markt gmbh');
      expect(prompt).toContain('Most recent examples:');
      expect(prompt).toContain('"Rewe Markt Gmbh (DE80 XXX 0759)" → Groceries');
      expect(prompt).toContain('12 prior: 12× Groceries');
    });

    it('is silent when payeeHistory is null', () => {
      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(
        baseCategoryGroups(),
        baseTx(),
        basePayees(),
        [],
        null,
      );
      expect(prompt).not.toContain('Past classifications for this payee');
      expect(prompt).not.toContain('Most recent examples');
    });

    it('is silent when payeeHistory.entries is empty', () => {
      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(
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
      expect(prompt).not.toContain('Past classifications for this payee');
    });

    it('histogram line tails count transactions, not categories', () => {
      // 7 distinct categories, total 100 transactions.
      // With fewShotHistogramTopN=5: top 5 sum=98, tail 2 sum=2.
      // Bug variant would print "+2 others" (number of categories);
      // correct variant prints "+2 in other categories" (sum of tail counts).
      const histogram = new Map<string, number>([
        ['A', 50], ['B', 30], ['C', 10], ['D', 5], ['E', 3], ['F', 1], ['G', 1],
      ]);

      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(
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

      expect(prompt).toContain('100 prior:');
      expect(prompt).toContain('50× A');
      expect(prompt).toContain('30× B');
      expect(prompt).toContain('10× C');
      expect(prompt).toContain('5× D');
      expect(prompt).toContain('3× E');
      // tail must reflect the SUM of the trailing-bucket counts (1+1=2),
      // not the count of trailing categories.
      expect(prompt).toContain('+2 in other categories');
      expect(prompt).not.toContain('+2 others,');
    });

    it('omits the tail clause when histogram fits within topN', () => {
      const histogram = new Map<string, number>([['A', 5], ['B', 3]]);
      const promptGenerator = new PromptGenerator(promptTemplate);
      const prompt = promptGenerator.generate(
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
      expect(prompt).toContain('8 prior: 5× A, 3× B');
      expect(prompt).not.toContain('in other categories');
    });
  });
});

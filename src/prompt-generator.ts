import { APIPayeeEntity, APICategoryGroupEntity } from '@actual-app/core/src/server/api-models';
import { RuleEntity, TransactionEntity } from '@actual-app/core/src/types/models';
import handlebars from './handlebars-helpers';
import {
  PromptGeneratorI,
  PayeeHistoryView,
} from './types';
import PromptTemplateException from './exceptions/prompt-template-exception';
import { isToolEnabled, fewShotHistogramTopN } from './config';
import { transformRulesToDescriptions } from './utils/rule-utils';

class PromptGenerator implements PromptGeneratorI {
  private readonly promptTemplate: string;

  constructor(
    promptTemplate: string,
  ) {
    this.promptTemplate = promptTemplate;
  }

  generate(
    categoryGroups: APICategoryGroupEntity[],
    transaction: TransactionEntity,
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    payeeHistory?: PayeeHistoryView | null,
  ): string {
    let template;
    try {
      template = handlebars.compile(this.promptTemplate);
    } catch {
      console.error('Error generating prompt. Check syntax of your template.');
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
    const payeeName = payees.find((payee) => payee.id === transaction.payee)?.name;

    // Ensure each category group has its categories property
    const groupsWithCategories = categoryGroups.map((group) => ({
      ...group,
      groupName: group.name,
      categories: group.categories ?? [],
    }));

    const rulesDescription = transformRulesToDescriptions(
      rules,
      groupsWithCategories,
      payees,
    );

    try {
      const webSearchEnabled = (typeof isToolEnabled('webSearch') === 'boolean' && isToolEnabled('webSearch'))
        || (typeof isToolEnabled('freeWebSearch') === 'boolean' && isToolEnabled('freeWebSearch'));

      let formattedHistory: PayeeHistoryView | undefined;
      if (payeeHistory && payeeHistory.entries.length > 0) {
        const sorted = [...payeeHistory.histogram.entries()]
          .sort((a, b) => b[1] - a[1]);
        const topN = sorted.slice(0, fewShotHistogramTopN);
        const tail = sorted.slice(fewShotHistogramTopN);
        const topLine = topN.map(([name, count]) => `${count}× ${name}`).join(', ');
        const total = sorted.reduce((sum, e) => sum + e[1], 0);
        const tailTotal = tail.reduce((sum, e) => sum + e[1], 0);
        const histogramLine = `${total} prior: ${topLine}${tailTotal > 0 ? `, +${tailTotal} in other categories` : ''}`;

        formattedHistory = {
          normalizedKey: payeeHistory.normalizedKey,
          matchType: payeeHistory.matchType,
          histogramLine,
          entries: payeeHistory.entries,
          histogram: payeeHistory.histogram,
        };
      }

      return template({
        categoryGroups: groupsWithCategories,
        rules: rulesDescription,
        amount: Math.abs(transaction.amount),
        type: transaction.amount > 0 ? 'Income' : 'Outcome',
        description: transaction.notes ?? '',
        payee: payeeName ?? '',
        importedPayee: transaction.imported_payee ?? '',
        date: transaction.date ?? '',
        cleared: transaction.cleared,
        reconciled: transaction.reconciled,
        hasWebSearchTool: webSearchEnabled,
        payeeHistory: formattedHistory,
      });
    } catch {
      console.error('Error generating prompt. Check syntax of your template.');
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
  }
}

export default PromptGenerator;

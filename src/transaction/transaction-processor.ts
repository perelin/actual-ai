import {
  RuleEntity,
  TransactionEntity,
} from '@actual-app/core/src/types/models';
import { APIPayeeEntity } from '@actual-app/core/src/server/api-models';
import {
  ActualApiServiceI, APICategoryEntity, APICategoryGroupEntity,
  LlmServiceI, ProcessingStrategyI,
  PromptGeneratorI,
} from '../types';
import TagService from './tag-service';
import PayeeHistoryService from './payee-history-service';

class TransactionProcessor {
  private readonly actualApiService: ActualApiServiceI;

  private readonly llmService: LlmServiceI;

  private readonly promptGenerator: PromptGeneratorI;

  private readonly tagService: TagService;

  private readonly processingStrategies: ProcessingStrategyI[];

  constructor(
    actualApiClient: ActualApiServiceI,
    llmService: LlmServiceI,
    promptGenerator: PromptGeneratorI,
    tagService: TagService,
    processingStrategies: ProcessingStrategyI[],
  ) {
    this.actualApiService = actualApiClient;
    this.llmService = llmService;
    this.promptGenerator = promptGenerator;
    this.tagService = tagService;
    this.processingStrategies = processingStrategies;
  }

  public async process(
    transaction: TransactionEntity,
    categoryGroups: APICategoryGroupEntity[],
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    categories: (APICategoryEntity | APICategoryGroupEntity)[],
    suggestedCategories: Map<string, {
        name: string;
        groupName: string;
        groupIsNew: boolean;
        groupId?: string;
        transactions: TransactionEntity[];
      }>,
    payeeHistoryService: PayeeHistoryService | null = null,
  ): Promise<void> {
    try {
      let payeeHistoryView = null;
      if (payeeHistoryService) {
        const match = payeeHistoryService.getMatch(transaction);
        const totalPrior = [...match.histogram.values()].reduce((a, b) => a + b, 0);
        console.log(
          `[few-shot] tx=${transaction.id} payee="${transaction.imported_payee ?? ''}" `
          + `key="${match.normalizedKey}" match=${match.matchType} prior=${totalPrior}`,
        );
        if (match.matchType === 'exact' || match.matchType === 'fuzzy') {
          payeeHistoryView = {
            normalizedKey: match.normalizedKey,
            matchType: match.matchType,
            histogramLine: '',
            entries: match.entries.map((e) => ({
              date: e.date ?? '',
              amount: Math.abs(e.amount),
              importedPayee: e.imported_payee ?? '',
              categoryName: payeeHistoryService.getCategoryName(e.category),
            })),
            histogram: match.histogram,
          };
        }
      }

      const prompt = this.promptGenerator.generate(
        categoryGroups,
        transaction,
        payees,
        rules,
        payeeHistoryView,
      );

      const response = await this.llmService.ask(prompt);

      const strategy = this.processingStrategies.find((s) => s.isSatisfiedBy(response));
      if (strategy) {
        await strategy.process(transaction, response, categories, suggestedCategories);
        return;
      }

      console.warn(`Unexpected response format: ${JSON.stringify(response)}`);
      await this.actualApiService.updateTransactionNotes(
        transaction.id,
        this.tagService.addNotGuessedTag(transaction.notes ?? ''),
      );
    } catch (error) {
      console.error(`Error processing transaction ${transaction.id}:`, error);
      await this.actualApiService.updateTransactionNotes(
        transaction.id,
        this.tagService.addNotGuessedTag(transaction.notes ?? ''),
      );
    }
  }
}

export default TransactionProcessor;

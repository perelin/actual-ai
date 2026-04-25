import type {
  TransactionEntity,
} from '@actual-app/core/src/types/models';
import type {
  ActualApiServiceI,
  TransactionServiceI,
} from './types';
import {
  isFeatureEnabled, fewShotAggregatorBlocklist, guessedTag, notGuessedTag,
} from './config';
import CategorySuggester from './transaction/category-suggester';
import BatchTransactionProcessor from './transaction/batch-transaction-processor';
import TransactionFilterer from './transaction/transaction-filterer';
import PayeeHistoryService from './transaction/payee-history-service';
import SimilarityCalculator from './similarity-calculator';

class TransactionService implements TransactionServiceI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly categorySuggester: CategorySuggester;

  private readonly transactionProcessor: BatchTransactionProcessor;

  private readonly transactionFilterer: TransactionFilterer;

  private readonly isDryRun: boolean;

  constructor(
    actualApiClient: ActualApiServiceI,
    categorySuggester: CategorySuggester,
    transactionProcessor: BatchTransactionProcessor,
    transactionFilterer: TransactionFilterer,
    isDryRun: boolean,
  ) {
    this.actualApiService = actualApiClient;
    this.categorySuggester = categorySuggester;
    this.transactionProcessor = transactionProcessor;
    this.transactionFilterer = transactionFilterer;
    this.isDryRun = isDryRun;
  }

  async processTransactions(): Promise<void> {
    if (this.isDryRun) {
      console.log('=== DRY RUN MODE ===');
      console.log('No changes will be made to transactions or categories');
      console.log('=====================');
    }

    const [categoryGroups, categories, payees, transactions, accounts, rules] = await Promise.all([
      this.actualApiService.getCategoryGroups(),
      this.actualApiService.getCategories(),
      this.actualApiService.getPayees(),
      this.actualApiService.getTransactions(),
      this.actualApiService.getAccounts(),
      this.actualApiService.getRules(),
    ]);
    console.log(`Found ${rules.length} transaction categorization rules`);
    console.log('rerunMissedTransactions', isFeatureEnabled('rerunMissedTransactions'));

    const usePayeeHistory = isFeatureEnabled('fewShotPayeeHistory');

    const uncategorizedTransactions = this.transactionFilterer.filterUncategorized(
      transactions,
      accounts,
    );

    if (uncategorizedTransactions.length === 0) {
      console.log('No uncategorized transactions to process');
      return;
    }

    let payeeHistoryService: PayeeHistoryService | null = null;
    if (usePayeeHistory) {
      const flatCategories = categories.map((c) => ({ id: c.id, name: c.name }));
      payeeHistoryService = new PayeeHistoryService(
        transactions,
        flatCategories,
        fewShotAggregatorBlocklist,
        new SimilarityCalculator(),
        { guessedTag, notGuessedTag },
      );
      console.log('Payee history index built');
    }

    // Track suggested new categories
    const suggestedCategories = new Map<string, {
      name: string;
      groupName: string;
      groupIsNew: boolean;
      groupId?: string;
      transactions: TransactionEntity[];
    }>();

    await this.transactionProcessor.process(
      uncategorizedTransactions,
      categoryGroups,
      payees,
      rules,
      categories,
      suggestedCategories,
      payeeHistoryService,
    );

    // Create new categories if not in dry run mode
    if (isFeatureEnabled('suggestNewCategories') && suggestedCategories.size > 0) {
      await this.categorySuggester.suggest(
        suggestedCategories,
        uncategorizedTransactions,
        categoryGroups,
      );
    }
  }
}

export default TransactionService;

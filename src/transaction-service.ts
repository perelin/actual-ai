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

  private readonly maxTransactions: number | undefined;

  constructor(
    actualApiClient: ActualApiServiceI,
    categorySuggester: CategorySuggester,
    transactionProcessor: BatchTransactionProcessor,
    transactionFilterer: TransactionFilterer,
    isDryRun: boolean,
    maxTransactions?: number,
  ) {
    this.actualApiService = actualApiClient;
    this.categorySuggester = categorySuggester;
    this.transactionProcessor = transactionProcessor;
    this.transactionFilterer = transactionFilterer;
    this.isDryRun = isDryRun;
    this.maxTransactions = maxTransactions;
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

    const transactionsToProcess = this.applyMaxTransactionsLimit(uncategorizedTransactions);

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
      transactionsToProcess,
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
        transactionsToProcess,
        categoryGroups,
      );
    }
  }

  private applyMaxTransactionsLimit(
    uncategorized: TransactionEntity[],
  ): TransactionEntity[] {
    const limit = this.maxTransactions;
    if (limit === undefined || uncategorized.length <= limit) {
      return uncategorized;
    }

    // Sort newest-first by date so the limited sample is "the N most recent
    // uncategorized transactions across all accounts" — reproducible and the
    // most representative slice for dry-run validation.
    const sorted = [...uncategorized].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const limited = sorted.slice(0, limit);
    console.log(
      `MAX_TRANSACTIONS=${limit}: limiting to ${limited.length} of ${uncategorized.length} uncategorized transactions (newest-first by date)`,
    );
    return limited;
  }
}

export default TransactionService;

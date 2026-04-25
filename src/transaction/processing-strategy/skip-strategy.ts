import type { TransactionEntity } from '@actual-app/core/src/types/models';
import type {
  ActualApiServiceI, ProcessingStrategyI, UnifiedResponse,
} from '../../types';
import TagService from '../tag-service';

class SkipStrategy implements ProcessingStrategyI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly tagService: TagService;

  constructor(
    actualApiService: ActualApiServiceI,
    tagService: TagService,
  ) {
    this.actualApiService = actualApiService;
    this.tagService = tagService;
  }

  public isSatisfiedBy(response: UnifiedResponse): boolean {
    return response.type === 'skip';
  }

  public async process(
    transaction: TransactionEntity,
  ): Promise<void> {
    console.log(`Skipping transaction ${transaction.id}: LLM declined to categorize`);
    await this.actualApiService.updateTransactionNotes(
      transaction.id,
      this.tagService.addNotGuessedTag(transaction.notes ?? ''),
    );
  }
}

export default SkipStrategy;

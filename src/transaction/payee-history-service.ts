import { TransactionEntity } from '@actual-app/core/src/types/models';
import normalizePayee from '../utils/payee-normalizer';
import SimilarityCalculator from '../similarity-calculator';
import {
  isAggregatorPrefix,
  fewShotExactMatchTarget,
  fewShotFuzzyThreshold,
  fewShotMaxExamples,
  fewShotHistogramTopN,
} from '../config';

export interface PayeeHistoryMatch {
  entries: TransactionEntity[];
  histogram: Map<string, number>;
  matchType: 'exact' | 'fuzzy' | 'aggregator-skip' | 'none';
  normalizedKey: string;
  // Stored bucket keys this match drew from. For 'fuzzy' matches this is the
  // list of keys whose similarity passed the threshold (excluding the input
  // key itself). For 'exact' it is just [normalizedKey]. Used for diagnostic
  // logging so fuzzy false positives can be identified after the fact.
  matchedKeys?: string[];
}

interface PayeeHistoryServiceOpts {
  exactMatchTarget?: number;
  fuzzyThreshold?: number;
  maxExamples?: number;
  histogramTopN?: number;
  guessedTag?: string;
  notGuessedTag?: string;
}

class PayeeHistoryService {
  private readonly index = new Map<string, TransactionEntity[]>();

  private readonly categoryNames: Map<string, string>;

  private readonly similarityCalculator: SimilarityCalculator;

  private readonly opts: Required<PayeeHistoryServiceOpts>;

  constructor(
    transactions: TransactionEntity[],
    categories: { id: string; name: string }[],
    private readonly blocklist: Set<string>,
    similarityCalculator: SimilarityCalculator,
    opts?: PayeeHistoryServiceOpts,
  ) {
    this.categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    this.similarityCalculator = similarityCalculator;
    this.opts = {
      exactMatchTarget: opts?.exactMatchTarget ?? fewShotExactMatchTarget,
      fuzzyThreshold: opts?.fuzzyThreshold ?? fewShotFuzzyThreshold,
      maxExamples: opts?.maxExamples ?? fewShotMaxExamples,
      histogramTopN: opts?.histogramTopN ?? fewShotHistogramTopN,
      guessedTag: opts?.guessedTag ?? '#actual-ai',
      notGuessedTag: opts?.notGuessedTag ?? '#actual-ai-miss',
    };

    transactions.forEach((tx) => {
      if (!tx.imported_payee) return;
      if (tx.category == null) return;
      const notes = tx.notes ?? '';
      if (notes.includes(this.opts.guessedTag)) return;
      if (notes.includes(this.opts.notGuessedTag)) return;

      const key = normalizePayee(tx.imported_payee);
      // Drop transactions whose payee normalizes to empty (pure punctuation /
      // suffix) — they would all collide into one bucket and pollute matches.
      if (!key) return;
      if (this.blocklist.has(key) || isAggregatorPrefix(key)) return;

      const bucket = this.index.get(key);
      if (bucket) {
        bucket.push(tx);
      } else {
        this.index.set(key, [tx]);
      }
    });
  }

  getMatch(tx: TransactionEntity): PayeeHistoryMatch {
    if (!tx.imported_payee) {
      return PayeeHistoryService.emptyMatch('', 'none');
    }

    const key = normalizePayee(tx.imported_payee);
    if (!key) {
      return PayeeHistoryService.emptyMatch('', 'none');
    }

    if (this.blocklist.has(key) || isAggregatorPrefix(key)) {
      return PayeeHistoryService.emptyMatch(key, 'aggregator-skip');
    }

    const exactBucket = this.index.get(key);
    if (exactBucket && exactBucket.length >= this.opts.exactMatchTarget) {
      return this.buildResult(exactBucket, key, 'exact', [key]);
    }

    const fuzzyBuckets: TransactionEntity[] = [];
    const matchedKeys: string[] = [];
    this.index.forEach((bucket, storedKey) => {
      if (storedKey === key) {
        fuzzyBuckets.push(...bucket);
        matchedKeys.push(storedKey);
        return;
      }
      const sim = this.similarityCalculator.calculateNameSimilarity(key, storedKey);
      if (sim >= this.opts.fuzzyThreshold) {
        fuzzyBuckets.push(...bucket);
        matchedKeys.push(storedKey);
      }
    });

    if (fuzzyBuckets.length > 0) {
      return this.buildResult(fuzzyBuckets, key, 'fuzzy', matchedKeys);
    }

    return PayeeHistoryService.emptyMatch(key, 'none');
  }

  private static emptyMatch(
    normalizedKey: string,
    matchType: 'none' | 'aggregator-skip',
  ): PayeeHistoryMatch {
    return {
      entries: [],
      histogram: new Map(),
      matchType,
      normalizedKey,
    };
  }

  getCategoryName(categoryId: string | null | undefined): string {
    if (!categoryId) return 'UNCATEGORIZED';
    return this.categoryNames.get(categoryId) ?? 'UNCATEGORIZED';
  }

  private buildResult(
    bucket: TransactionEntity[],
    normalizedKey: string,
    matchType: 'exact' | 'fuzzy',
    matchedKeys: string[],
  ): PayeeHistoryMatch {
    const sorted = [...bucket].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).reverse();

    const seen = new Set<string>();
    const entries: TransactionEntity[] = [];
    sorted.some((tx) => {
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      entries.push(tx);
      return entries.length >= this.opts.maxExamples;
    });

    const histogram = new Map<string, number>();
    bucket.forEach((tx) => {
      const name = this.getCategoryName(tx.category);
      histogram.set(name, (histogram.get(name) ?? 0) + 1);
    });

    return {
      entries,
      histogram,
      matchType,
      normalizedKey,
      matchedKeys,
    };
  }
}

export default PayeeHistoryService;

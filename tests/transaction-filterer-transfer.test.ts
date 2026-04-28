import TransactionFilterer from '../src/transaction/transaction-filterer';
import TagService from '../src/transaction/tag-service';
import GivenActualData from './test-doubles/given/given-actual-data';

const NOT_GUESSED_TAG = '#actual-ai-miss';
const GUESSED_TAG = '#actual-ai';

describe('TransactionFilterer — transfer detection (P2L-95)', () => {
  const tagService = new TagService(NOT_GUESSED_TAG, GUESSED_TAG);
  const filterer = new TransactionFilterer(tagService);
  const accounts = GivenActualData.createSampleAccounts();

  it('excludes Tx with native transfer_id (auto-paired by Actual)', () => {
    const tx = GivenActualData.createTransaction(
      'paired-1',
      -50000,
      'Some Internal Account',
      '',
    );
    tx.transfer_id = 'paired-tx-2';
    expect(filterer.filterUncategorized([tx], accounts)).toEqual([]);
  });

  it('excludes "Spk Heidelberg EIGENE KREDITKARTENABRECHN." Tx via heuristic', () => {
    // Real-world example: SpK credit-card statement bookings that are not
    // auto-paired (no transfer_id) because the credit card is not a separate
    // Actual account. Both signals required: payee name + notes pattern.
    const tx = GivenActualData.createTransaction(
      'spk-1',
      -1139200,
      'SPK HEIDELBERG',
      'EIGENE KREDITKARTENABRECHN.',
    );
    expect(filterer.filterUncategorized([tx], accounts)).toEqual([]);
  });

  it('excludes Spk Heidelberg Tx with EIGENE KREDITKARTENABRECHN. carried in imported_payee', () => {
    // Some import flows put the SAP-style booking text into imported_payee
    // rather than notes. Heuristic must accept either source.
    const tx = GivenActualData.createTransaction(
      'spk-2',
      -50000,
      'SPK HEIDELBERG EIGENE KREDITKARTENABRECHN.',
      '',
    );
    expect(filterer.filterUncategorized([tx], accounts)).toEqual([]);
  });

  it('excludes Tx where resolved payee name carries Spk Heidelberg', () => {
    // After Actual resolves the payee, imported_payee may be shadowed by a
    // canonical payee record. Heuristic should still match via the resolved
    // payee passed in via tx.payee (lookup is name-substring on the raw value
    // we have access to: imported_payee + payee handled when payee is a name
    // string in tests; in production we only have the id, so the heuristic
    // operates on imported_payee + notes which is the worst-case path).
    const tx = GivenActualData.createTransaction(
      'spk-3',
      -50000,
      'Spk Heidelberg',
      'eigene kreditkartenabrechn',
    );
    expect(filterer.filterUncategorized([tx], accounts)).toEqual([]);
  });

  it('does NOT exclude Spk Heidelberg Tx without the KREDITKARTENABRECHN. signal', () => {
    // Plain SpK Heidelberg ATM withdrawal etc. must still hit the LLM.
    const tx = GivenActualData.createTransaction(
      'spk-4',
      -10000,
      'Spk Heidelberg',
      'GA NR00000000 BLZ672500200',
    );
    const result = filterer.filterUncategorized([tx], accounts);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('spk-4');
  });

  it('does NOT exclude Tx that mentions KREDITKARTENABRECHN but at a different bank', () => {
    // Conservative anchor: payee MUST contain "Spk Heidelberg" AND the
    // KREDITKARTENABRECHN signal. A different bank's credit-card statement
    // line should still reach the LLM (out of scope for this heuristic).
    const tx = GivenActualData.createTransaction(
      'other-bank-1',
      -10000,
      'Deutsche Bank',
      'EIGENE KREDITKARTENABRECHN.',
    );
    const result = filterer.filterUncategorized([tx], accounts);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('other-bank-1');
  });

  it('passes regular Tx through (sanity)', () => {
    const tx = GivenActualData.createTransaction(
      'reg-1',
      -1500,
      'Carrefour 1234',
      'Some grocery shop',
    );
    const result = filterer.filterUncategorized([tx], accounts);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('reg-1');
  });
});

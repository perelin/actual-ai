describe('config feature env parsing', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
  });

  test('supports ENABLED_FEATURES comma-separated list', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      FEATURES: '',
      ENABLED_FEATURES: 'freeWebSearch,suggestNewCategories',
    };

    const config = await import('../src/config');
    expect(config.getEnabledTools()).toContain('freeWebSearch');
    expect(config.isFeatureEnabled('suggestNewCategories')).toBe(true);
  });

  test('supports ENABLED_FEATURES JSON array', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      FEATURES: '',
      ENABLED_FEATURES: '["disableRateLimiter"]',
    };

    const config = await import('../src/config');
    expect(config.isFeatureEnabled('disableRateLimiter')).toBe(true);
  });

  test('parses LLM timeout and OpenRouter tool-calling env values', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LLM_TIMEOUT_MS: '45000',
      OPENROUTER_ENABLE_TOOL_CALLING: 'true',
    };

    const config = await import('../src/config');
    expect(config.llmTimeoutMs).toBe(45000);
    expect(config.openrouterEnableToolCalling).toBe(true);
  });

  describe('parseMaxTransactions', () => {
    test('returns undefined when env var is absent', async () => {
      const { parseMaxTransactions } = await import('../src/config');
      expect(parseMaxTransactions(undefined)).toBeUndefined();
    });

    test('returns undefined when env var is empty / whitespace', async () => {
      const { parseMaxTransactions } = await import('../src/config');
      expect(parseMaxTransactions('')).toBeUndefined();
      expect(parseMaxTransactions('   ')).toBeUndefined();
    });

    test('parses a valid positive integer', async () => {
      const { parseMaxTransactions } = await import('../src/config');
      expect(parseMaxTransactions('100')).toBe(100);
      expect(parseMaxTransactions(' 42 ')).toBe(42);
    });

    test('throws on zero, negatives, non-integers and non-numeric strings', async () => {
      const { parseMaxTransactions } = await import('../src/config');
      expect(() => parseMaxTransactions('0')).toThrow(/MAX_TRANSACTIONS/);
      expect(() => parseMaxTransactions('-5')).toThrow(/MAX_TRANSACTIONS/);
      expect(() => parseMaxTransactions('1.5')).toThrow(/MAX_TRANSACTIONS/);
      expect(() => parseMaxTransactions('abc')).toThrow(/MAX_TRANSACTIONS/);
      expect(() => parseMaxTransactions('100x')).toThrow(/MAX_TRANSACTIONS/);
    });

    test('module load fails when MAX_TRANSACTIONS is invalid', async () => {
      process.env = { ...ORIGINAL_ENV, MAX_TRANSACTIONS: 'not-a-number' };
      await expect(import('../src/config')).rejects.toThrow(/MAX_TRANSACTIONS/);
    });

    test('module-level maxTransactions reflects valid env value', async () => {
      process.env = { ...ORIGINAL_ENV, MAX_TRANSACTIONS: '7' };
      const config = await import('../src/config');
      expect(config.maxTransactions).toBe(7);
    });
  });
});

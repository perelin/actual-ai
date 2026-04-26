import { LanguageModel } from 'ai';
import { LlmModelFactoryI } from '../src/types';
import RateLimiter from '../src/utils/rate-limiter';

describe('LlmService anthropic prompt-caching contract', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('marks the static part with anthropic cacheControl, leaves variable part unmarked, sends no top-level prompt', async () => {
    const generateTextMock = jest.fn().mockResolvedValue({
      text: '{"type":"skip"}',
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    jest.doMock('ai', () => ({
      generateText: generateTextMock,
    }));

    const LlmService = (await import('../src/llm-service')).default;

    const llmModelFactory: LlmModelFactoryI = {
      create: () => ({}) as LanguageModel,
      getProvider: () => 'anthropic',
      getModelProvider: () => 'anthropic',
      isFallbackMode: () => false,
    };
    const rateLimiter = new RateLimiter();
    rateLimiter.executeWithRateLimiting = async <T>(
      _provider: string,
      op: () => Promise<T>,
    ): Promise<T> => op();

    const svc = new LlmService(llmModelFactory, rateLimiter, true, undefined);

    await svc.ask({ staticPart: 'STATIC_BLOCK', variablePart: 'VARIABLE_BLOCK' });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const firstCall = generateTextMock.mock.calls[0] as [unknown] | undefined;
    if (!firstCall) throw new Error('Expected generateText to be called');
    interface ContentPart {
      type: string;
      text: string;
      providerOptions?: { anthropic?: { cacheControl?: { type: string } } };
    }
    interface Message { role: string; content: ContentPart[] }
    const opts = firstCall[0] as { prompt?: unknown; messages?: Message[] };

    // Anthropic path uses messages, not the legacy single-string prompt.
    expect(opts.prompt).toBeUndefined();
    expect(opts.messages).toBeDefined();
    expect(opts.messages).toHaveLength(1);

    const msg = opts.messages![0];
    expect(msg.role).toBe('user');
    expect(msg.content).toHaveLength(2);

    // First content part = static block, marked for ephemeral caching.
    const staticPart = msg.content[0];
    expect(staticPart.type).toBe('text');
    expect(staticPart.text).toBe('STATIC_BLOCK');
    expect(staticPart.providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });

    // Second content part = variable block, MUST NOT carry cacheControl
    // (otherwise Anthropic creates a second cache breakpoint per transaction).
    const variablePart = msg.content[1];
    expect(variablePart.type).toBe('text');
    expect(variablePart.text).toBe('VARIABLE_BLOCK');
    expect(variablePart.providerOptions).toBeUndefined();
  });

  test('non-anthropic providers fall back to single-string prompt with concatenated parts', async () => {
    const generateTextMock = jest.fn().mockResolvedValue({
      text: '{"type":"skip"}',
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    jest.doMock('ai', () => ({
      generateText: generateTextMock,
    }));

    const LlmService = (await import('../src/llm-service')).default;

    const llmModelFactory: LlmModelFactoryI = {
      create: () => ({}) as LanguageModel,
      getProvider: () => 'openai',
      getModelProvider: () => 'openai',
      isFallbackMode: () => false,
    };
    const rateLimiter = new RateLimiter();
    rateLimiter.executeWithRateLimiting = async <T>(
      _provider: string,
      op: () => Promise<T>,
    ): Promise<T> => op();

    const svc = new LlmService(llmModelFactory, rateLimiter, true, undefined);

    await svc.ask({ staticPart: 'STATIC_BLOCK', variablePart: 'VARIABLE_BLOCK' });

    const secondCall = generateTextMock.mock.calls[0] as [unknown] | undefined;
    if (!secondCall) throw new Error('Expected generateText to be called');
    const opts = secondCall[0] as { prompt?: string; messages?: unknown };
    expect(opts.messages).toBeUndefined();
    expect(opts.prompt).toContain('STATIC_BLOCK');
    expect(opts.prompt).toContain('VARIABLE_BLOCK');
  });
});

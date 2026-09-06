import { generateText, LanguageModel, CoreMessage } from 'ai';
import {
  LlmModelFactoryI, LlmServiceI, SplitPrompt, ToolServiceI, UnifiedResponse,
} from './types';
import RateLimiter from './utils/rate-limiter';
import { PROVIDER_LIMITS } from './utils/provider-limits';
import { parseLlmResponse } from './utils/json-utils';

function joinPrompt(prompt: SplitPrompt): string {
  return `${prompt.staticPart}\n\n${prompt.variablePart}`;
}

export default class LlmService implements LlmServiceI {
  private readonly model: LanguageModel;

  private readonly rateLimiter: RateLimiter;

  private readonly provider: string;

  private readonly toolService?: ToolServiceI;

  private readonly isFallbackMode;

  private readonly timeoutMs: number;

  private readonly openrouterEnableToolCalling: boolean;

  constructor(
    llmModelFactory: LlmModelFactoryI,
    rateLimiter: RateLimiter,
    isRateLimitDisabled: boolean,
    toolService?: ToolServiceI,
    options?: {
      timeoutMs?: number;
      openrouterEnableToolCalling?: boolean;
    },
  ) {
    const factory = llmModelFactory;
    this.model = factory.create();
    this.isFallbackMode = factory.isFallbackMode();
    this.provider = factory.getProvider();
    this.rateLimiter = rateLimiter;
    this.toolService = toolService;
    this.timeoutMs = options?.timeoutMs ?? 120_000;
    this.openrouterEnableToolCalling = options?.openrouterEnableToolCalling ?? false;

    const limits = PROVIDER_LIMITS[this.provider];
    if (!isRateLimitDisabled && limits) {
      this.rateLimiter.setProviderLimit(this.provider, limits.requestsPerMinute);
      console.log(`Set ${this.provider} rate limits: ${limits.requestsPerMinute} requests/minute, ${limits.tokensPerMinute} tokens/minute`);
    } else {
      console.warn(`No rate limits configured for provider: ${this.provider} or Rate Limiter is disabled`);
    }
  }

  public async searchWeb(query: string): Promise<string> {
    if (!this.toolService) {
      return 'Search functionality is not available.';
    }

    try {
      console.log(`Performing web search for: "${query}"`);
      const searchResult = await this.toolService.search?.(query);
      if (searchResult !== undefined) {
        return searchResult;
      }
      return 'Search tool is not available.';
    } catch (error) {
      console.error('Error during web search:', error);
      return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  public async ask(
    prompt: SplitPrompt,
    validCategoryIds?: Set<string>,
  ): Promise<UnifiedResponse> {
    try {
      console.log(`Making LLM request to ${this.provider}${this.isFallbackMode ? ' (fallback mode)' : ''}`);

      if (this.isFallbackMode) {
        const response = await this.askUsingFallbackModel(joinPrompt(prompt));
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (!uuidRegex.test(response)) {
          console.warn('If you are using ollama and you see it all the time, check the ollama api logs.'
              + 'Maybe you need to use bigger context window');
          throw new Error(`Could not foud category in LLM response: ${response}`);
        }
        return {
          type: 'existing',
          categoryId: response,
        };
      }

      const first = await this.askOnce(prompt);

      // Hallucination guard: if the model returned a categoryId that isn't in
      // the project's category list, retry once with explicit feedback. The
      // first run already paid the static-prompt cache_create; retry pays
      // cache_read (~10%) plus the variable part — so cost is small.
      if (
        validCategoryIds
        && first.categoryId
        && !validCategoryIds.has(first.categoryId)
      ) {
        console.warn(
          `[halluc-retry] LLM returned non-existent categoryId="${first.categoryId}" — `
          + 'retrying with corrective feedback',
        );
        const retryPrompt: SplitPrompt = {
          staticPart: prompt.staticPart,
          variablePart:
            `${prompt.variablePart}\n\n`
            + 'CORRECTION: Your previous response used `categoryId: "'
            + `${first.categoryId}"\` which is NOT one of the IDs listed in the category catalog above. `
            + 'You must either copy a categoryId verbatim from the `(ID: "...")` annotations, '
            + 'or respond with `{"type":"skip"}`. Do not invent UUIDs.',
        };
        const second = await this.askOnce(retryPrompt);
        if (
          second.categoryId
          && !validCategoryIds.has(second.categoryId)
        ) {
          console.warn(
            `[halluc-retry] retry still hallucinated categoryId="${second.categoryId}" — `
            + 'falling through to not-guessed tag',
          );
        }
        return second;
      }

      return first;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error during LLM request to ${this.provider}: ${errorMsg}`);
      throw error;
    }
  }

  private async askOnce(prompt: SplitPrompt): Promise<UnifiedResponse> {
    return this.rateLimiter.executeWithRateLimiting(this.provider, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const disableOpenRouterTools = this.provider === 'openrouter' && !this.openrouterEnableToolCalling;
      const tools = disableOpenRouterTools ? undefined : this.toolService?.getTools();
      try {
        const generateArgs = this.buildGenerateArgs(prompt, tools, controller.signal);
        const result = await generateText(generateArgs);

        this.logUsage(result);

        try {
          return parseLlmResponse(result.text);
        } catch (error) {
          console.error('LLM response validation failed:', error);
          throw new Error('Invalid response format from LLM');
        }
      } finally {
        clearTimeout(timer);
      }
    });
  }

  private buildGenerateArgs(
    prompt: SplitPrompt,
    tools: Record<string, unknown> | undefined,
    abortSignal: AbortSignal,
  ): Parameters<typeof generateText>[0] {
    const base = {
      model: this.model,
      temperature: 0.2,
      // 2026-09 GLM switch: reasoning is mandatory via OpenRouter's Anthropic
      // skin and burns output tokens before the JSON text block. Without an
      // explicit budget the AI SDK defaults to 4096 — GLM 5.3 thinking on
      // few-shot-heavy transactions hit that ceiling with an EMPTY text block
      // (observed in dry-n 100). 16384 leaves ample thinking headroom; only
      // used tokens are billed.
      maxTokens: 16384,
      tools: tools as Parameters<typeof generateText>[0]['tools'],
      maxSteps: tools ? 3 : 1,
      abortSignal,
    };

    // Anthropic provider supports native prompt caching: mark the static block
    // with cache_control so it's stored once and read back at ~10% input cost
    // for every subsequent transaction in the run.
    if (this.provider === 'anthropic') {
      const messages: CoreMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt.staticPart,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            { type: 'text', text: prompt.variablePart },
          ],
        },
      ];
      return { ...base, messages };
    }

    // Other providers (openai/openrouter/google/groq): single string prompt.
    // No cache_control passthrough — providers strip the field, see decision
    // log in CLAUDE.md.
    return { ...base, prompt: joinPrompt(prompt) };
  }

  private logUsage(result: Awaited<ReturnType<typeof generateText>>): void {
    const usage = result.usage as
      | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
      | undefined;
    const meta = (result as unknown as {
      experimental_providerMetadata?: {
        anthropic?: {
          cacheCreationInputTokens?: number;
          cacheReadInputTokens?: number;
        };
      };
    }).experimental_providerMetadata;
    const cacheCreate = meta?.anthropic?.cacheCreationInputTokens ?? 0;
    const cacheRead = meta?.anthropic?.cacheReadInputTokens ?? 0;
    console.log(
      `[llm-usage] provider=${this.provider} `
      + `prompt=${usage?.promptTokens ?? 0} completion=${usage?.completionTokens ?? 0} `
      + `cache_create=${cacheCreate} cache_read=${cacheRead}`,
    );
  }

  public async askUsingFallbackModel(prompt: string): Promise<string> {
    return this.rateLimiter.executeWithRateLimiting(
      this.provider,
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        console.log(`Sending text generation request to ${this.provider}`);
        try {
          const { text } = await generateText({
            model: this.model,
            prompt,
            temperature: 0.1,
            // Same GLM reasoning headroom as buildGenerateArgs (see there).
            maxTokens: 16384,
            abortSignal: controller.signal,
          });

          return text.replace(/(\r\n|\n|\r|"|')/gm, '');
        } finally {
          clearTimeout(timer);
        }
      },
    );
  }
}

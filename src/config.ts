import dotenv from 'dotenv';
import fs from 'fs';
import normalizePayee from './utils/payee-normalizer';

const defaultPromptStaticTemplate = fs
  .readFileSync('./src/templates/prompt-static.hbs', 'utf8').trim();
const defaultPromptVariableTemplate = fs
  .readFileSync('./src/templates/prompt-variable.hbs', 'utf8').trim();

dotenv.config();

export const serverURL = process.env.ACTUAL_SERVER_URL ?? '';
export const password = process.env.ACTUAL_PASSWORD ?? '';
export const budgetId = process.env.ACTUAL_BUDGET_ID ?? '';
export const e2ePassword = process.env.ACTUAL_E2E_PASSWORD ?? '';
export const cronSchedule = process.env.CLASSIFICATION_SCHEDULE_CRON ?? '';
export const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? '';
export const llmProvider = process.env.LLM_PROVIDER ?? (openrouterApiKey ? 'openrouter' : 'openai');
export const openaiBaseURL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
export const openaiApiKey = process.env.OPENAI_API_KEY ?? '';
export const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
export const openrouterBaseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
export const openrouterModel = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v3.2';
export const openrouterReferrer = process.env.OPENROUTER_REFERRER ?? process.env.OPENROUTER_REFERER ?? '';
export const openrouterTitle = process.env.OPENROUTER_TITLE ?? 'actual-ai';
const parsedLlmTimeoutMs = Number.parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10);
export const llmTimeoutMs = Number.isFinite(parsedLlmTimeoutMs) && parsedLlmTimeoutMs > 0
  ? parsedLlmTimeoutMs
  : 120_000;

export function parseMaxTransactions(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid MAX_TRANSACTIONS value '${raw}': must be a positive integer (e.g. 100). `
      + 'Leave unset to process all uncategorized transactions.',
    );
  }
  return parsed;
}

export const maxTransactions: number | undefined = parseMaxTransactions(
  process.env.MAX_TRANSACTIONS,
);
export const openrouterEnableToolCalling = process.env.OPENROUTER_ENABLE_TOOL_CALLING === 'true';
export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
export const anthropicBaseURL = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
export const anthropicModel = process.env.ANTHROPIC_MODEL ?? 'z-ai/glm-5.3';
export const googleModel = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? process.env.GOOGLE_GENERATIVE_MODEL ?? 'gemini-1.5-flash';
export const googleBaseURL = process.env.GOOGLE_GENERATIVE_AI_BASE_URL ?? process.env.GOOGLE_GENERATIVE_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
export const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
export const ollamaBaseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
export const ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3.1';
export const dataDir = '/tmp/actual-ai/';
export const promptStaticTemplate = process.env.PROMPT_TEMPLATE_STATIC
  ?? defaultPromptStaticTemplate;
export const promptVariableTemplate = process.env.PROMPT_TEMPLATE_VARIABLE
  ?? defaultPromptVariableTemplate;
export const notGuessedTag = process.env.NOT_GUESSED_TAG ?? '#actual-ai-miss';
export const guessedTag = process.env.GUESSED_TAG ?? '#actual-ai';
export const groqApiKey = process.env.GROQ_API_KEY ?? '';
export const groqModel = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
export const groqBaseURL = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
export const valueSerpApiKey = process.env.VALUESERP_API_KEY ?? '';
export interface FeatureFlag {
  enabled: boolean;
  defaultValue: boolean;
  description: string;
  options?: string[];
}

export type FeatureFlags = Record<string, FeatureFlag>;

export const features: FeatureFlags = {};

let enabledFeatures: string[] = [];
try {
  if (process.env.FEATURES) {
    const parsedFeatures = JSON.parse(process.env.FEATURES) as unknown;
    if (Array.isArray(parsedFeatures)) {
      enabledFeatures = parsedFeatures as string[];
    } else {
      console.warn('FEATURES environment variable is not a valid JSON array, ignoring');
    }
  } else if (process.env.ENABLED_FEATURES) {
    const raw = process.env.ENABLED_FEATURES.trim();
    if (raw.startsWith('[')) {
      const parsedFeatures = JSON.parse(raw) as unknown;
      if (Array.isArray(parsedFeatures)) {
        enabledFeatures = parsedFeatures as string[];
      } else {
        console.warn('ENABLED_FEATURES must be a comma list or JSON array, ignoring');
      }
    } else {
      enabledFeatures = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
} catch (e) {
  console.warn('Failed to parse FEATURES/ENABLED_FEATURES environment variable, ignoring', e);
}

function registerStandardFeatures() {
  features.suggestNewCategories = {
    enabled: enabledFeatures.includes('suggestNewCategories'),
    defaultValue: false,
    description: 'Suggest new categories for transactions that cannot be classified',
  };

  features.dryRun = {
    enabled: enabledFeatures.includes('dryRun'),
    defaultValue: true,
    description: 'Run in dry mode without actually making changes',
  };

  features.rerunMissedTransactions = {
    enabled: enabledFeatures.includes('rerunMissedTransactions'),
    defaultValue: false,
    description: 'Re-process transactions marked as not guessed',
  };

  features.classifyOnStartup = {
    enabled: enabledFeatures.includes('classifyOnStartup') || process.env.CLASSIFY_ON_STARTUP === 'true',
    defaultValue: false,
    description: 'Run classification when the application starts',
  };

  features.syncAccountsBeforeClassify = {
    enabled: enabledFeatures.includes('syncAccountsBeforeClassify') || process.env.SYNC_ACCOUNTS_BEFORE_CLASSIFY === 'true',
    defaultValue: false,
    description: 'Sync accounts before running classification',
  };

  features.disableRateLimiter = {
    enabled: enabledFeatures.includes('disableRateLimiter'),
    defaultValue: false,
    description: 'Disable Rate Limiter',
  };

  features.fewShotPayeeHistory = {
    enabled: enabledFeatures.includes('fewShotPayeeHistory'),
    defaultValue: false,
    description: 'Include per-payee few-shot history from user-categorized transactions in LLM prompt',
  };
}

function registerToolFeatures() {
  const legacyTools = (process.env.ENABLED_TOOLS ?? '').split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);

  features.webSearch = {
    enabled: enabledFeatures.includes('webSearch') || legacyTools.includes('webSearch'),
    defaultValue: false,
    description: 'Enable web search capability for merchant lookup',
    options: ['webSearch'],
  };

  features.freeWebSearch = {
    enabled: enabledFeatures.includes('freeWebSearch') || legacyTools.includes('freeWebSearch'),
    defaultValue: false,
    description: 'Enable free web search capability for merchant lookup (self-hosted alternative to ValueSerp)',
    options: ['freeWebSearch'],
  };

  // Additional tools can be added here following the same pattern
  // features.newTool = {
  //   enabled: enabledFeatures.includes('newTool'),
  //   defaultValue: false,
  //   description: '...'
  // };
}

registerStandardFeatures();
registerToolFeatures();

export const fewShotFuzzyThreshold = 0.7;
export const fewShotExactMatchTarget = 1;
export const fewShotMaxExamples = 5;
export const fewShotHistogramTopN = 5;

export const fewShotAggregatorBlocklistRaw = [
  'Paypal Europe S.A.R.L. Et Cie S.C.A',
  'Klarna Bank Ab',
  'Klarna Bank Ab (Publ) (DE61 XXX 5519)',
  'Amazon Payments Europe S.C.A.',
  'Amazon Payments Europe S.C.A. (DE87 XXX 2006)',
  'Amazon Eu S.A R.L., Niederlassung Deutschland',
  'Apple.Com/Bill',
  'Nexi Germany Gmbh (DE09 XXX 5340)',
];

// All PayPal Europe imported_payee variants (with/without IBAN suffix, address
// block, or "(Europe)" parens) collapse onto the canonical key 'paypal europe'
// via normalizePayee — so a single entry suffices.

export const fewShotAggregatorBlocklist = new Set(
  fewShotAggregatorBlocklistRaw.map(normalizePayee),
);

// P2L-95: stopgap heuristic for inter-account transfers that Actual cannot
// auto-pair via transfer_id (e.g. when the credit card is not a separate
// Account). Each entry requires BOTH a payee-name substring AND a
// notes-or-imported-payee-substring match — case-insensitive. Conservative
// by design: do not add patterns that could match anything except a known
// internal-balance-shift booking.
export interface TransferFilterPattern {
  payeeContains: string; // matched against tx.imported_payee (case-insensitive)
  signalContains: string; // matched against tx.imported_payee + tx.notes
}

export const transferFilterPatterns: TransferFilterPattern[] = [
  // SpK Heidelberg "EIGENE KREDITKARTENABRECHN." — internal balance shift
  // from Girokonto to credit card statement. The credit card is not a
  // separate Actual Account, so transfer_id is null. Conservative two-signal
  // anchor: bank name + booking-text fragment.
  { payeeContains: 'spk heidelberg', signalContains: 'eigene kreditkartenabrechn' },
];

export function isInternalTransferByPattern(
  importedPayee: string | null | undefined,
  notes: string | null | undefined,
): boolean {
  const ip = (importedPayee ?? '').toLowerCase();
  const nt = (notes ?? '').toLowerCase();
  const haystack = `${ip} ${nt}`;
  return transferFilterPatterns.some(
    ({ payeeContains, signalContains }) => (
      ip.includes(payeeContains) && haystack.includes(signalContains)
    ),
  );
}

export function isAggregatorPrefix(normalized: string): boolean {
  return normalized.startsWith('sumup');
}

export function isFeatureEnabled(featureName: string): boolean {
  return features[featureName]?.enabled ?? features[featureName]?.defaultValue ?? false;
}

export function registerCustomFeatureFlag(
  name: string,
  enabled: boolean,
  defaultValue: boolean,
  description: string,
  options?: string[],
): void {
  features[name] = {
    enabled,
    defaultValue,
    description,
    options,
  };
}

export function toggleFeature(featureName: string, enabled?: boolean): boolean {
  if (!features[featureName]) {
    console.warn(`Feature flag '${featureName}' does not exist`);
    return false;
  }
  const newValue = enabled ?? !features[featureName].enabled;
  features[featureName].enabled = newValue;
  return newValue;
}

export function getEnabledTools(): string[] {
  return Object.entries(features)
    .filter(([_, config]) => config.options && isFeatureEnabled(config.options[0]))
    .flatMap(([_, config]) => config.options ?? []);
}

export function isToolEnabled(toolName: string): boolean {
  return getEnabledTools().includes(toolName);
}

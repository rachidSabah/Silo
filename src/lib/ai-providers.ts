// AI Provider configuration - shared between client and server

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
  description?: string;
  free?: boolean;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openrouter: {
    name: 'OpenRouter',
    description: 'Access 200+ models from one API. Free models available!',
    free: true,
    models: [
      // ── Free Models (no cost, rate-limited) ──
      'google/gemma-3-27b-it:free',
      'google/gemma-3-12b-it:free',
      'google/gemma-3-4b-it:free',
      'meta-llama/llama-4-maverick:free',
      'meta-llama/llama-4-scout:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'qwen/qwen3-32b:free',
      'qwen/qwen3-14b:free',
      'qwen/qwen3-8b:free',
      'qwen/qwen3-4b:free',
      'deepseek/deepseek-r1-0528:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'microsoft/phi-4:free',
      'nvidia/llama-3.1-nemotron-70b-instruct:free',
      'moonshotai/kimi-vl-a3b-thinking:free',
      'rekaai/reka-flash-3:free',
      'huggingfaceh4/zephyr-7b-beta:free',
      // ── Popular Paid Models (pay-per-token) ──
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/o3-mini',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'meta-llama/llama-4-maverick',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
    ],
    defaultModel: 'google/gemma-3-27b-it:free',
  },
  openai: {
    name: 'OpenAI',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o3',
      'o3-mini',
      'o4-mini',
    ],
    defaultModel: 'gpt-4o-mini',
  },
  gemini: {
    name: 'Google Gemini',
    models: [
      // ── Gemini 3.1 (Latest previews — free tier available on AI Studio) ──
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      // ── Gemini 3 (Preview — free tier available on AI Studio) ──
      'gemini-3-flash-preview',
      'gemini-3-pro-preview',
      // ── Gemini 2.5 (Stable — free tier on AI Studio) ──
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      // ── Gemini 2.0 (Stable — free tier, shutting down June 2026) ──
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    defaultModel: 'gemini-2.5-flash',
  },
  claude: {
    name: 'Anthropic Claude',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    defaultModel: 'deepseek-chat',
  },
  custom: {
    name: 'Custom Provider (OpenAI-Compatible)',
    description: 'Connect any OpenAI-compatible API — local LLMs (Ollama, LM Studio), self-hosted models, or third-party providers.',
    models: [], // User enters their own model name
    defaultModel: '',
  },
};

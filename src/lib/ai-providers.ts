// AI Provider configuration - shared between client and server

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
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
};

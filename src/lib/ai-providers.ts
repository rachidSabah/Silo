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
    name: 'Google Gemini / Gemma',
    models: [
      // Gemini 2.5 series
      'gemini-2.5-pro-preview-05-06',
      'gemini-2.5-flash-preview-05-20',
      // Gemini 2.0 series
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      // Gemini 1.5 series
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      // Gemma series (via Gemini API)
      'gemma-3-27b-it',
      'gemma-3-12b-it',
      'gemma-3-4b-it',
      'gemma-3-1b-it',
      // Legacy
      'gemini-pro',
    ],
    defaultModel: 'gemini-2.0-flash',
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

import { openai } from '@ai-sdk/openai';
import { fireworks } from '@ai-sdk/fireworks';
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';

export const DEFAULT_CHAT_MODEL: string = 'gpt-o3-mini';

export const myProvider = customProvider({
  languageModels: {
    'gpt-40': openai('gpt-4o'),
    'gpt-o1': openai('o1', {
      reasoningEffort: 'medium',
    }),
    'gpt-o3-mini': openai('gpt-4o-mini'),
    'title-model': openai('gpt-4o'),
    'artifact-model': openai('gpt-4o-mini'),
  },
  imageModels: {
    'small-model': openai.image('dall-e-2'),
    'large-model': openai.image('dall-e-3'),
  },
});

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'gpt-40',
    name: 'GPT 4o',
    description: 'Powerful multimodal model for complex tasks',
  },
  {
    id: 'gpt-o1',
    name: 'GPT o1',
    description: 'High-performance model with advanced reasoning',
  },
  {
    id: 'gpt-o3-mini',
    name: 'GPT o3 mini',
    description: 'Fast, efficient model for everyday tasks',
  },
];

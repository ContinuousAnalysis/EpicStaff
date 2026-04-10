import { LLMProvider } from '@shared/models';

export const PROVIDERS: LLMProvider[] = [
    {
        id: 1,
        name: 'openai',
    },
    {
        id: 2,
        name: 'ollama',
    },
    {
        id: 3,
        name: 'anthropic',
    },
    {
        id: 4,
        name: 'azure_openai',
    },
    {
        id: 5,
        name: 'groq',
    },
    {
        id: 6,
        name: 'huggingface',
    },
    {
        id: 7,
        name: 'openai_compatible',
    },
];

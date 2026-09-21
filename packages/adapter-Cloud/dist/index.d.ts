import { CloudRuntime } from '@hybrid-ai/core';

type CloudProviderConfig = {
    provider: 'openai';
    apiKey: string;
    model: string;
    baseUrl?: string;
} | {
    provider: 'anthropic';
    apiKey: string;
    model: string;
} | {
    provider: 'gemini';
    apiKey: string;
    model: string;
} | {
    provider: 'custom';
    apiKey?: string;
    model: string;
    baseUrl: string;
};

declare function createCloudAdapter(config: CloudProviderConfig): CloudRuntime;

export { createCloudAdapter };

import { ChatProvider, ProviderConfig } from './types';
import { OllamaProvider } from './OllamaProvider';
import { LMStudioProvider } from './LMStudioProvider';
import { GeminiProvider } from './GeminiProvider';
import { ClaudeProvider } from './ClaudeProvider';

export class ProviderRegistry {
    private providers = new Map<string, ChatProvider>();

    registerProvider(config: ProviderConfig): void {
        let provider: ChatProvider;

        switch (config.type) {
            case 'ollama':
                provider = new OllamaProvider(config);
                break;
            case 'lmstudio':
                provider = new LMStudioProvider(config);
                break;
            case 'gemini':
                provider = new GeminiProvider(config);
                break;
            case 'claude':
                provider = new ClaudeProvider(config);
                break;
            default:
                throw new Error(`Unknown provider type: ${config.type}`);
        }

        this.providers.set(config.id, provider);
    }

    getProvider(id: string): ChatProvider | undefined {
        return this.providers.get(id);
    }

    getAllProviders(): ChatProvider[] {
        return Array.from(this.providers.values());
    }

    updateProviders(configs: ProviderConfig[]): void {
        // Clear existing providers
        this.providers.clear();

        // Register new providers
        for (const config of configs) {
            if (config.enabled) {
                this.registerProvider(config);
            }
        }
    }
}

// Global provider registry instance
export const providerRegistry = new ProviderRegistry();

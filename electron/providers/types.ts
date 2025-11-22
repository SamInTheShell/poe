// Provider abstraction types
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface ProviderCapabilities {
    supportsTools: boolean;
    supportsStreaming: boolean;
    supportsUsageInfo: boolean;
    maxContextLength?: number;
}

export interface ModelConfig {
    id: string;
    name: string;
    type: 'embedding' | 'chat' | 'completion';
    contextLength: number;
    embeddingDimension?: number | null;
    supportsTools?: boolean;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    timestamp: number;
    thinking?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required: string[];
        };
    };
}

export interface ToolResult {
    success: boolean;
    content?: any;
    error?: string;
}

export type ChatChunk =
    | { type: 'content'; content: string }
    | { type: 'tool_call'; toolCall: ToolCall }
    | { type: 'usage'; usage: TokenUsage }
    | { type: 'thinking'; thinking: string }
    | { type: 'done' }
    | { type: 'error'; error: string }
    | { type: 'cancelled' };

export interface StreamChatParams {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    signal?: AbortSignal;
    onToolCall?: (toolCall: ToolCall) => Promise<ToolResult>;
}

export interface ProviderConfig {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    baseURL: string;
    apiKey?: string;
    models: ModelConfig[];
}

export abstract class ChatProvider {
    protected config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    abstract getCapabilities(): ProviderCapabilities;
    abstract streamChat(params: StreamChatParams): AsyncGenerator<ChatChunk>;
    abstract getModels(): Promise<ModelConfig[]>;
    abstract getContextLength(model: string): Promise<number>;

    // Helper methods
    protected normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
        return messages.map(msg => ({ ...msg }));
    }

    protected createToolCallId(): string {
        return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

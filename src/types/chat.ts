// Chat message types
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
  thinking?: string; // For models that support reasoning/thinking
}

// Provider configuration types
export interface ModelConfig {
  id: string;
  name: string;
  type: 'embedding' | 'chat' | 'completion';
  contextLength: number;
  embeddingDimension?: number | null;
  supportsTools?: boolean; // Whether this model supports function/tool calling
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'ollama' | 'lmstudio';
  baseURL: string;
  apiKey?: string | null;
  models: ModelConfig[];
  config: {
    timeout?: number;
    retryAttempts?: number;
    embeddingEndpoint?: string;
    chatEndpoint?: string;
  };
  enabled: boolean;
}

export interface ProvidersData {
  providers: ProviderConfig[];
}

// Chat API request/response types
export interface ChatRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  tool_call?: ToolCall;
  error?: string;
  done?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Tool types
export interface ParameterSchema {
  type: string;
  description: string;
  enum?: string[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ParameterSchema>;
      required: string[];
    };
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  requiresMainProcess?: boolean;
  defaultPermission?: 'allow' | 'ask';
}

export interface ToolExecutionResult {
  tool_call_id: string;
  output: unknown;
  error?: string;
}

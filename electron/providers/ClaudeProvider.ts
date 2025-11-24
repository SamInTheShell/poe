import { ChatProvider, ChatChunk, StreamChatParams, ProviderCapabilities, ModelConfig, ProviderConfig, ChatMessage, ToolCall } from './types';

export class ClaudeProvider extends ChatProvider {
    getCapabilities(): ProviderCapabilities {
        return {
            supportsTools: true,
            supportsStreaming: true,
            supportsUsageInfo: true,
            maxContextLength: undefined,
        };
    }

    async getModels(): Promise<ModelConfig[]> {
        return this.config.models;
    }

    async getContextLength(model: string): Promise<number> {
        const modelConfig = this.config.models.find(m => m.id === model);
        if (modelConfig?.contextLength) {
            return modelConfig.contextLength;
        }
        // Default context lengths for known Claude models
        if (model.includes('claude-3-5-sonnet') || model.includes('claude-3-opus')) return 200000;
        if (model.includes('claude-3-haiku')) return 200000;
        return 200000; // fallback
    }

    async* streamChat(params: StreamChatParams): AsyncGenerator<ChatChunk> {
        if (!this.config.apiKey) {
            yield { type: 'error', error: 'Anthropic API key not configured' };
            return;
        }

        const url = `${this.config.baseURL}/messages`;

        // Extract system message
        const systemMessage = params.messages.find(m => m.role === 'system');
        const messages = this.convertMessagesToClaudeFormat(params.messages);

        const requestBody: Record<string, unknown> = {
            model: params.model,
            messages,
            max_tokens: 8192,
            stream: true,
        };

        if (systemMessage?.content) {
            requestBody.system = systemMessage.content;
        }

        if (params.tools && params.tools.length > 0) {
            requestBody.tools = params.tools.map(tool => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters,
            }));
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.config.apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify(requestBody),
                signal: params.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                yield { type: 'error', error: `Anthropic API error (${response.status}): ${errorText}` };
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                yield { type: 'error', error: 'No response body' };
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let currentToolCall: Partial<ToolCall> | null = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;

                    try {
                        const jsonStr = line.slice(6); // Remove 'data: ' prefix
                        const data = JSON.parse(jsonStr);

                        // Handle different event types
                        switch (data.type) {
                            case 'content_block_start':
                                if (data.content_block?.type === 'tool_use') {
                                    currentToolCall = {
                                        id: data.content_block.id,
                                        type: 'function',
                                        function: {
                                            name: data.content_block.name,
                                            arguments: '',
                                        }
                                    };
                                }
                                break;

                            case 'content_block_delta':
                                if (data.delta?.type === 'text_delta') {
                                    yield { type: 'content', content: data.delta.text };
                                } else if (data.delta?.type === 'input_json_delta') {
                                    if (currentToolCall?.function) {
                                        currentToolCall.function.arguments += data.delta.partial_json;
                                    }
                                }
                                break;

                            case 'content_block_stop':
                                if (currentToolCall && currentToolCall.id && currentToolCall.function) {
                                    const toolCall = currentToolCall as ToolCall;
                                    yield { type: 'tool_call', toolCall };

                                    // Execute tool if callback provided
                                    if (params.onToolCall) {
                                        try {
                                            await params.onToolCall(toolCall);
                                        } catch (error) {
                                            console.error('Tool execution error:', error);
                                        }
                                    }
                                    currentToolCall = null;
                                }
                                break;

                            case 'message_delta':
                                if (data.usage) {
                                    yield {
                                        type: 'usage',
                                        usage: {
                                            prompt_tokens: 0,
                                            completion_tokens: data.usage.output_tokens || 0,
                                            total_tokens: data.usage.output_tokens || 0,
                                        }
                                    };
                                }
                                break;

                            case 'message_start':
                                if (data.message?.usage) {
                                    yield {
                                        type: 'usage',
                                        usage: {
                                            prompt_tokens: data.message.usage.input_tokens || 0,
                                            completion_tokens: 0,
                                            total_tokens: data.message.usage.input_tokens || 0,
                                        }
                                    };
                                }
                                break;

                            case 'message_stop':
                                yield { type: 'done' };
                                break;
                        }
                    } catch (parseError) {
                        console.error("Failed to parse Claude SSE chunk:", parseError);
                    }
                }
            }

        } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
                yield { type: 'cancelled' };
            } else {
                yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
            }
        }
    }

    private convertMessagesToClaudeFormat(messages: ChatMessage[]): Record<string, unknown>[] {
        const claudeMessages: Record<string, unknown>[] = [];

        for (const msg of messages) {
            // Skip system messages (handled separately)
            if (msg.role === 'system') continue;

            const content: (string | Record<string, unknown>)[] = [];

            // Add text content
            if (msg.content) {
                content.push({
                    type: 'text',
                    text: msg.content,
                });
            }

            // Handle tool calls (assistant requesting tool use)
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const toolCall of msg.tool_calls) {
                    content.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: typeof toolCall.function.arguments === 'string'
                            ? JSON.parse(toolCall.function.arguments)
                            : toolCall.function.arguments,
                    });
                }
            }

            // Handle tool results
            if (msg.role === 'tool' && msg.tool_call_id) {
                claudeMessages.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: msg.tool_call_id,
                        content: msg.content,
                    }]
                });
                continue;
            }

            if (content.length > 0) {
                // Collapse single text content to string
                const finalContent = content.length === 1 && typeof content[0] === 'object' && 'type' in content[0] && content[0].type === 'text'
                    ? (content[0] as { text: string }).text
                    : content;

                claudeMessages.push({
                    role: msg.role,
                    content: finalContent,
                });
            }
        }

        return claudeMessages;
    }
}

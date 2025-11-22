import { ChatProvider, ChatChunk, StreamChatParams, ProviderCapabilities, ModelConfig, ProviderConfig, ChatMessage, ToolCall } from './types';

export class OllamaProvider extends ChatProvider {
    getCapabilities(): ProviderCapabilities {
        return {
            supportsTools: true,
            supportsStreaming: true,
            supportsUsageInfo: false,
            maxContextLength: undefined,
        };
    }

    async getModels(): Promise<ModelConfig[]> {
        return this.config.models;
    }

    async getContextLength(model: string): Promise<number> {
        try {
            const url = `${this.config.baseURL}/api/show`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model }),
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json();

            // Try to find context_length in model_info
            if (data.model_info) {
                for (const key in data.model_info) {
                    if (key.endsWith('.context_length')) {
                        return data.model_info[key];
                    }
                }
            }

            // Fallback to config value
            const modelConfig = this.config.models.find(m => m.id === model);
            if (modelConfig?.contextLength) {
                return modelConfig.contextLength;
            }

            throw new Error("Could not determine context length");
        } catch (error) {
            throw new Error(`Failed to get context length: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async* streamChat(params: StreamChatParams): AsyncGenerator<ChatChunk> {
        const url = `${this.config.baseURL}/api/chat`;

        // Build tool call map for tool result messages
        const toolCallMap = this.buildToolCallMap(params.messages);

        // Clean messages for Ollama format
        const cleanedMessages = this.cleanMessagesForOllama(params.messages, toolCallMap);

        const requestBody: Record<string, unknown> = {
            model: params.model,
            messages: cleanedMessages,
            stream: true,
        };

        if (params.tools && params.tools.length > 0) {
            requestBody.tools = params.tools;
        }

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: params.signal,
        });

        if (!response.ok) {
            yield { type: 'error', error: `Ollama API error: ${response.statusText}` };
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            yield { type: 'error', error: 'No response body' };
            return;
        }

        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n").filter((line) => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.message?.content) {
                            yield { type: 'content', content: data.message.content };
                        }

                        if (data.message?.tool_calls) {
                            for (const toolCallData of data.message.tool_calls) {
                                const toolCall: ToolCall = {
                                    id: toolCallData.id || this.createToolCallId(),
                                    type: "function",
                                    function: {
                                        name: toolCallData.function.name,
                                        arguments: typeof toolCallData.function.arguments === "string"
                                            ? toolCallData.function.arguments
                                            : JSON.stringify(toolCallData.function.arguments),
                                    },
                                };

                                yield { type: 'tool_call', toolCall };

                                // Execute tool immediately if callback provided
                                if (params.onToolCall) {
                                    try {
                                        await params.onToolCall(toolCall);
                                    } catch (error) {
                                        console.error('Tool execution error:', error);
                                    }
                                }
                            }
                        }

                        if (data.done) {
                            yield { type: 'done' };
                        }
                    } catch (parseError) {
                        console.error("Failed to parse chunk:", parseError);
                    }
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
                yield { type: 'cancelled' };
            } else {
                yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
            }
        } finally {
            reader.releaseLock();
        }
    }

    private buildToolCallMap(messages: ChatMessage[]): Map<string, string> {
        const toolCallMap = new Map<string, string>();
        messages.forEach((m) => {
            if (m.tool_calls && Array.isArray(m.tool_calls)) {
                m.tool_calls.forEach((tc) => {
                    if (tc.id && tc.function?.name) {
                        toolCallMap.set(tc.id, tc.function.name);
                    }
                });
            }
        });
        return toolCallMap;
    }

    private cleanMessagesForOllama(messages: ChatMessage[], toolCallMap: Map<string, string>): Record<string, unknown>[] {
        return messages.map((m) => {
            const cleaned: Record<string, unknown> = {
                role: m.role,
            };

            // Handle content
            if (m.content && (typeof m.content !== "string" || m.content.trim() !== "")) {
                cleaned.content = m.content;
            } else if (!m.tool_calls) {
                cleaned.content = m.content || "";
            }

            // Handle tool calls - convert to Ollama format
            if (m.tool_calls && Array.isArray(m.tool_calls)) {
                cleaned.tool_calls = m.tool_calls.map((tc) => ({
                    function: {
                        name: tc.function.name,
                        arguments: typeof tc.function.arguments === "string"
                            ? JSON.parse(tc.function.arguments)
                            : tc.function.arguments,
                    },
                }));
            }

            // For tool result messages, use tool_name instead of tool_call_id
            if (m.role === "tool" && m.tool_call_id) {
                const toolName = toolCallMap.get(m.tool_call_id);
                if (toolName) {
                    cleaned.tool_name = toolName;
                }
            }

            return cleaned;
        });
    }
}

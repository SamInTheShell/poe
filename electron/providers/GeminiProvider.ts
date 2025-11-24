import { ChatProvider, ChatChunk, StreamChatParams, ProviderCapabilities, ModelConfig, ProviderConfig, ChatMessage, ToolCall } from './types';

export class GeminiProvider extends ChatProvider {
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
        // Default context lengths for known Gemini models
        if (model.includes('gemini-2.0')) return 1000000;
        if (model.includes('gemini-1.5-pro')) return 2000000;
        if (model.includes('gemini-1.5-flash')) return 1000000;
        return 32768; // fallback
    }

    async* streamChat(params: StreamChatParams): AsyncGenerator<ChatChunk> {
        if (!this.config.apiKey) {
            yield { type: 'error', error: 'Gemini API key not configured' };
            return;
        }

        const url = `${this.config.baseURL}/models/${params.model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

        const contents = this.convertMessagesToGeminiFormat(params.messages);
        const systemInstruction = this.extractSystemInstruction(params.messages);

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: {
                temperature: 0.7,
            },
        };

        if (systemInstruction) {
            requestBody.systemInstruction = systemInstruction;
        }

        if (params.tools && params.tools.length > 0) {
            requestBody.tools = [{
                functionDeclarations: params.tools.map(tool => ({
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters,
                }))
            }];
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: params.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                yield { type: 'error', error: `Gemini API error (${response.status}): ${errorText}` };
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                yield { type: 'error', error: 'No response body' };
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

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

                        if (data.candidates?.[0]?.content?.parts) {
                            for (const part of data.candidates[0].content.parts) {
                                // Handle text content
                                if (part.text) {
                                    yield { type: 'content', content: part.text };
                                }

                                // Handle function calls
                                if (part.functionCall) {
                                    const toolCall: ToolCall = {
                                        id: this.createToolCallId(),
                                        type: "function",
                                        function: {
                                            name: part.functionCall.name,
                                            arguments: JSON.stringify(part.functionCall.args || {}),
                                        },
                                    };

                                    yield { type: 'tool_call', toolCall };

                                    // Execute tool if callback provided
                                    if (params.onToolCall) {
                                        try {
                                            await params.onToolCall(toolCall);
                                        } catch (error) {
                                            console.error('Tool execution error:', error);
                                        }
                                    }
                                }
                            }
                        }

                        // Handle usage information
                        if (data.usageMetadata) {
                            yield {
                                type: 'usage',
                                usage: {
                                    prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                                    completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
                                    total_tokens: data.usageMetadata.totalTokenCount || 0,
                                }
                            };
                        }
                    } catch (parseError) {
                        console.error("Failed to parse Gemini SSE chunk:", parseError);
                    }
                }
            }

            yield { type: 'done' };

        } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
                yield { type: 'cancelled' };
            } else {
                yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
            }
        }
    }

    private extractSystemInstruction(messages: ChatMessage[]): { parts: { text: string }[] } | null {
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage && systemMessage.content) {
            return {
                parts: [{ text: systemMessage.content }]
            };
        }
        return null;
    }

    private convertMessagesToGeminiFormat(messages: ChatMessage[]): Record<string, unknown>[] {
        const contents: Record<string, unknown>[] = [];

        for (const msg of messages) {
            // Skip system messages (handled separately)
            if (msg.role === 'system') continue;

            const parts: Record<string, unknown>[] = [];

            // Add text content
            if (msg.content) {
                parts.push({ text: msg.content });
            }

            // Handle tool calls (assistant calling functions)
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const toolCall of msg.tool_calls) {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: typeof toolCall.function.arguments === 'string'
                                ? JSON.parse(toolCall.function.arguments)
                                : toolCall.function.arguments,
                        }
                    });
                }
            }

            // Handle tool results (function responses)
            if (msg.role === 'tool') {
                // Find the corresponding tool call from previous messages
                const toolCallId = msg.tool_call_id;
                let functionName = 'unknown';

                // Search backwards for the tool call
                for (let i = messages.indexOf(msg) - 1; i >= 0; i--) {
                    const prevMsg = messages[i];
                    if (prevMsg.tool_calls) {
                        const matchingCall = prevMsg.tool_calls.find(tc => tc.id === toolCallId);
                        if (matchingCall) {
                            functionName = matchingCall.function.name;
                            break;
                        }
                    }
                }

                parts.push({
                    functionResponse: {
                        name: functionName,
                        response: {
                            result: msg.content,
                        }
                    }
                });
            }

            // Map roles: user -> user, assistant -> model
            // Tool results must be sent with role 'user' in Gemini API
            let role = msg.role;
            if (role === 'assistant') role = 'model';
            if (role === 'tool') role = 'user';

            if (parts.length > 0) {
                contents.push({
                    role,
                    parts,
                });
            }
        }

        return contents;
    }
}

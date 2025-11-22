import { ChatProvider, ChatChunk, StreamChatParams, ProviderCapabilities, ModelConfig, ProviderConfig, ChatMessage, ToolCall } from './types';

export class LMStudioProvider extends ChatProvider {
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
        try {
            const url = `${this.config.baseURL}/api/v0/models/${encodeURIComponent(model)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`LM Studio API error: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.max_context_length) {
                return data.max_context_length;
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
        const url = `${this.config.baseURL}/v1/chat/completions`;

        // Clean messages and remove duplicates
        const cleanedMessages = this.cleanMessagesForLMStudio(params.messages);

        const requestBody: Record<string, unknown> = {
            model: params.model,
            messages: cleanedMessages,
            stream: true,
            stream_options: {
                include_usage: true,
            },
        };

        if (params.tools && params.tools.length > 0) {
            requestBody.tools = params.tools;

            // Only add tool_choice on initial requests, not continuations
            const hasToolResults = cleanedMessages.some((m: any) => m.role === "tool");
            if (!hasToolResults) {
                requestBody.tool_choice = "auto";
            }
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (this.config.apiKey) {
            headers.Authorization = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: params.signal,
        });

        if (!response.ok) {
            let errorDetails = response.statusText;
            try {
                const errorBody = await response.text();
                if (errorBody) {
                    errorDetails += ` - ${errorBody}`;
                }
            } catch (e) {
                // Ignore error reading body
            }
            yield { type: 'error', error: `LM Studio API error: ${errorDetails}` };
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            yield { type: 'error', error: 'No response body' };
            return;
        }

        const decoder = new TextDecoder();
        let accumulatedToolCalls: Array<{
            id?: string;
            type?: string;
            function?: {
                name?: string;
                arguments?: string;
            };
        }> = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk
                    .split("\n")
                    .filter((line) => line.trim() && line.startsWith("data:"));

                for (const line of lines) {
                    const data = line.replace(/^data: /, "");
                    if (data === "[DONE]") {
                        yield { type: 'done' };
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;

                        if (delta?.content) {
                            yield { type: 'content', content: delta.content };
                        }

                        // Handle tool calls streaming (OpenAI format)
                        if (delta?.tool_calls) {
                            for (const toolCallDelta of delta.tool_calls) {
                                const index = toolCallDelta.index;

                                // Initialize tool call at this index if needed
                                if (!accumulatedToolCalls[index]) {
                                    accumulatedToolCalls[index] = {
                                        id: toolCallDelta.id || this.createToolCallId(),
                                        type: toolCallDelta.type || "function",
                                        function: {
                                            name: "",
                                            arguments: "",
                                        },
                                    };
                                }

                                // Accumulate function name and arguments
                                if (toolCallDelta.function?.name) {
                                    accumulatedToolCalls[index].function!.name = toolCallDelta.function.name;
                                }

                                if (toolCallDelta.function?.arguments) {
                                    accumulatedToolCalls[index].function!.arguments =
                                        (accumulatedToolCalls[index].function!.arguments || "") +
                                        toolCallDelta.function.arguments;
                                }

                                // If we have a complete tool call, yield it and execute
                                const toolCall = accumulatedToolCalls[index];
                                if (toolCall.function?.name && toolCall.function?.arguments) {
                                    try {
                                        // Parse arguments to validate completeness
                                        JSON.parse(toolCall.function.arguments);

                                        const completeToolCall: ToolCall = {
                                            id: toolCall.id!,
                                            type: 'function',
                                            function: {
                                                name: toolCall.function.name,
                                                arguments: toolCall.function.arguments,
                                            },
                                        };

                                        yield { type: 'tool_call', toolCall: completeToolCall };

                                        // Execute tool immediately if callback provided
                                        if (params.onToolCall) {
                                            try {
                                                await params.onToolCall(completeToolCall);
                                            } catch (error) {
                                                console.error('Tool execution error:', error);
                                            }
                                        }

                                        // Mark this tool call as processed
                                        accumulatedToolCalls[index] = { processed: true } as any;
                                    } catch (jsonError) {
                                        // Arguments not complete yet, continue accumulating
                                    }
                                }
                            }
                        }

                        // Handle usage information
                        if (parsed.usage) {
                            yield {
                                type: 'usage',
                                usage: {
                                    prompt_tokens: parsed.usage.prompt_tokens,
                                    completion_tokens: parsed.usage.completion_tokens,
                                    total_tokens: parsed.usage.total_tokens,
                                },
                            };
                        }
                    } catch (parseError) {
                        console.error("Failed to parse SSE chunk:", parseError);
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

    private cleanMessagesForLMStudio(messages: ChatMessage[]): Record<string, unknown>[] {
        // Remove assistant messages with duplicate tool_call_ids
        const seenToolCallIds = new Set<string>();
        const filteredMessages = messages.filter((m) => {
            if (m.role === "assistant" && m.tool_calls && Array.isArray(m.tool_calls)) {
                const toolCallIds = m.tool_calls.map((tc: any) => tc.id);
                const hasDuplicate = toolCallIds.some((id) => seenToolCallIds.has(id));

                if (hasDuplicate) {
                    return false; // Skip duplicate
                }

                toolCallIds.forEach((id) => seenToolCallIds.add(id));
            }
            return true;
        });

        return filteredMessages.map((m) => {
            const msg: Record<string, unknown> = {
                role: m.role,
            };

            // Handle content properly for LM Studio
            if (m.content !== undefined && m.content !== null && m.content !== "") {
                msg.content = m.content;
            } else if (m.role === "assistant" && m.tool_calls) {
                msg.content = null; // Assistant with tool calls can have null content
            } else if (m.role === "tool") {
                msg.content = m.content || ""; // Tool messages must have content
            } else {
                msg.content = m.content || "";
            }

            // Include other fields as needed
            if (m.tool_calls) {
                msg.tool_calls = m.tool_calls;
            }
            if (m.tool_call_id) {
                msg.tool_call_id = m.tool_call_id;
            }

            return msg;
        });
    }
}

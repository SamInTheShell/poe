import { useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolCall } from '../types/chat';
import type { ChatState, ChatAction } from '../context/ChatContext';
import { toolRegistry } from '../tools';
import { ensureSystemPromptFirst } from '../utils/messageUtils';

export const useChatStreaming = (
  state: ChatState,
  dispatch: React.Dispatch<ChatAction>,
  toolExecutionRefs: {
    handleImmediateToolCall: (toolCall: ToolCall) => Promise<void>;
    executedToolCallsRef: React.MutableRefObject<Set<string>>;
    toolCallsInCurrentMessageRef: React.MutableRefObject<ToolCall[]>;
    toolResultsAddedRef: React.MutableRefObject<Set<string>>;
    toolResultMessagesRef: React.MutableRefObject<Map<string, ChatMessage>>;
    addedToolCallIdsRef: React.MutableRefObject<Set<string>>;
  },
  updateContextUsage: (usedTokens?: number) => Promise<void>,
  workingDirectory: string
) => {
  const pendingToolCallsRef = useRef<ToolCall[]>([]);
  const isContinuingAfterToolsRef = useRef<boolean>(false);
  const pendingContinuationRef = useRef<string | null>(null);
  const updateContextUsageRef = useRef(updateContextUsage);
  updateContextUsageRef.current = updateContextUsage;

  // Continue conversation after tool execution
  const continueAfterToolExecution = useCallback(async (streamingMessageIdOverride?: string) => {
    if (!state.currentProvider || !state.currentModel) {
      console.log('No provider or model, cannot continue');
      return;
    }

    const currentStreamingMessageId = streamingMessageIdOverride || state.streamingMessageId;
    if (!currentStreamingMessageId) {
      console.log('No streaming message ID, cannot continue');
      return;
    }

    if (isContinuingAfterToolsRef.current) {
      console.log('Already continuing after tools, skipping...');
      return;
    }

    let toolCallsInMessage = toolExecutionRefs.toolCallsInCurrentMessageRef.current;

    if (toolCallsInMessage.length === 0) {
      const assistantMessage = state.messages.find(m => m.id === currentStreamingMessageId);
      if (assistantMessage && assistantMessage.tool_calls) {
        toolCallsInMessage = assistantMessage.tool_calls;
        console.log('Found tool calls from message state:', toolCallsInMessage.length);
      }
    }

    if (toolCallsInMessage.length === 0) {
      console.log('No tool calls found in ref or message, ending stream normally');
      dispatch({ type: 'END_STREAMING' });
      return;
    }

    const toolCallIds = toolCallsInMessage.map(tc => tc.id);
    const allResultsAdded = toolCallIds.every(id => toolExecutionRefs.toolResultsAddedRef.current.has(id));
    const resultsCountInRef = Array.from(toolExecutionRefs.toolResultsAddedRef.current).filter(id => toolCallIds.includes(id)).length;

    const toolResultsInMessages = state.messages.filter(m =>
      m.role === 'tool' && m.tool_call_id && toolCallIds.includes(m.tool_call_id)
    );

    console.log(`Checking tool results: ref=${resultsCountInRef}/${toolCallIds.length}, messages=${toolResultsInMessages.length}/${toolCallIds.length}, allAdded=${allResultsAdded}`);

    if (allResultsAdded && resultsCountInRef === toolCallIds.length) {
      console.log('All tool results are ready (confirmed by ref), proceeding with continuation');
      setTimeout(() => {
        if (isContinuingAfterToolsRef.current) {
          console.log('Already continuing, skipping...');
          return;
        }
        isContinuingAfterToolsRef.current = true;

        proceedWithContinuation(currentStreamingMessageId, toolCallsInMessage, toolCallIds);
      }, 300);
      return;
    }

    console.log(`Still waiting for tool results (ref=${resultsCountInRef}/${toolCallIds.length}), will retry in 200ms...`);
    setTimeout(() => {
      continueAfterToolExecution();
    }, 200);
    return;

  }, [state.currentProvider, state.currentModel, state.streamingMessageId, state.messages, dispatch, workingDirectory, toolExecutionRefs]);

  // Proceed with continuation after state has updated
  const proceedWithContinuation = useCallback(async (
    currentStreamingMessageId: string,
    toolCallsInMessage: ToolCall[],
    toolCallIds: string[],
  ) => {
    const currentMessages = state.messages;
    let allToolResults = currentMessages.filter(m =>
      m.role === 'tool' && m.tool_call_id && toolCallIds.includes(m.tool_call_id)
    );

    if (allToolResults.length !== toolCallIds.length) {
      console.log(`Tool results in state: ${allToolResults.length}/${toolCallIds.length}, checking ref for missing results...`);

      const missingToolCallIds = toolCallIds.filter(id =>
        !allToolResults.some(tr => tr.tool_call_id === id)
      );

      for (const toolCallId of missingToolCallIds) {
        const toolResultFromRef = toolExecutionRefs.toolResultMessagesRef.current.get(toolCallId);
        if (toolResultFromRef) {
          console.log(`Found tool result in ref for tool call ${toolCallId}, using it`);
          allToolResults.push(toolResultFromRef);
        }
      }

      if (allToolResults.length !== toolCallIds.length) {
        console.warn(`Still missing tool results: have ${allToolResults.length}, need ${toolCallIds.length}`);
      }
    }

    console.log('Continuing conversation after tool execution with', allToolResults.length, 'tool results for', toolCallIds.length, 'tool calls');
    dispatch({ type: 'END_STREAMING' });

    const assistantMessageIndex = currentMessages.findIndex(m => m.id === currentStreamingMessageId);
    const assistantMessageWithTools = assistantMessageIndex >= 0 ? currentMessages[assistantMessageIndex] : null;

    const assistantMessageWithToolCalls: ChatMessage = {
      ...(assistantMessageWithTools || {
        id: currentStreamingMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }),
      tool_calls: toolCallsInMessage,
    };

    const messagesBeforeAssistant = assistantMessageIndex >= 0
      ? currentMessages.slice(0, assistantMessageIndex)
      : currentMessages;

    const conversationHistory = [
      ...messagesBeforeAssistant,
      assistantMessageWithToolCalls,
      ...allToolResults,
    ];

    const hasSystemMessage = conversationHistory.some(m => m.role === 'system');
    const defaultSystemMessage: ChatMessage = {
      id: 'system-prompt',
      role: 'system',
      content: 'You are a helpful AI assistant.',
      timestamp: Date.now(),
    };
    const messagesToSend = ensureSystemPromptFirst(conversationHistory, hasSystemMessage ? null : defaultSystemMessage);

    console.log('Continuing with', messagesToSend.length, 'messages (including tool results)');

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
    dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

    toolExecutionRefs.addedToolCallIdsRef.current.clear();
    pendingToolCallsRef.current = [];
    toolExecutionRefs.executedToolCallsRef.current.clear();
    toolExecutionRefs.toolCallsInCurrentMessageRef.current = [];
    toolExecutionRefs.toolResultsAddedRef.current.clear();
    toolExecutionRefs.toolResultMessagesRef.current.clear();
    pendingContinuationRef.current = null;

    try {
      if (!state.currentProvider || !state.currentModel) {
        console.error('Missing provider or model');
        return;
      }
      const result = await window.electronAPI.chatSendMessage({
        provider: state.currentProvider.id,
        model: state.currentModel.id,
        messages: messagesToSend,
        tools: toolRegistry.getDefinitions(),
      });

      if (result && !result.success && result.error) {
        console.error('Chat API error during continuation:', result.error);
        dispatch({
          type: 'SET_ERROR',
          payload: result.error,
        });
        dispatch({ type: 'END_STREAMING' });
      }
    } catch (error) {
      console.error('Failed to continue conversation after tools:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to continue conversation',
      });
      dispatch({ type: 'END_STREAMING' });
    } finally {
      isContinuingAfterToolsRef.current = false;
    }
  }, [state.currentProvider, state.currentModel, state.messages, dispatch, toolExecutionRefs]);

  // Normalize tool call arguments for duplicate detection
  const normalizeArgs = (args: string | Record<string, unknown>): string => {
    let parsed: Record<string, unknown>;

    if (typeof args === 'string') {
      try {
        parsed = JSON.parse(args);
      } catch {
        return args.trim();
      }
    } else {
      parsed = args;
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const trimmedKey = key.trim();

      if (typeof value === 'string') {
        const trimmed = value.trim();
        normalized[trimmedKey] = trimmed === '' ? '' : trimmed;
      } else if (value !== null && value !== undefined) {
        normalized[trimmedKey] = value;
      } else {
        normalized[trimmedKey] = '';
      }
    }

    const sortedKeys = Object.keys(normalized).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sorted[key] = normalized[key];
    }

    return JSON.stringify(sorted);
  };

  // Setup chat chunk listener
  const setupChatChunkListener = useCallback(() => {
    window.electronAPI.onChatChunk((chunk: unknown) => {
      const typedChunk = chunk as {
        type: string;
        content?: string;
        tool_call?: ToolCall;
        tool_calls?: ToolCall[];
        error?: string;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };
      console.log('Received chat chunk:', typedChunk);

      if (typedChunk.type === 'content') {
        dispatch({ type: 'APPEND_TO_STREAMING', payload: typedChunk.content || '' });
        if (updateContextUsageRef.current) {
          setTimeout(() => {
            updateContextUsageRef.current();
          }, 100);
        }
      } else if (typedChunk.type === 'tool_call') {
        console.log('Handling immediate tool call:', typedChunk.tool_call);

        if (typedChunk.tool_call && state.streamingMessageId) {
          const toolCall = typedChunk.tool_call;

          if (!toolCall.id || !toolCall.function?.name) {
            console.warn('Invalid tool call received:', toolCall);
            return;
          }

          // Check for duplicate tool call
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments;
          const normalizedArgs = normalizeArgs(toolArgs);

          const checkDuplicate = (toolCalls: ToolCall[]): boolean => {
            return toolCalls.some(tc => {
              const existingToolName = tc.function.name;
              const existingToolArgs = tc.function.arguments;
              const normalizedExistingArgs = normalizeArgs(existingToolArgs);

              return existingToolName === toolName && normalizedExistingArgs === normalizedArgs;
            });
          };

          const isDuplicateInState = state.messages.some(m => {
            if (m.role !== 'assistant' || !m.tool_calls) return false;
            return checkDuplicate(m.tool_calls);
          });

          const isDuplicateInCurrentMessage = checkDuplicate(toolExecutionRefs.toolCallsInCurrentMessageRef.current);
          const isDuplicate = isDuplicateInState || isDuplicateInCurrentMessage;

          if (isDuplicate) {
            console.log('Duplicate tool call detected, skipping:', toolName, normalizedArgs);
            return;
          }

          if (!toolExecutionRefs.addedToolCallIdsRef.current.has(toolCall.id)) {
            toolExecutionRefs.addedToolCallIdsRef.current.add(toolCall.id);
            toolExecutionRefs.toolCallsInCurrentMessageRef.current.push(toolCall);
            console.log('Added tool call to ref:', toolCall.function.name, 'Total in ref:', toolExecutionRefs.toolCallsInCurrentMessageRef.current.length);
            dispatch({
              type: 'ADD_TOOL_CALL',
              payload: { messageId: state.streamingMessageId, toolCall },
            });
          }

          toolExecutionRefs.handleImmediateToolCall(toolCall);
        }
      } else if (typedChunk.type === 'tool_calls') {
        console.log('Accumulating tool calls (batch mode)');
        pendingToolCallsRef.current = typedChunk.tool_calls || [];

        for (const toolCall of typedChunk.tool_calls || []) {
          if (!toolExecutionRefs.addedToolCallIdsRef.current.has(toolCall.id)) {
            toolExecutionRefs.addedToolCallIdsRef.current.add(toolCall.id);
            dispatch({
              type: 'ADD_TOOL_CALL',
              payload: { messageId: state.streamingMessageId!, toolCall },
            });
          }
        }
      } else if (typedChunk.type === 'done') {
        console.log('Received done chunk');

        if (pendingToolCallsRef.current.length > 0) {
          console.log('Executing pending tool calls (batch mode):', pendingToolCallsRef.current);
          pendingToolCallsRef.current = [];
          // For batch mode, would need handleToolCalls - keeping simplified for now
          return;
        }

        const toolCallsInMessage = toolExecutionRefs.toolCallsInCurrentMessageRef.current;
        const hasToolCalls = toolCallsInMessage.length > 0;

        console.log('Done chunk received - checking for tool calls:');
        console.log('  - Tool calls in ref:', toolCallsInMessage.length);
        console.log('  - Tool results added:', toolExecutionRefs.toolResultsAddedRef.current.size);

        if (hasToolCalls) {
          console.log('Tool calls found in current message, will continue after tool execution completes');

          const streamingMsgId = state.streamingMessageId;

          const toolCallIds = toolCallsInMessage.map(tc => tc.id);
          const allResultsReady = toolCallIds.every(id => toolExecutionRefs.toolResultsAddedRef.current.has(id));

          if (allResultsReady) {
            console.log('All tool results already ready, proceeding with continuation immediately');
            setTimeout(() => {
              continueAfterToolExecution(streamingMsgId || undefined);
            }, 100);
          } else {
            console.log('Waiting for tool results to complete, storing message ID for continuation');
            if (streamingMsgId) {
              pendingContinuationRef.current = streamingMsgId;
            }
            setTimeout(() => {
              continueAfterToolExecution(streamingMsgId || undefined);
            }, 300);
          }
          return;
        }

        console.log('Ending streaming for message (no tool calls):', state.streamingMessageId);
        dispatch({ type: 'END_STREAMING' });
      } else if (typedChunk.type === 'usage') {
        console.log('Received usage info:', typedChunk.usage);
        if (typedChunk.usage && state.currentProvider && state.currentModel) {
          updateContextUsage(typedChunk.usage.total_tokens);
        }
      } else if (typedChunk.type === 'cancelled') {
        console.log('Stream was cancelled');
        dispatch({ type: 'CANCEL_STREAMING' });
      } else if (typedChunk.type === 'error') {
        console.error('Chat chunk error:', typedChunk.error);
        dispatch({ type: 'SET_ERROR', payload: typedChunk.error || 'Unknown streaming error' });
        dispatch({ type: 'END_STREAMING' });
      }
    });
  }, [toolExecutionRefs, continueAfterToolExecution, dispatch, state.streamingMessageId, state.currentProvider, state.currentModel, state.messages, updateContextUsage]);

  // Setup listener on mount
  useEffect(() => {
    setupChatChunkListener();

    return () => {
      window.electronAPI.removeChatChunkListener();
    };
  }, [setupChatChunkListener]);

  return {
    continueAfterToolExecution,
    isContinuingAfterToolsRef,
  };
};

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ToolCall } from '../types/chat';
import type { ChatState, ChatAction } from '../context/ChatContext';
import { toolRegistry } from '../tools';
import { generatePreviewData } from '../utils/previewDataGenerator';

interface PendingPermission {
  onAllow: () => void;
  onDeny: () => void;
  previewData?: any;
}

export const useToolExecution = (
  state: ChatState,
  dispatch: React.Dispatch<ChatAction>,
  workingDirectory: string,
  handleContinue: () => Promise<void>
) => {
  const [pendingPermissions, setPendingPermissions] = useState<Map<string, PendingPermission>>(new Map());
  const [toolCallStatuses, setToolCallStatuses] = useState<Map<string, 'denied' | 'allowed'>>(new Map());

  // Refs for tracking tool execution state
  const executedToolCallsRef = useRef<Set<string>>(new Set());
  const executingToolCallsRef = useRef<Set<string>>(new Set());
  const toolCallsInCurrentMessageRef = useRef<ToolCall[]>([]);
  const toolResultsAddedRef = useRef<Set<string>>(new Set());
  const toolResultMessagesRef = useRef<Map<string, ChatMessage>>(new Map());
  const addedToolCallIdsRef = useRef<Set<string>>(new Set());
  const restoredPermissionsRef = useRef<Set<string>>(new Set());

  // Clear refs for new message
  const clearToolExecutionRefs = useCallback(() => {
    addedToolCallIdsRef.current.clear();
    executedToolCallsRef.current.clear();
    toolCallsInCurrentMessageRef.current = [];
    toolResultsAddedRef.current.clear();
    toolResultMessagesRef.current.clear();
  }, []);

  // Create permission handlers for a tool call
  const createPermissionHandlers = useCallback((
    toolCall: ToolCall,
    args: any,
    previewData: any,
    allToolCallIds: string[]
  ): PendingPermission => {
    return {
      previewData,
      onAllow: async () => {
        if (executingToolCallsRef.current.has(toolCall.id)) {
          console.log('Tool call already executing, ignoring duplicate allow:', toolCall.id);
          return;
        }

        executingToolCallsRef.current.add(toolCall.id);

        setPendingPermissions(p => {
          const updated = new Map(p);
          updated.delete(toolCall.id);
          return updated;
        });
        setToolCallStatuses(prev => {
          const updated = new Map(prev);
          updated.set(toolCall.id, 'allowed');
          return updated;
        });
        restoredPermissionsRef.current.add(toolCall.id);

        try {
          const toolResult = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);

          const toolResultMessage: ChatMessage = {
            id: `tool-result-${Date.now()}-${Math.random()}`,
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
            timestamp: Date.now(),
          };
          dispatch({ type: 'ADD_MESSAGE', payload: toolResultMessage });

          toolResultsAddedRef.current.add(toolCall.id);
          toolResultMessagesRef.current.set(toolCall.id, toolResultMessage);

          executingToolCallsRef.current.delete(toolCall.id);

          // Check if all tool calls have results
          const resultsInRef = allToolCallIds.filter(id =>
            toolResultsAddedRef.current.has(id)
          ).length;

          if (resultsInRef === allToolCallIds.length) {
            console.log('All tool calls have results, continuing conversation...');
            setTimeout(() => {
              handleContinue();
            }, 300);
          } else {
            console.log(`Waiting for more tool results: ${resultsInRef}/${allToolCallIds.length}`);
          }
        } catch (error) {
          executingToolCallsRef.current.delete(toolCall.id);
          console.error('Tool execution failed:', error);
          const errorMessage: ChatMessage = {
            id: `tool-error-${Date.now()}-${Math.random()}`,
            role: 'tool',
            content: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error'
            }),
            tool_call_id: toolCall.id,
            timestamp: Date.now(),
          };
          dispatch({ type: 'ADD_MESSAGE', payload: errorMessage });

          toolResultsAddedRef.current.add(toolCall.id);
          toolResultMessagesRef.current.set(toolCall.id, errorMessage);

          const resultsInRef = allToolCallIds.filter(id =>
            toolResultsAddedRef.current.has(id)
          ).length;

          if (resultsInRef === allToolCallIds.length) {
            console.log('All tool calls have results (including errors), continuing conversation...');
            setTimeout(() => {
              handleContinue();
            }, 300);
          }
        }
      },
      onDeny: () => {
        setToolCallStatuses(prev => {
          const updated = new Map(prev);
          updated.set(toolCall.id, 'denied');
          return updated;
        });
        setPendingPermissions(p => {
          const updated = new Map(p);
          updated.delete(toolCall.id);
          return updated;
        });
        restoredPermissionsRef.current.add(toolCall.id);

        const deniedMessage: ChatMessage = {
          id: `tool-denied-${Date.now()}-${Math.random()}`,
          role: 'tool',
          content: JSON.stringify({
            error: 'Permission denied by user'
          }),
          tool_call_id: toolCall.id,
          timestamp: Date.now(),
        };
        dispatch({ type: 'ADD_MESSAGE', payload: deniedMessage });
      },
    };
  }, [workingDirectory, dispatch, handleContinue]);

  // Handle immediate tool call execution
  const handleImmediateToolCall = useCallback(async (toolCall: ToolCall) => {
    if (!state.streamingMessageId || !workingDirectory) return;

    if (executedToolCallsRef.current.has(toolCall.id)) {
      console.log('Tool call already executed:', toolCall.id);
      return;
    }

    console.log('Executing immediate tool call:', toolCall.function.name);
    executedToolCallsRef.current.add(toolCall.id);

    try {
      const args = typeof toolCall.function.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;

      // Generate preview data
      const previewData = await generatePreviewData(toolCall.function.name, args, workingDirectory);

      // Handle permissions
      let result;
      if (toolRegistry.requiresPermission(toolCall.function.name)) {
        result = await new Promise((resolve, reject) => {
          setPendingPermissions(prev => {
            const next = new Map(prev);
            next.set(toolCall.id, {
              previewData,
              onAllow: async () => {
                if (executingToolCallsRef.current.has(toolCall.id)) {
                  console.log('Tool call already executing, ignoring duplicate allow:', toolCall.id);
                  return;
                }

                executingToolCallsRef.current.add(toolCall.id);

                setPendingPermissions(p => {
                  const updated = new Map(p);
                  updated.delete(toolCall.id);
                  return updated;
                });
                setToolCallStatuses(prev => {
                  const updated = new Map(prev);
                  updated.set(toolCall.id, 'allowed');
                  return updated;
                });

                try {
                  const toolResult = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);
                  resolve(toolResult);
                } catch (error) {
                  reject(error);
                } finally {
                  executingToolCallsRef.current.delete(toolCall.id);
                }
              },
              onDeny: () => {
                setToolCallStatuses(prev => {
                  const updated = new Map(prev);
                  updated.set(toolCall.id, 'denied');
                  return updated;
                });
                setPendingPermissions(p => {
                  const updated = new Map(p);
                  updated.delete(toolCall.id);
                  return updated;
                });
                reject(new Error('Permission denied by user'));
              },
            });
            return next;
          });
        });
      } else {
        result = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);
      }

      console.log('Immediate tool result:', result);

      const toolResultMessage: ChatMessage = {
        id: `tool-result-${Date.now()}-${Math.random()}`,
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
        timestamp: Date.now(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: toolResultMessage });
      toolResultsAddedRef.current.add(toolCall.id);
      toolResultMessagesRef.current.set(toolCall.id, toolResultMessage);

    } catch (error) {
      console.error('Immediate tool execution failed:', error);
      const errorMessage: ChatMessage = {
        id: `tool-error-${Date.now()}-${Math.random()}`,
        role: 'tool',
        content: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        tool_call_id: toolCall.id,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: errorMessage });
      toolResultsAddedRef.current.add(toolCall.id);
      toolResultMessagesRef.current.set(toolCall.id, errorMessage);
      executedToolCallsRef.current.add(toolCall.id);
    }
  }, [state.streamingMessageId, state.messages, workingDirectory, dispatch]);

  // Restore pending permissions effect
  useEffect(() => {
    if (!workingDirectory || state.messages.length === 0) return;

    const restorePendingPermissions = async () => {
      const toolCallsToRestore: Array<{ toolCall: ToolCall; previewData?: any }> = [];

      for (const message of state.messages) {
        if (message.role !== 'assistant' || !message.tool_calls) continue;

        for (const toolCall of message.tool_calls) {
          if (!toolRegistry.requiresPermission(toolCall.function.name)) continue;

          const hasResult = state.messages.some(
            m => m.role === 'tool' && m.tool_call_id === toolCall.id
          );

          if (restoredPermissionsRef.current.has(toolCall.id)) continue;
          if (pendingPermissions.has(toolCall.id)) continue;

          if (!hasResult) {
            toolCallsToRestore.push({ toolCall });
          }
        }
      }

      const newPendingPermissions = new Map(pendingPermissions);
      for (const { toolCall } of toolCallsToRestore) {
        try {
          const args = JSON.parse(toolCall.function.arguments);

          const messageWithToolCall = state.messages.find(m =>
            m.tool_calls?.some(tc => tc.id === toolCall.id)
          );
          const allToolCallIds = messageWithToolCall?.tool_calls?.map(tc => tc.id) || [toolCall.id];

          const previewData = await generatePreviewData(toolCall.function.name, args, workingDirectory);

          newPendingPermissions.set(
            toolCall.id,
            createPermissionHandlers(toolCall, args, previewData, allToolCallIds)
          );

          restoredPermissionsRef.current.add(toolCall.id);
        } catch (error) {
          console.error('Failed to restore pending permission for tool call:', toolCall.id, error);
        }
      }

      if (toolCallsToRestore.length > 0) {
        setPendingPermissions(newPendingPermissions);
      }
    };

    restorePendingPermissions();
  }, [state.messages, workingDirectory, dispatch, pendingPermissions, createPermissionHandlers]);

  return {
    pendingPermissions,
    toolCallStatuses,
    handleImmediateToolCall,
    clearToolExecutionRefs,
    // Export refs for use in streaming
    executedToolCallsRef,
    toolCallsInCurrentMessageRef,
    toolResultsAddedRef,
    toolResultMessagesRef,
    addedToolCallIdsRef,
  };
};

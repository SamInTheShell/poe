import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage } from '../types/chat';
import type { ChatState, ChatAction } from '../context/ChatContext';
import { estimateTokenUsage } from '../utils/messageUtils';

interface ContextManagementResult {
  messagesToSend: ChatMessage[];
  shouldHalt: boolean;
}

export const useContextManagement = (
  state: ChatState,
  dispatch: React.Dispatch<ChatAction>,
  workingDirectory: string
) => {
  const [contextMode, setContextMode] = useState<'rolling' | 'halt'>('rolling');
  const [virtualContextSize, setVirtualContextSize] = useState<number | null>(null);

  // Load context mode when working directory changes
  useEffect(() => {
    if (workingDirectory) {
      loadContextMode();
    } else {
      setContextMode('rolling');
    }
  }, [workingDirectory]);

  const loadContextMode = async () => {
    if (!workingDirectory) return;

    try {
      const result = await window.electronAPI.projectContextModeRead(workingDirectory);
      if (result.success) {
        setContextMode(result.mode === 'halt' ? 'halt' : 'rolling');
      }
    } catch (error) {
      console.error('Failed to load context mode:', error);
      setContextMode('rolling');
    }
  };

  // Apply context management: truncate messages based on context mode and usage
  const applyContextManagement = useCallback((
    messages: ChatMessage[],
    systemPrompt: ChatMessage | null,
    contextTotal: number
  ): ContextManagementResult => {
    // Validate contextTotal - it should be a reasonable value (at least 1000 tokens)
    if (!contextTotal || contextTotal < 1000 || messages.length === 0) {
      if (contextTotal && contextTotal < 1000) {
        console.warn('[Context Management] Invalid contextTotal detected:', contextTotal, '- skipping context management');
      }
      return { messagesToSend: messages, shouldHalt: false };
    }

    // Separate system messages from conversation messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Calculate current usage including system prompt
    const allMessagesForCalculation = systemPrompt
      ? [systemPrompt, ...systemMessages, ...conversationMessages]
      : [...systemMessages, ...conversationMessages];
    const estimatedUsage = estimateTokenUsage(allMessagesForCalculation);
    const usagePercent = (estimatedUsage / contextTotal) * 100;

    console.log('[Context Management]', {
      mode: contextMode,
      contextTotal,
      estimatedUsage,
      usagePercent: usagePercent.toFixed(2) + '%',
      conversationMessageCount: conversationMessages.length,
      allMessageCount: allMessagesForCalculation.length,
    });

    // For Halt mode: if at or over 100%, halt the conversation
    if (contextMode === 'halt' && contextTotal > 100 && usagePercent >= 100) {
      console.log('[Context Management] HALT: Usage at 100%', {
        usagePercent: usagePercent.toFixed(2) + '%',
        estimatedUsage,
        contextTotal,
      });
      return { messagesToSend: [], shouldHalt: true };
    }

    // For Rolling Window mode: if at or over 95%, exclude 30% of oldest conversation messages
    if (contextMode === 'rolling' && usagePercent >= 95) {
      console.log('[Context Management] ROLLING: Truncating at', usagePercent.toFixed(2) + '%');

      let currentMessages = [...conversationMessages];
      let currentUsage = estimatedUsage;
      let currentPercent = usagePercent;
      let totalExcluded = 0;

      let previousMessageCount = currentMessages.length;
      let previousPercent = currentPercent;
      let iterationCount = 0;
      const maxIterations = 10;

      while (currentPercent >= 95 && currentMessages.length > 1 && iterationCount < maxIterations) {
        iterationCount++;

        if (currentMessages.length === 0) {
          break;
        }

        // Calculate how many messages to exclude (30% of current remaining messages)
        const messagesToExclude = Math.ceil(currentMessages.length * 0.3);

        if (messagesToExclude >= currentMessages.length) {
          // Keep at least the last user-assistant pair
          let lastUserIndex = -1;
          for (let i = currentMessages.length - 1; i >= 0; i--) {
            if (currentMessages[i].role === 'user') {
              lastUserIndex = i;
              break;
            }
          }
          if (lastUserIndex >= 0) {
            currentMessages = currentMessages.slice(lastUserIndex);
          } else {
            currentMessages = currentMessages.slice(-1);
          }
          break;
        }

        // Exclude oldest messages, preserving message pairs
        const exclusionPoint = messagesToExclude;
        let safeExclusionPoint = exclusionPoint;

        // Find the last user message before or at the exclusion point
        let lastUserBeforeExclusion = -1;
        for (let i = Math.min(exclusionPoint, currentMessages.length - 1); i >= 0; i--) {
          if (currentMessages[i].role === 'user') {
            lastUserBeforeExclusion = i;
            break;
          }
        }

        if (lastUserBeforeExclusion >= 0) {
          safeExclusionPoint = lastUserBeforeExclusion;
        }

        if (safeExclusionPoint === 0) {
          console.warn('[Context Management] Cannot truncate further - safe exclusion point is 0');
          break;
        }

        currentMessages = currentMessages.slice(safeExclusionPoint);
        totalExcluded += safeExclusionPoint;

        // Recalculate usage
        const remainingForCalculation = systemPrompt
          ? [systemPrompt, ...systemMessages, ...currentMessages]
          : [...systemMessages, ...currentMessages];
        currentUsage = estimateTokenUsage(remainingForCalculation);
        currentPercent = (currentUsage / contextTotal) * 100;

        console.log('[Context Management] After truncation iteration:', {
          remainingCount: currentMessages.length,
          usage: currentUsage,
          percent: currentPercent.toFixed(2) + '%',
          firstMessageRole: currentMessages[0]?.role,
        });

        if (currentMessages.length === previousMessageCount && currentPercent >= previousPercent) {
          console.warn('[Context Management] No progress made in truncation - breaking loop');
          break;
        }

        previousMessageCount = currentMessages.length;
        previousPercent = currentPercent;
      }

      if (iterationCount >= maxIterations) {
        console.warn('[Context Management] Reached maximum iterations - breaking loop');
      }

      console.log('[Context Management] Final truncation result:', {
        originalCount: conversationMessages.length,
        totalExcluded,
        remaining: currentMessages.length,
        finalUsage: currentUsage,
        finalPercent: currentPercent.toFixed(2) + '%',
        firstMessageRole: currentMessages[0]?.role,
      });

      // Build messagesToSend with system prompt FIRST
      const messagesToSend = systemPrompt
        ? [systemPrompt, ...currentMessages]
        : [...systemMessages, ...currentMessages];

      return {
        messagesToSend,
        shouldHalt: false,
      };
    }

    // No truncation needed
    const messagesToSend = systemPrompt
      ? [systemPrompt, ...conversationMessages]
      : [...systemMessages, ...conversationMessages];

    return {
      messagesToSend,
      shouldHalt: false,
    };
  }, [contextMode]);

  // Function to update context usage
  const updateContextUsage = useCallback(async (usedTokens?: number) => {
    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'UPDATE_CONTEXT_USAGE', payload: null });
      return;
    }

    try {
      let totalTokens: number | null = virtualContextSize || null;

      if (!totalTokens) {
        const result = await window.electronAPI.chatGetContextLength({
          provider: state.currentProvider.id,
          model: state.currentModel.id,
        });

        if (result.success && result.contextLength) {
          totalTokens = result.contextLength;
        } else {
          totalTokens = state.currentModel.contextLength || null;
        }
      }

      if (totalTokens) {
        let messagesForUsage: ChatMessage[] = [];

        if (totalTokens && state.messages.length > 0) {
          const contextResult = applyContextManagement(
            state.messages,
            null,
            totalTokens
          );
          messagesForUsage = contextResult.messagesToSend;
        } else {
          messagesForUsage = state.messages;
        }

        const used = usedTokens || estimateTokenUsage(messagesForUsage);

        dispatch({
          type: 'UPDATE_CONTEXT_USAGE',
          payload: {
            used,
            total: totalTokens,
          },
        });
      } else {
        dispatch({ type: 'UPDATE_CONTEXT_USAGE', payload: null });
      }
    } catch (error) {
      console.error('Failed to update context usage:', error);
      const totalTokens = virtualContextSize || state.currentModel.contextLength || null;
      if (totalTokens) {
        let messagesForUsage: ChatMessage[] = [];
        if (totalTokens && state.messages.length > 0) {
          const contextResult = applyContextManagement(
            state.messages,
            null,
            totalTokens
          );
          messagesForUsage = contextResult.messagesToSend;
        } else {
          messagesForUsage = state.messages;
        }
        const used = usedTokens || estimateTokenUsage(messagesForUsage);
        dispatch({
          type: 'UPDATE_CONTEXT_USAGE',
          payload: {
            used,
            total: totalTokens,
          },
        });
      } else {
        dispatch({ type: 'UPDATE_CONTEXT_USAGE', payload: null });
      }
    }
  }, [state.currentProvider, state.currentModel, state.messages, virtualContextSize, dispatch, applyContextManagement]);

  return {
    contextMode,
    virtualContextSize,
    setVirtualContextSize,
    applyContextManagement,
    updateContextUsage,
  };
};

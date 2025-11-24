import { useCallback } from 'react';
import type { ChatMessage } from '../types/chat';
import type { ChatState, ChatAction } from '../context/ChatContext';

export const useMessageActions = (
  state: ChatState,
  dispatch: React.Dispatch<ChatAction>,
  handleSendMessage: (messageText: string, systemPrompt?: string) => Promise<void>,
  handleContinue: () => Promise<void>
) => {
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    if (state.isLoading) return;

    const message = state.messages.find(m => m.id === messageId);
    if (!message) return;

    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, updates: { content: newContent } } });
  }, [state.isLoading, state.messages, dispatch]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    if (state.isLoading) return;

    const messageToDelete = state.messages.find(m => m.id === messageId);

    if (messageToDelete && messageToDelete.role === 'assistant' && messageToDelete.tool_calls && messageToDelete.tool_calls.length > 0) {
      const toolCallIds = messageToDelete.tool_calls.map(tc => tc.id).filter(Boolean);
      const toolResultMessages = state.messages.filter(m =>
        m.role === 'tool' &&
        m.tool_call_id &&
        toolCallIds.includes(m.tool_call_id)
      );

      toolResultMessages.forEach(toolResult => {
        dispatch({ type: 'DELETE_MESSAGE', payload: toolResult.id });
      });
    }

    dispatch({ type: 'DELETE_MESSAGE', payload: messageId });
  }, [state.isLoading, state.messages, dispatch]);

  const handleFork = useCallback(async (messageId: string, workingDirectory: string, loadSession: (sessionId: string) => Promise<void>) => {
    if (state.isLoading || !workingDirectory) return;

    const messageIndex = state.messages.findIndex(m => m.id === messageId);
    if (messageIndex < 0) return;

    const baseMessages = state.messages.slice(0, messageIndex + 1);

    const lastMessage = baseMessages[baseMessages.length - 1];
    const toolResultMessages: ChatMessage[] = [];

    if (lastMessage?.role === 'assistant' && lastMessage.tool_calls) {
      const toolCallIds = lastMessage.tool_calls.map(tc => tc.id).filter(Boolean);

      for (let i = messageIndex + 1; i < state.messages.length; i++) {
        const msg = state.messages[i];
        if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.includes(msg.tool_call_id)) {
          toolResultMessages.push(msg);
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          break;
        }
      }
    }

    const messagesToFork = [...baseMessages, ...toolResultMessages];

    const newSessionId = crypto.randomUUID();

    try {
      const displayName = `Fork from ${state.currentSessionName || 'session'}`;
      await window.electronAPI.sessionSave(
        workingDirectory,
        newSessionId,
        messagesToFork,
        displayName,
        true,
        state.currentProvider?.id,
        state.currentModel?.id
      );

      await loadSession(newSessionId);
    } catch (error) {
      console.error('Failed to fork conversation:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to fork conversation',
      });
    }
  }, [state.isLoading, state.messages, state.currentSessionName, state.currentProvider, state.currentModel, dispatch]);

  const handleRegenerate = useCallback(async () => {
    if (state.isLoading) return;

    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select a provider and model' });
      return;
    }

    const lastAssistantIndex = state.messages.length - 1;
    const lastMessage = state.messages[lastAssistantIndex];

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return;
    }

    let hasToolCallsBefore = false;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        hasToolCallsBefore = true;
        break;
      }
      if (msg.role === 'user') {
        break;
      }
    }

    if ((lastMessage.tool_calls && lastMessage.tool_calls.length > 0) || hasToolCallsBefore) {
      dispatch({ type: 'DELETE_MESSAGE', payload: lastMessage.id });

      setTimeout(() => {
        handleContinue();
      }, 100);
      return;
    }

    let lastUserIndex = -1;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex < 0) {
      return;
    }

    const userMessageContent = state.messages[lastUserIndex].content;

    const messagesToDelete = state.messages.slice(lastUserIndex);
    for (const msgToDelete of messagesToDelete) {
      dispatch({ type: 'DELETE_MESSAGE', payload: msgToDelete.id });
    }

    setTimeout(() => {
      handleSendMessage(userMessageContent);
    }, 100);
  }, [state.messages, state.isLoading, state.currentProvider, state.currentModel, dispatch, handleSendMessage, handleContinue]);

  return {
    handleEditMessage,
    handleDeleteMessage,
    handleFork,
    handleRegenerate,
  };
};

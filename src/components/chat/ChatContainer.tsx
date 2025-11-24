import { Box } from '@mui/material';
import { useEffect, useCallback, useState, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { ToolsPanel } from './ToolsPanel';
import { ChatHeader } from './ChatHeader';
import { SessionMenu } from './SessionMenu';
import { ErrorDisplay } from './ErrorDisplay';
import type { ChatMessage, ProvidersData } from '../../types/chat';
import { toolRegistry } from '../../tools';
import { mcpToolsManager } from '../../tools/MCPToolsManager';
import { toolConfigManager } from '../../tools/ToolConfigManager';
import { useContextManagement } from '../../hooks/useContextManagement';
import { useSessionManagement } from '../../hooks/useSessionManagement';
import { useToolExecution } from '../../hooks/useToolExecution';
import { useMessageActions } from '../../hooks/useMessageActions';
import { useChatStreaming } from '../../hooks/useChatStreaming';
import yaml from 'js-yaml';

interface ChatContainerProps {
  workingDirectory: string;
  onOpenSettings: (tab?: string | number) => void;
  focusTrigger?: number;
}

export function ChatContainer({ workingDirectory, onOpenSettings, focusTrigger }: ChatContainerProps) {
  const { state, dispatch, loadSession, createNewSession, updateSessionName } = useChat();
  const [homeDir, setHomeDir] = useState<string>('');
  const [toolsPanelCollapsed, setToolsPanelCollapsed] = useState(true);
  const [hasStartingServers, setHasStartingServers] = useState(false);

  // Track previous values to avoid unnecessary context updates
  const prevProviderIdRef = useRef<string | undefined>(undefined);
  const prevModelIdRef = useRef<string | undefined>(undefined);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevVirtualContextSizeRef = useRef<number | null>(null);
  const prevContextModeRef = useRef<'rolling' | 'halt'>('rolling');
  const prevMessagesContentLengthRef = useRef<number>(0);

  const loadHomeDir = async () => {
    const home = await window.electronAPI.getHomeDir();
    setHomeDir(home);
  };

  const loadProviders = async () => {
    const result = await window.electronAPI.configRead('providers.json');
    if (result.success && result.content) {
      const data: ProvidersData = yaml.load(result.content) as ProvidersData;
      dispatch({ type: 'LOAD_PROVIDERS', payload: data.providers });
    }
  };

  // Context management hook
  const {
    contextMode,
    virtualContextSize,
    setVirtualContextSize,
    applyContextManagement,
    updateContextUsage,
  } = useContextManagement(state, dispatch, workingDirectory);

  // handleContinue needs to be defined before hooks that use it
  const handleContinue = useCallback(async () => {
    if (state.isLoading) return;

    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select a provider and model' });
      return;
    }

    if (state.messages.length === 0) {
      return;
    }

    const currentMessages = [...state.messages];

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
    dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

    toolExecution.clearToolExecutionRefs();

    const messagesToSend = currentMessages;

    let contextTotal = virtualContextSize || null;
    if (!contextTotal) {
      contextTotal = state.currentModel.contextLength || null;
      if (!contextTotal) {
        try {
          const contextResult = await window.electronAPI.chatGetContextLength({
            provider: state.currentProvider.id,
            model: state.currentModel.id,
          });
          if (contextResult.success && contextResult.contextLength) {
            contextTotal = contextResult.contextLength;
          }
        } catch (error) {
          console.error('Failed to get context length:', error);
        }
      }
    }

    let finalMessagesToSend: ChatMessage[];
    if (contextTotal) {
      const contextResult = applyContextManagement(
        messagesToSend,
        null,
        contextTotal
      );

      if (contextResult.shouldHalt) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Conversation halted: context usage has reached 100%. Please start a new session or clear messages.',
        });
        dispatch({ type: 'END_STREAMING' });
        return;
      }

      finalMessagesToSend = contextResult.messagesToSend;
    } else {
      finalMessagesToSend = messagesToSend;
    }

    console.log('[handleContinue] Sending continuation with messages:', {
      messageCount: finalMessagesToSend.length,
      messageRoles: finalMessagesToSend.map(m => m.role).join(', '),
      lastMessageRole: finalMessagesToSend[finalMessagesToSend.length - 1]?.role,
    });

    try {
      const result = await window.electronAPI.chatSendMessage({
        provider: state.currentProvider.id,
        model: state.currentModel.id,
        messages: finalMessagesToSend,
        tools: toolRegistry.getDefinitions(),
      });

      if (result && !result.success && result.error) {
        console.error('Chat API error:', result.error);
        dispatch({
          type: 'SET_ERROR',
          payload: result.error,
        });
        dispatch({ type: 'END_STREAMING' });
      }
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to continue conversation',
      });
      dispatch({ type: 'END_STREAMING' });
    }
  }, [state.isLoading, state.currentProvider, state.currentModel, state.messages, virtualContextSize, applyContextManagement, dispatch]);

  // Tool execution hook
  const toolExecution = useToolExecution(state, dispatch, workingDirectory, handleContinue);

  // Chat streaming hook (sets up listeners automatically)
  useChatStreaming(
    state,
    dispatch,
    {
      handleImmediateToolCall: toolExecution.handleImmediateToolCall,
      executedToolCallsRef: toolExecution.executedToolCallsRef,
      toolCallsInCurrentMessageRef: toolExecution.toolCallsInCurrentMessageRef,
      toolResultsAddedRef: toolExecution.toolResultsAddedRef,
      toolResultMessagesRef: toolExecution.toolResultMessagesRef,
      addedToolCallIdsRef: toolExecution.addedToolCallIdsRef,
    },
    updateContextUsage,
    workingDirectory
  );

  const handleSendMessage = useCallback(async (messageText: string, systemPrompt?: string) => {
    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select a provider and model' });
      return;
    }

    console.log('[handleSendMessage] START:', {
      virtualContextSize,
      contextMode,
      messageCount: state.messages.length,
      provider: state.currentProvider.id,
      model: state.currentModel.id,
    });

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
    dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

    toolExecution.clearToolExecutionRefs();

    const messagesWithUser = [...state.messages, userMessage];

    const systemPromptMessage = systemPrompt ? {
      id: `system-${Date.now()}`,
      role: 'system' as const,
      content: systemPrompt,
      timestamp: Date.now(),
    } : null;

    let contextTotal = virtualContextSize || null;
    if (virtualContextSize) {
      console.log('[handleSendMessage] Using virtual context size:', virtualContextSize);
    }
    if (!contextTotal) {
      contextTotal = state.currentModel.contextLength || null;
      if (!contextTotal) {
        try {
          const contextResult = await window.electronAPI.chatGetContextLength({
            provider: state.currentProvider.id,
            model: state.currentModel.id,
          });
          if (contextResult.success && contextResult.contextLength) {
            contextTotal = contextResult.contextLength;
          }
        } catch (error) {
          console.error('Failed to get context length:', error);
        }
      }
    }

    console.log('[handleSendMessage] Context total:', contextTotal, 'Messages count:', messagesWithUser.length);

    let messagesToSend: ChatMessage[];

    if (contextTotal) {
      const contextResult = applyContextManagement(
        messagesWithUser,
        systemPromptMessage,
        contextTotal
      );

      console.log('[handleSendMessage] After context management:', {
        originalCount: messagesWithUser.length,
        truncatedCount: contextResult.messagesToSend.length,
        shouldHalt: contextResult.shouldHalt,
        contextMode,
        contextTotal,
      });

      if (contextResult.shouldHalt) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Conversation halted: context usage has reached 100%. Please start a new session or clear messages.',
        });
        dispatch({ type: 'END_STREAMING' });
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            id: userMessage.id,
            updates: { content: 'Message not sent: context limit reached.' }
          }
        });
        return;
      }

      messagesToSend = contextResult.messagesToSend;
    } else {
      console.warn('[handleSendMessage] No contextTotal available, skipping context management');
      messagesToSend = systemPromptMessage
        ? [systemPromptMessage, ...messagesWithUser]
        : messagesWithUser;
    }

    console.log('[handleSendMessage] Sending to API:', {
      messageCount: messagesToSend.length,
      firstMessageRole: messagesToSend[0]?.role,
      lastMessageRole: messagesToSend[messagesToSend.length - 1]?.role,
      contextMode,
    });

    try {
      const result = await window.electronAPI.chatSendMessage({
        provider: state.currentProvider.id,
        model: state.currentModel.id,
        messages: messagesToSend,
        tools: toolRegistry.getDefinitions(),
      });

      if (result && !result.success && result.error) {
        console.error('Chat API error:', result.error);
        dispatch({
          type: 'SET_ERROR',
          payload: result.error,
        });
        dispatch({ type: 'END_STREAMING' });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to send message',
      });
      dispatch({ type: 'END_STREAMING' });
    }
  }, [state.currentProvider, state.currentModel, state.messages, contextMode, virtualContextSize, dispatch, applyContextManagement, toolExecution]);

  // Message actions hook
  const messageActions = useMessageActions(state, dispatch, handleSendMessage, handleContinue);

  // Session management hook
  const sessionManagement = useSessionManagement(
    state,
    workingDirectory,
    loadSession,
    createNewSession
  );

  const handleCancelMessage = useCallback(async () => {
    console.log('Cancelling message');
    try {
      await window.electronAPI.chatCancel();
    } catch (error) {
      console.error('Failed to cancel message:', error);
    }
  }, []);

  const exportChatState = useCallback(() => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      messages: state.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        thinking: m.thinking,
      })),
      currentProvider: state.currentProvider?.name,
      currentModel: state.currentModel?.name,
      isLoading: state.isLoading,
      error: state.error,
      streamingMessageId: state.streamingMessageId,
    };

    const formatted = yaml.dump(debugInfo, { indent: 2, lineWidth: -1 });

    navigator.clipboard.writeText(formatted).then(() => {
      console.log('Chat state copied to clipboard!');
      alert('Chat state copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      console.log('=== CHAT STATE DEBUG ===');
      console.log(formatted);
      console.log('=== END CHAT STATE ===');
      alert('Failed to copy. Check console for debug info.');
    });
  }, [state]);

  // Load providers and home directory on mount, and initialize MCP
  useEffect(() => {
    loadProviders();
    loadHomeDir();

    toolConfigManager.loadConfigs();

    if (workingDirectory) {
      mcpToolsManager.initialize(workingDirectory).catch(error => {
        console.error('Failed to initialize MCP tools:', error);
      });
    }
  }, [workingDirectory]);

  // Global keyboard shortcuts
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;

    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      if (modifierKey && e.key === 'c' && !state.isLoading) {
        const selection = window.getSelection();
        const hasSelection = selection && selection.toString().length > 0;
        if (!hasSelection) {
          e.preventDefault();
          handleContinue();
        }
      }

      if (modifierKey && e.key === 'r' && !state.isLoading) {
        e.preventDefault();
        e.stopPropagation();
        messageActions.handleRegenerate();
      }

      if (modifierKey && e.key === ',') {
        e.preventDefault();
        onOpenSettings();
      }

      if (modifierKey && e.key === 't' && !state.isLoading) {
        e.preventDefault();
        e.stopPropagation();
        sessionManagement.handleNewSession();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [state.isLoading, handleContinue, messageActions, onOpenSettings, sessionManagement]);

  // Update context usage when relevant state changes
  useEffect(() => {
    const messagesContentLength = state.messages.reduce((sum, msg) => {
      return sum + (msg.content?.length || 0) + (msg.tool_calls?.length || 0) * 100;
    }, 0);

    const providerChanged = state.currentProvider?.id !== prevProviderIdRef.current;
    const modelChanged = state.currentModel?.id !== prevModelIdRef.current;
    const messagesLengthChanged = state.messages.length !== prevMessagesLengthRef.current;
    const messagesContentChanged = messagesContentLength !== prevMessagesContentLengthRef.current;
    const virtualContextChanged = virtualContextSize !== prevVirtualContextSizeRef.current;
    const contextModeChanged = contextMode !== prevContextModeRef.current;

    if (providerChanged || modelChanged || messagesLengthChanged || messagesContentChanged || virtualContextChanged || contextModeChanged) {
      prevProviderIdRef.current = state.currentProvider?.id;
      prevModelIdRef.current = state.currentModel?.id;
      prevMessagesLengthRef.current = state.messages.length;
      prevMessagesContentLengthRef.current = messagesContentLength;
      prevVirtualContextSizeRef.current = virtualContextSize;
      prevContextModeRef.current = contextMode;
      updateContextUsage();
    }
  }, [state.currentProvider?.id, state.currentModel?.id, state.messages, virtualContextSize, contextMode, updateContextUsage]);

  // Collapse home directory to ~/ for display
  const displayPath = homeDir && workingDirectory.startsWith(homeDir)
    ? workingDirectory.replace(homeDir, '~')
    : workingDirectory;

  return (
    <Box sx={{
      display: 'flex',
      height: '100%',
      width: '100%',
      backgroundColor: '#1e1e2e',
      overflow: 'hidden',
    }}>
      {/* Main chat area */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        minWidth: 0,
        height: '100%',
        position: 'relative',
      }}>
        <ChatHeader
          displayPath={displayPath}
          currentSessionName={state.currentSessionName}
          isLoading={state.isLoading}
          hasStartingServers={hasStartingServers}
          onSessionNameChange={updateSessionName}
          onNewSession={sessionManagement.handleNewSession}
          onOpenSessionMenu={sessionManagement.handleOpenSessionMenu}
          onExportChatState={exportChatState}
          onOpenSettings={() => onOpenSettings()}
          onToggleToolsPanel={() => setToolsPanelCollapsed(!toolsPanelCollapsed)}
        />

        <SessionMenu
          anchorEl={sessionManagement.sessionMenuAnchor}
          sessions={sessionManagement.sessions}
          currentSessionId={state.currentSessionId}
          deleteConfirmOpen={sessionManagement.deleteConfirmOpen}
          clearAllConfirmOpen={sessionManagement.clearAllConfirmOpen}
          onClose={sessionManagement.handleCloseSessionMenu}
          onLoadSession={sessionManagement.handleLoadSession}
          onDeleteClick={sessionManagement.handleDeleteSessionClick}
          onDeleteConfirm={sessionManagement.handleDeleteSessionConfirm}
          onDeleteCancel={sessionManagement.handleDeleteSessionCancel}
          onClearAllClick={sessionManagement.handleClearAllSessionsClick}
          onClearAllConfirm={sessionManagement.handleClearAllSessionsConfirm}
          onClearAllCancel={sessionManagement.handleClearAllSessionsCancel}
        />

        <ErrorDisplay
          error={state.error}
          onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
        />

        <MessageList
          messages={state.messages}
          isLoading={state.isLoading}
          pendingPermissions={toolExecution.pendingPermissions}
          toolCallStatuses={toolExecution.toolCallStatuses}
          onEditMessage={messageActions.handleEditMessage}
          onDeleteMessage={messageActions.handleDeleteMessage}
          onRegenerate={messageActions.handleRegenerate}
          onContinue={handleContinue}
          onFork={(messageId) => messageActions.handleFork(messageId, workingDirectory, loadSession)}
        />

        <InputBox
          onSendMessage={handleSendMessage}
          onCancelMessage={handleCancelMessage}
          isLoading={state.isLoading}
          currentProvider={state.currentProvider}
          currentModel={state.currentModel}
          providers={state.providers}
          onProviderChange={(provider) => dispatch({ type: 'SET_PROVIDER', payload: provider })}
          onModelChange={(model) => dispatch({ type: 'SET_MODEL', payload: model })}
          onProviderAndModelChange={(provider, model) => dispatch({ type: 'SET_PROVIDER_AND_MODEL', payload: { provider, model } })}
          onOpenSettings={onOpenSettings}
          focusTrigger={focusTrigger}
          contextUsage={state.contextUsage}
          workingDirectory={workingDirectory}
          virtualContextSize={virtualContextSize}
          onVirtualContextSizeChange={setVirtualContextSize}
        />
      </Box>

      {/* Tools Panel on the right */}
      <ToolsPanel
        collapsed={toolsPanelCollapsed}
        onToggleCollapse={setToolsPanelCollapsed}
        onStartingStateChange={setHasStartingServers}
        onOpenSettings={onOpenSettings}
        workingDirectory={workingDirectory}
      />
    </Box>
  );
}

import { Box, Typography, IconButton, Badge, Menu, MenuItem, ListItemText, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField } from '@mui/material';
import SegmentIcon from '@mui/icons-material/Segment';
import { Settings, Download, Wrench, X, Trash2, FilePlus } from 'lucide-react';
import { useEffect, useCallback, useState, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { ToolsPanel } from './ToolsPanel';
import type { ChatMessage, ProvidersData, ToolCall } from '../../types/chat';
import { toolRegistry } from '../../tools';
import { mcpToolsManager } from '../../tools/MCPToolsManager';
import { toolConfigManager } from '../../tools/ToolConfigManager';
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
  const [pendingPermissions, setPendingPermissions] = useState<Map<string, {
    onAllow: () => void;
    onDeny: () => void;
    previewData?: any;
  }>>(new Map());
  const [toolCallStatuses, setToolCallStatuses] = useState<Map<string, 'denied' | 'allowed'>>(new Map());
  const toolCallMessageIdRef = useRef<string | null>(null);
  const continuationMessageIdRef = useRef<string | null>(null);
  const pendingToolCallsRef = useRef<ToolCall[]>([]);
  const addedToolCallIdsRef = useRef<Set<string>>(new Set());
  const executedToolCallsRef = useRef<Set<string>>(new Set()); // Track executed tool calls for continuation
  const isContinuingAfterToolsRef = useRef<boolean>(false); // Track if we're continuing after tool execution
  const toolCallsInCurrentMessageRef = useRef<ToolCall[]>([]); // Track tool calls added to current streaming message
  const toolResultsAddedRef = useRef<Set<string>>(new Set()); // Track tool results that have been added
  const pendingContinuationRef = useRef<string | null>(null); // Track streaming message ID waiting for continuation
  const toolResultMessagesRef = useRef<Map<string, ChatMessage>>(new Map()); // Track tool result messages by tool_call_id
  const restoredPermissionsRef = useRef<Set<string>>(new Set()); // Track which tool call IDs we've already restored permissions for
  const executingToolCallsRef = useRef<Set<string>>(new Set()); // Track which tool calls are currently executing to prevent double execution
  const [sessionMenuAnchor, setSessionMenuAnchor] = useState<null | HTMLElement>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; lastModified: string; messageCount: number; name: string; isCustomName: boolean }>>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<'rolling' | 'halt'>('rolling');
  const [virtualContextSize, setVirtualContextSize] = useState<number | null>(null); // Debug: virtual context size override
  const lastTruncationIndexRef = useRef<number>(0); // Track where we last truncated in rolling mode

  // Load context mode when working directory changes
  useEffect(() => {
    if (workingDirectory) {
      loadContextMode();
    } else {
      setContextMode('rolling');
      lastTruncationIndexRef.current = 0;
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

  // Helper function to get display name for a session
  const getSessionDisplayName = (sessionId: string, customName: string, isCustom: boolean): string => {
    if (isCustom && customName) {
      return customName;
    }
    if (sessionId === 'default') {
      return 'Default Session';
    }
    // Return first 8 chars of UUID
    return `Session ${sessionId.substring(0, 8)}`;
  };

  const loadHomeDir = async () => {
    const home = await window.electronAPI.getHomeDir();
    setHomeDir(home);
  };

  const loadSessions = async () => {
    if (!workingDirectory) return;

    try {
      const result = await window.electronAPI.sessionList(workingDirectory);
      if (result.success) {
        setSessions(result.sessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleOpenSessionMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!state.isLoading) {
      loadSessions();
      setSessionMenuAnchor(event.currentTarget);
    }
  };

  const handleCloseSessionMenu = () => {
    setSessionMenuAnchor(null);
  };

  const handleNewSession = useCallback(async () => {
    await createNewSession();
  }, [createNewSession]);

  const handleLoadSession = async (sessionId: string) => {
    await loadSession(sessionId);
    handleCloseSessionMenu();
  };

  const handleDeleteSessionClick = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteSessionConfirm = async () => {
    if (!workingDirectory || !sessionToDelete) return;

    try {
      await window.electronAPI.sessionDelete(workingDirectory, sessionToDelete);
      // Reload the sessions list
      await loadSessions();

      // If we deleted the current session, create a new one
      if (sessionToDelete === state.currentSessionId) {
        await createNewSession();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }

    setDeleteConfirmOpen(false);
    setSessionToDelete(null);
  };

  const handleDeleteSessionCancel = () => {
    setDeleteConfirmOpen(false);
    setSessionToDelete(null);
  };

  const handleClearAllSessionsClick = () => {
    setClearAllConfirmOpen(true);
  };

  const handleClearAllSessionsConfirm = async () => {
    if (!workingDirectory) return;

    try {
      await window.electronAPI.sessionClearAll(workingDirectory);
      setSessions([]);
      // Create a new session since we cleared everything
      await createNewSession();
      handleCloseSessionMenu();
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }

    setClearAllConfirmOpen(false);
  };

  const handleClearAllSessionsCancel = () => {
    setClearAllConfirmOpen(false);
  };

  const loadProviders = async () => {
    const result = await window.electronAPI.configRead('providers.json');
    if (result.success && result.content) {
      // Backend now returns YAML
      const data: ProvidersData = yaml.load(result.content) as ProvidersData;
      dispatch({ type: 'LOAD_PROVIDERS', payload: data.providers });
    }
  };

  const handleToolCalls = useCallback(async (toolCalls: ToolCall[]) => {
    if (!state.streamingMessageId || !state.currentProvider || !state.currentModel) return;

    console.log('Handling tool calls:', toolCalls);
    const toolResultMessages: ChatMessage[] = [];
    const currentStreamingMessageId = state.streamingMessageId;

    // Store this message ID - we'll ignore the "done" chunk for it
    toolCallMessageIdRef.current = currentStreamingMessageId;

    // Add tool calls to the streaming message
    for (const toolCall of toolCalls) {
      dispatch({
        type: 'ADD_TOOL_CALL',
        payload: { messageId: currentStreamingMessageId, toolCall },
      });

      // Execute the tool (with permission check)
      try {
        const args = JSON.parse(toolCall.function.arguments);
        console.log('Executing tool:', toolCall.function.name, 'with args:', args);

        // For write/edit tools, fetch old content for diff preview
        let previewData: any = undefined;
        if (toolCall.function.name === 'write' && args.file_path) {
          try {
            const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
              file_path: args.file_path,
            });
            if (readResult.success && readResult.content) {
              // Parse the numbered lines to get just the content
              const lines = readResult.content.split('\n').map(line => {
                // Remove line numbers (format: "     1\tcontent")
                const tabIndex = line.indexOf('\t');
                return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
              });
              previewData = {
                old_content: lines.join('\n'),
                new_content: args.content,
                file_path: args.file_path,
              };
            } else {
              // New file - no old content
              previewData = {
                old_content: null,
                new_content: args.content,
                file_path: args.file_path,
              };
            }
          } catch (error) {
            console.error('Failed to read file for preview:', error);
            // New file or error - no old content
            previewData = {
              old_content: null,
              new_content: args.content,
              file_path: args.file_path,
            };
          }
        } else if (toolCall.function.name === 'edit' && args.file_path) {
          try {
            const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
              file_path: args.file_path,
            });
            if (readResult.success && readResult.content) {
              // Parse the numbered lines to get just the content
              const lines = readResult.content.split('\n').map(line => {
                // Remove line numbers (format: "     1\tcontent")
                const tabIndex = line.indexOf('\t');
                return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
              });
              const oldContent = lines.join('\n');
              // Apply the edit to show preview
              const newContent = args.replace_all
                ? oldContent.replace(new RegExp((args.old_string as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), args.new_string as string)
                : oldContent.replace(args.old_string as string, args.new_string as string);
              previewData = {
                old_content: oldContent,
                new_content: newContent,
                file_path: args.file_path,
              };
            }
          } catch (error) {
            console.error('Failed to read file for edit preview:', error);
          }
        }

        // Check if permission is required
        let result;
        if (toolRegistry.requiresPermission(toolCall.function.name)) {
          // Request permission from user (inline in the tool display)
          result = await new Promise((resolve, reject) => {
            setPendingPermissions(prev => {
              const next = new Map(prev);
              next.set(toolCall.id, {
                previewData, // Store preview data for display
                onAllow: async () => {
                  // Check if already executing to prevent double execution
                  if (executingToolCallsRef.current.has(toolCall.id)) {
                    console.log('Tool call already executing, ignoring duplicate allow:', toolCall.id);
                    return;
                  }
                  
                  // Mark as executing immediately
                  executingToolCallsRef.current.add(toolCall.id);
                  
                  // Remove from pending immediately (before execution) to prevent UI from showing it again
                  setPendingPermissions(p => {
                    const updated = new Map(p);
                    updated.delete(toolCall.id);
                    return updated;
                  });
                  // Mark as allowed
                  setToolCallStatuses(prev => {
                    const updated = new Map(prev);
                    updated.set(toolCall.id, 'allowed');
                    return updated;
                  });
                  // Execute the tool
                  try {
                    const toolResult = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);
                    resolve(toolResult);
                  } catch (error) {
                    reject(error);
                  } finally {
                    // Remove from executing set
                    executingToolCallsRef.current.delete(toolCall.id);
                  }
                },
                onDeny: () => {
                  // Mark as denied
                  setToolCallStatuses(prev => {
                    const updated = new Map(prev);
                    updated.set(toolCall.id, 'denied');
                    return updated;
                  });
                  // Remove from pending
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
          // Execute directly
          result = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);
        }

        console.log('Tool result:', result);

        // Add tool result as a new message
        const toolResultMessage: ChatMessage = {
          id: `tool-result-${Date.now()}-${Math.random()}`,
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          timestamp: Date.now(),
        };

        dispatch({ type: 'ADD_MESSAGE', payload: toolResultMessage });
        toolResultMessages.push(toolResultMessage);
      } catch (error) {
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
        toolResultMessages.push(errorMessage);
      }
    }

    // End the current streaming message (the one with tool calls)
    dispatch({ type: 'END_STREAMING' });

    // After all tools are executed, send the conversation back to the AI
    if (toolResultMessages.length > 0) {
      // Build the complete conversation history including the assistant message with tool calls
      // We need to manually construct the assistant message with tool calls since state may not have updated
      const assistantMessageWithTools: ChatMessage = {
        id: currentStreamingMessageId,
        role: 'assistant',
        content: '',
        tool_calls: toolCalls,
        timestamp: Date.now(),
      };

      // Build conversation: all previous messages (except the streaming one) + assistant with tools + tool results
      const previousMessages = state.messages.filter(m => m.id !== currentStreamingMessageId);
      const conversationHistory = [...previousMessages, assistantMessageWithTools, ...toolResultMessages];

      // Ensure system message is first, add default if none exists
      const hasSystemMessage = conversationHistory.some(m => m.role === 'system');
      const defaultSystemMessage: ChatMessage = {
        id: 'system-prompt',
        role: 'system',
        content: 'You are a helpful AI assistant.',
        timestamp: Date.now(),
      };
      const messagesToSend = ensureSystemPromptFirst(conversationHistory, hasSystemMessage ? null : defaultSystemMessage);

      console.log('Continuing conversation with', messagesToSend.length, 'messages');

      // Create a new assistant message for the AI's response to the tool results
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

      // Clear tool call tracking for continuation message
      addedToolCallIdsRef.current.clear();
      pendingToolCallsRef.current = [];

      // Store the continuation message ID
      continuationMessageIdRef.current = assistantMessageId;

      try {
        // Send the full conversation including tool results back to the AI
        console.log('Sending continuation with messages:', JSON.stringify(messagesToSend, null, 2));

        // Send continuation request after tool execution
        // For LM Studio with native tool support, we SHOULD still send tools
        // to maintain the tool calling format (model may make additional tool calls)
        const result = await window.electronAPI.chatSendMessage({
          provider: state.currentProvider.id,
          model: state.currentModel.id,
          messages: messagesToSend,
          tools: toolRegistry.getDefinitions(),
        });

        if (result && !result.success && result.error) {
          console.error('Chat API error during tool continuation:', result.error);
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
      }
    }
  }, [state.streamingMessageId, state.currentProvider, state.currentModel, state.messages, dispatch]);

  // Rough estimation of token usage for Ollama (since it doesn't report tokens)
  const estimateTokenUsage = (messages: ChatMessage[]): number => {
    // Rough estimate: 1 token ≈ 4 characters
    let totalChars = 0;
    for (const message of messages) {
      totalChars += message.content.length;
      // Add some overhead for role, formatting, and tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          totalChars += toolCall.function.name.length;
          totalChars += toolCall.function.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  };

  // Apply context management: truncate messages based on context mode and usage
  // Keep truncating until we're below 95% (or can't truncate more)
  const applyContextManagement = useCallback((
    messages: ChatMessage[],
    systemPrompt: ChatMessage | null,
    contextTotal: number
  ): { messagesToSend: ChatMessage[]; shouldHalt: boolean } => {
    // Validate contextTotal - it should be a reasonable value (at least 1000 tokens)
    // If it's too small, it's likely an error and we should skip context management
    if (!contextTotal || contextTotal < 1000 || messages.length === 0) {
      if (contextTotal && contextTotal < 1000) {
        console.warn('[Context Management] Invalid contextTotal detected:', contextTotal, '- skipping context management');
      }
      return { messagesToSend: messages, shouldHalt: false };
    }

    // Separate system messages from conversation messages
    // Note: systemPrompt parameter should be the primary system prompt and always come first
    // System messages from state (if any) are typically duplicates or older versions
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Calculate current usage including system prompt
    // For calculation, include system prompt first, then any other system messages, then conversation
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
    // But only if contextTotal is valid (greater than a reasonable minimum)
    if (contextMode === 'halt' && contextTotal > 100 && usagePercent >= 100) {
      console.log('[Context Management] HALT: Usage at 100%', {
        usagePercent: usagePercent.toFixed(2) + '%',
        estimatedUsage,
        contextTotal,
      });
      return { messagesToSend: [], shouldHalt: true };
    }
    
    // If contextTotal seems invalid (too small), don't halt
    if (contextTotal <= 100) {
      console.warn('[Context Management] Invalid contextTotal detected:', contextTotal, '- skipping halt check');
    }

    // For Rolling Window mode: if at or over 95%, exclude 30% of oldest conversation messages
    // Keep truncating until we're below 95% (or can't truncate more)
    // IMPORTANT: Always preserve message pairs (user messages must have their assistant responses)
    if (contextMode === 'rolling' && usagePercent >= 95) {
      console.log('[Context Management] ROLLING: Truncating at', usagePercent.toFixed(2) + '%');
      
      let currentMessages = [...conversationMessages];
      let currentUsage = estimatedUsage;
      let currentPercent = usagePercent;
      let totalExcluded = 0;
      
      // Keep truncating until we're below 95% or can't truncate more
      let previousMessageCount = currentMessages.length;
      let previousPercent = currentPercent;
      let iterationCount = 0;
      const maxIterations = 10; // Safety limit to prevent infinite loops
      
      while (currentPercent >= 95 && currentMessages.length > 1 && iterationCount < maxIterations) {
        iterationCount++;
        
        if (currentMessages.length === 0) {
          break;
        }

        // Calculate how many messages to exclude (30% of current remaining messages)
        const messagesToExclude = Math.ceil(currentMessages.length * 0.3);
        
        if (messagesToExclude >= currentMessages.length) {
          // Can't exclude all messages, keep at least the last user-assistant pair
          // Find the last user message and keep everything from there
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
            // No user message found, keep at least the last message
            currentMessages = currentMessages.slice(-1);
          }
          break;
        }

        // Exclude the oldest messages, but ensure we don't break message pairs
        // We want to always start with a user message to preserve conversation structure
        const exclusionPoint = messagesToExclude;
        let safeExclusionPoint = exclusionPoint;
        
        // Find the last user message before or at the exclusion point
        // This ensures we always start with a user message (preserving complete conversation pairs)
        let lastUserBeforeExclusion = -1;
        for (let i = Math.min(exclusionPoint, currentMessages.length - 1); i >= 0; i--) {
          if (currentMessages[i].role === 'user') {
            lastUserBeforeExclusion = i;
            break;
          }
        }
        
        // If we found a user message, start from there (this preserves the conversation pair)
        // If we didn't find one, it means we're excluding everything up to the exclusion point
        if (lastUserBeforeExclusion >= 0) {
          safeExclusionPoint = lastUserBeforeExclusion;
        }
        
        // If we can't exclude anything (safeExclusionPoint is 0), break to avoid infinite loop
        if (safeExclusionPoint === 0) {
          console.warn('[Context Management] Cannot truncate further - safe exclusion point is 0');
          break;
        }
        
        // Exclude messages up to the safe point
        currentMessages = currentMessages.slice(safeExclusionPoint);
        totalExcluded += safeExclusionPoint;
        
        // Recalculate usage with remaining messages
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
        
        // Break if we're not making progress (message count or percent didn't change)
        if (currentMessages.length === previousMessageCount && currentPercent >= previousPercent) {
          console.warn('[Context Management] No progress made in truncation - breaking loop');
          break;
        }
        
        previousMessageCount = currentMessages.length;
        previousPercent = currentPercent;
      }
      
      if (iterationCount >= maxIterations) {
        console.warn('[Context Management] Reached maximum iterations - breaking loop to prevent infinite loop');
      }
      
      console.log('[Context Management] Final truncation result:', {
        originalCount: conversationMessages.length,
        totalExcluded,
        remaining: currentMessages.length,
        finalUsage: currentUsage,
        finalPercent: currentPercent.toFixed(2) + '%',
        firstMessageRole: currentMessages[0]?.role,
      });
      
      // Build messagesToSend with system prompt FIRST, then remaining conversation messages
      const messagesToSend = systemPrompt
        ? [systemPrompt, ...currentMessages]
        : [...systemMessages, ...currentMessages];
      
      // Return messages to send (truncated for API, but state keeps all messages)
      return {
        messagesToSend,
        shouldHalt: false,
      };
    }

    // No truncation needed - ensure system prompt is first if provided
    const messagesToSend = systemPrompt
      ? [systemPrompt, ...conversationMessages]
      : [...systemMessages, ...conversationMessages];
    
    return {
      messagesToSend,
      shouldHalt: false,
    };
  }, [contextMode]);

  // Function to update context usage
  // This calculates usage based on the ACTUAL messages that would be sent (after truncation)
  const updateContextUsage = useCallback(async (usedTokens?: number) => {
    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'UPDATE_CONTEXT_USAGE', payload: null });
      return;
    }

    try {
      // Use virtual context size if set (for debugging), otherwise fetch actual context length
      let totalTokens: number | null = virtualContextSize || null;
      
      if (!totalTokens) {
        // Fetch context length from API
        const result = await window.electronAPI.chatGetContextLength({
          provider: state.currentProvider.id,
          model: state.currentModel.id,
        });

        if (result.success && result.contextLength) {
          totalTokens = result.contextLength;
        } else {
          // Fallback: try to use contextLength from model config
          totalTokens = state.currentModel.contextLength || null;
        }
      }

      if (totalTokens) {
        // Calculate usage based on messages that would ACTUALLY be sent (after truncation)
        // This gives us the "current window" usage, not the total history
        let messagesForUsage: ChatMessage[] = [];
        
        // Apply context management to get the actual messages that would be sent
        // This includes system prompt and truncated conversation messages
        if (totalTokens && state.messages.length > 0) {
          const contextResult = applyContextManagement(
            state.messages,
            null, // No system prompt in state (it's added per-request, but we'll estimate it)
            totalTokens
          );
          // Use the full messagesToSend which represents what would actually be sent
          // This includes system prompt if it would be added
          messagesForUsage = contextResult.messagesToSend;
        } else {
          messagesForUsage = state.messages;
        }

        // If we have actual usage data from LM Studio, use it
        // Otherwise estimate based on the truncated messages (what's actually sent)
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
      // Try fallback to config value or virtual context size
      const totalTokens = virtualContextSize || state.currentModel.contextLength || null;
      if (totalTokens) {
        // Calculate based on truncated messages
        let messagesForUsage: ChatMessage[] = [];
        if (totalTokens && state.messages.length > 0) {
          const contextResult = applyContextManagement(
            state.messages,
            null,
            totalTokens
          );
          // Use full messagesToSend which includes system prompt
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
  }, [state.currentProvider, state.currentModel, state.messages, virtualContextSize, contextMode, dispatch, applyContextManagement, estimateTokenUsage]);

  // Helper function to ensure system messages are always first in the messages array
  const ensureSystemPromptFirst = (messages: ChatMessage[], systemPrompt: ChatMessage | null = null): ChatMessage[] => {
    if (messages.length === 0) {
      return systemPrompt ? [systemPrompt] : [];
    }

    // Separate system messages from other messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // If systemPrompt is provided, use it as the primary (and only) system message
    // Otherwise, use system messages from the array
    if (systemPrompt) {
      return [systemPrompt, ...otherMessages];
    }

    // No explicit system prompt provided, use system messages from array (should be first already)
    return [...systemMessages, ...otherMessages];
  };

  // Continue AI generation after tool execution with updated context
  // Note: Currently unused, but kept for future use
  // const continueAIGenerationAfterTool = useCallback(async () => {
  //   if (!state.currentProvider || !state.currentModel || !state.streamingMessageId) return;

  //   try {
  //     // Build conversation with all current messages including the tool result just added
  //     // BUT exclude the current streaming message since we want to continue it
  //     const allMessages = state.messages.filter(m => m.id !== state.streamingMessageId);

  //     // Ensure system message is first, add default if none exists
  //     const hasSystemMessage = allMessages.some(m => m.role === 'system');
  //     const defaultSystemMessage: ChatMessage = {
  //       id: `system-${Date.now()}`,
  //       role: 'system',
  //       content: 'You are a helpful AI assistant.',
  //       timestamp: Date.now(),
  //     };
  //     const messagesToSend = ensureSystemPromptFirst(allMessages, hasSystemMessage ? null : defaultSystemMessage);

  //     console.log('Continuing AI generation after tool execution...');

  //     // Send updated context back to AI to continue generation
  //     // DON'T create a new message - continue the existing streaming message
  //     const result = await window.electronAPI.chatSendMessage({
  //       provider: state.currentProvider.id,
  //       model: state.currentModel.id,
  //       messages: messagesToSend,
  //       tools: toolRegistry.getDefinitions(),
  //     });

  //     if (result && !result.success && result.error) {
  //       console.error('Failed to continue AI generation:', result.error);
  //       dispatch({ type: 'SET_ERROR', payload: result.error });
  //       dispatch({ type: 'END_STREAMING' });
  //     }
  //   } catch (error) {
  //     console.error('Error continuing AI generation:', error);
  //     dispatch({ type: 'SET_ERROR', payload: 'Failed to continue AI generation' });
  //     dispatch({ type: 'END_STREAMING' });
  //   }
  // }, [state.currentProvider, state.currentModel, state.messages, state.streamingMessageId, dispatch]);

  // Function to continue conversation after tool execution
  const continueAfterToolExecution = useCallback(async (streamingMessageIdOverride?: string) => {
    if (!state.currentProvider || !state.currentModel) {
      console.log('No provider or model, cannot continue');
      return;
    }
    
    // Use provided streaming message ID, or get from state
    // The override is used when continuation is triggered from 'done' chunk
    // to avoid race conditions where state.streamingMessageId becomes null
    const currentStreamingMessageId = streamingMessageIdOverride || state.streamingMessageId;
    if (!currentStreamingMessageId) {
      console.log('No streaming message ID, cannot continue');
      return;
    }
    
    if (isContinuingAfterToolsRef.current) {
      console.log('Already continuing after tools, skipping...');
      return;
    }
    
    // Try to get tool calls from ref first, then fall back to finding from messages
    let toolCallsInMessage = toolCallsInCurrentMessageRef.current;
    
    // If ref is empty, try to find tool calls from the message in state
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

    // Get the tool call IDs
    const toolCallIds = toolCallsInMessage.map(tc => tc.id);
    
    // Check ref to see if all tool results have been added (this is updated synchronously in handleImmediateToolCall)
    // Trust the ref as the source of truth since it's updated synchronously when tool results are added
    // The messages check is unreliable because React state updates are async and may not be available yet
    const allResultsAdded = toolCallIds.every(id => toolResultsAddedRef.current.has(id));
    const resultsCountInRef = Array.from(toolResultsAddedRef.current).filter(id => toolCallIds.includes(id)).length;
    
    // Log messages count for debugging, but don't require it
    const toolResultsInMessages = state.messages.filter(m => 
      m.role === 'tool' && m.tool_call_id && toolCallIds.includes(m.tool_call_id)
    );

    console.log(`Checking tool results: ref=${resultsCountInRef}/${toolCallIds.length}, messages=${toolResultsInMessages.length}/${toolCallIds.length}, allAdded=${allResultsAdded}`);

    // If ref says all results are added, proceed directly to continuation (trust the ref)
    if (allResultsAdded && resultsCountInRef === toolCallIds.length) {
      console.log('All tool results are ready (confirmed by ref), proceeding with continuation');
      // Longer delay to ensure React state has updated with tool result messages
      // React state updates are async, so we need to wait for them to propagate
      setTimeout(() => {
        // Now proceed with continuation - get fresh state by reading it in this closure
        if (isContinuingAfterToolsRef.current) {
          console.log('Already continuing, skipping...');
          return;
        }
        isContinuingAfterToolsRef.current = true;
        
        // Proceed with continuation - it will read fresh state from its own closure
        proceedWithContinuation(currentStreamingMessageId, toolCallsInMessage, toolCallIds);
      }, 300); // Increased delay to ensure tool result messages are in state
      return;
    }
    
    // Not all results added yet, wait and retry
    console.log(`Still waiting for tool results (ref=${resultsCountInRef}/${toolCallIds.length}), will retry in 200ms...`);
    setTimeout(() => {
      continueAfterToolExecution();
    }, 200);
    return;

  }, [state.currentProvider, state.currentModel, state.streamingMessageId, state.messages, dispatch, workingDirectory]);

  // Helper function to proceed with continuation after state has updated
  // This function will read fresh state from its closure when called
  const proceedWithContinuation = useCallback(async (
    currentStreamingMessageId: string,
    toolCallsInMessage: ToolCall[],
    toolCallIds: string[],
  ) => {
    // Read fresh messages from state (closure will have latest state when callback is called)
    const currentMessages = state.messages;
    let allToolResults = currentMessages.filter(m => 
      m.role === 'tool' && m.tool_call_id && toolCallIds.includes(m.tool_call_id)
    );
    
    // If tool results aren't in messages yet (React state update delay),
    // use the tool result messages we stored in the ref when they were added
    if (allToolResults.length !== toolCallIds.length) {
      console.log(`Tool results in state: ${allToolResults.length}/${toolCallIds.length}, checking ref for missing results...`);
      
      // Get tool results from ref for any missing ones
      const missingToolCallIds = toolCallIds.filter(id => 
        !allToolResults.some(tr => tr.tool_call_id === id)
      );
      
      for (const toolCallId of missingToolCallIds) {
        const toolResultFromRef = toolResultMessagesRef.current.get(toolCallId);
        if (toolResultFromRef) {
          console.log(`Found tool result in ref for tool call ${toolCallId}, using it`);
          allToolResults.push(toolResultFromRef);
        }
      }
      
      // If we still don't have all results after checking ref, log warning
      if (allToolResults.length !== toolCallIds.length) {
        console.warn(`Still missing tool results: have ${allToolResults.length}, need ${toolCallIds.length}`);
      }
    }
    
    console.log('Continuing conversation after tool execution with', allToolResults.length, 'tool results for', toolCallIds.length, 'tool calls');
    // End the current streaming message (the one with tool calls)
    dispatch({ type: 'END_STREAMING' });

    // Build conversation history: all messages including the assistant message with tools and all tool results
    const assistantMessageIndex = currentMessages.findIndex(m => m.id === currentStreamingMessageId);
    const assistantMessageWithTools = assistantMessageIndex >= 0 ? currentMessages[assistantMessageIndex] : null;
    
    // Build the assistant message with tool calls from the ref (guaranteed to have them)
    const assistantMessageWithToolCalls: ChatMessage = {
      ...(assistantMessageWithTools || {
        id: currentStreamingMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }),
      tool_calls: toolCallsInMessage, // Use tool calls from ref, not state
    };

    // Get all messages up to (but not including) the assistant message
    const messagesBeforeAssistant = assistantMessageIndex >= 0 
      ? currentMessages.slice(0, assistantMessageIndex)
      : currentMessages;
    
    // Build complete conversation: messages before assistant + assistant message with tools + tool results
    const conversationHistory = [
      ...messagesBeforeAssistant,
      assistantMessageWithToolCalls,
      ...allToolResults,
    ];

    // Ensure system message is first, add default if none exists
    const hasSystemMessage = conversationHistory.some(m => m.role === 'system');
    const defaultSystemMessage: ChatMessage = {
      id: 'system-prompt',
      role: 'system',
      content: 'You are a helpful AI assistant.',
      timestamp: Date.now(),
    };
    const messagesToSend = ensureSystemPromptFirst(conversationHistory, hasSystemMessage ? null : defaultSystemMessage);

      console.log('Continuing with', messagesToSend.length, 'messages (including tool results)');

      // Create a new assistant message for the continuation
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

      // Clear tool call tracking for continuation message
      addedToolCallIdsRef.current.clear();
      pendingToolCallsRef.current = [];
      executedToolCallsRef.current.clear();
      toolCallsInCurrentMessageRef.current = [];
      toolResultsAddedRef.current.clear();
      toolResultMessagesRef.current.clear();
      pendingContinuationRef.current = null;

      try {
        // Send the conversation with tool results back to the AI
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
  }, [state.currentProvider, state.currentModel, state.messages, dispatch]);

  // Immediate tool execution handler (preserves all rich features)
  const handleImmediateToolCall = useCallback(async (toolCall: ToolCall) => {
    if (!state.streamingMessageId || !workingDirectory) return;

    // Skip if already executed
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

      // Generate diff preview data for write/edit tools (same as batch mode)
      let previewData: any = undefined;
      if (toolCall.function.name === 'write' && args.file_path) {
        try {
          const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
            file_path: args.file_path,
          });
          if (readResult.success && readResult.content) {
            const lines = readResult.content.split('\n').map(line => {
              const tabIndex = line.indexOf('\t');
              return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
            });
            previewData = {
              old_content: lines.join('\n'),
              new_content: args.content,
              file_path: args.file_path,
            };
          } else {
            previewData = {
              old_content: null,
              new_content: args.content,
              file_path: args.file_path,
            };
          }
        } catch (error) {
          console.error('Failed to read file for preview:', error);
          previewData = {
            old_content: null,
            new_content: args.content,
            file_path: args.file_path,
          };
        }
      } else if (toolCall.function.name === 'edit' && args.file_path) {
        try {
          const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
            file_path: args.file_path,
          });
          if (readResult.success && readResult.content) {
            const lines = readResult.content.split('\n').map(line => {
              const tabIndex = line.indexOf('\t');
              return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
            });
            const oldContent = lines.join('\n');
            const newContent = args.replace_all
              ? oldContent.replace(new RegExp((args.old_string as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), args.new_string as string)
              : oldContent.replace(args.old_string as string, args.new_string as string);
            previewData = {
              old_content: oldContent,
              new_content: newContent,
              file_path: args.file_path,
            };
          }
        } catch (error) {
          console.error('Failed to read file for edit preview:', error);
        }
      }

      // Handle tool permissions (same as batch mode)
      let result;
      if (toolRegistry.requiresPermission(toolCall.function.name)) {
        result = await new Promise((resolve, reject) => {
          setPendingPermissions(prev => {
            const next = new Map(prev);
            next.set(toolCall.id, {
              previewData,
              onAllow: async () => {
                // Check if already executing to prevent double execution
                if (executingToolCallsRef.current.has(toolCall.id)) {
                  console.log('Tool call already executing, ignoring duplicate allow:', toolCall.id);
                  return;
                }
                
                // Mark as executing immediately
                executingToolCallsRef.current.add(toolCall.id);
                
                // Remove from pending immediately (before execution) to prevent UI from showing it again
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
                  // Remove from executing set
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
        // Execute directly
        result = await toolRegistry.execute(toolCall.function.name, args, workingDirectory);
      }

      console.log('Immediate tool result:', result);

      // Add tool result message immediately
      const toolResultMessage: ChatMessage = {
        id: `tool-result-${Date.now()}-${Math.random()}`,
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
        timestamp: Date.now(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: toolResultMessage });
      toolResultsAddedRef.current.add(toolCall.id); // Track that tool result was added
      toolResultMessagesRef.current.set(toolCall.id, toolResultMessage); // Store the tool result message for continuation

      // Check if this was the last tool call and trigger continuation if 'done' already arrived
      // This handles the case where tool execution completes after the 'done' chunk
      const toolCallsInMessage = toolCallsInCurrentMessageRef.current;
      const allToolCallIds = toolCallsInMessage.map(tc => tc.id);
      const allResultsReady = allToolCallIds.every(id => toolResultsAddedRef.current.has(id));
      
      if (allResultsReady && allToolCallIds.length > 0) {
        console.log('All tool results ready, checking if we should trigger continuation');
        
        // Capture message ID NOW before any async operations
        // Try to find the streaming message ID from multiple sources:
        // 1. Current state (if streaming is still active)
        // 2. Pending continuation ref (if done chunk arrived)
        // 3. Find from messages (last assistant message with tool calls)
        let streamingMsgId = state.streamingMessageId || pendingContinuationRef.current;
        
        // If still not found, find the last assistant message with tool calls
        if (!streamingMsgId) {
          const lastAssistantWithTools = [...state.messages]
            .reverse()
            .find(m => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0);
          if (lastAssistantWithTools) {
            streamingMsgId = lastAssistantWithTools.id;
            console.log('Found assistant message with tool calls from messages:', streamingMsgId);
          }
        }
        
        if (streamingMsgId) {
          console.log('Triggering continuation after tool result, message ID:', streamingMsgId);
          // Clear pending continuation since we're handling it
          pendingContinuationRef.current = null;
          // Small delay to ensure state updates, then trigger continuation
          setTimeout(() => {
            continueAfterToolExecution(streamingMsgId || undefined);
          }, 100);
        } else {
          console.log('No streaming message ID available, cannot trigger continuation automatically');
          console.log('Messages:', state.messages.map(m => ({ id: m.id, role: m.role, hasToolCalls: !!m.tool_calls })));
        }
      }

      // Don't continue here - wait for 'done' chunk to trigger continuation
      // This allows multiple tool calls to execute before continuing

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
      toolResultsAddedRef.current.add(toolCall.id); // Track that tool result (error) was added
      toolResultMessagesRef.current.set(toolCall.id, errorMessage); // Store the error message for continuation
      // Mark as executed even on error so continuation can proceed
      executedToolCallsRef.current.add(toolCall.id);
    }
  }, [state.streamingMessageId, state.messages, workingDirectory, dispatch]);

  const setupChatChunkListener = useCallback(() => {
    window.electronAPI.onChatChunk((chunk: unknown) => {
      const typedChunk = chunk as {
        type: string;
        content?: string;
        tool_call?: ToolCall; // Single tool call for immediate execution
        tool_calls?: ToolCall[]; // Legacy batch tool calls
        error?: string;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };
      console.log('Received chat chunk:', typedChunk);
      console.log('Current streaming message ID:', state.streamingMessageId);

      if (typedChunk.type === 'content') {
        console.log('Appending content to streaming message:', typedChunk.content);
        dispatch({ type: 'APPEND_TO_STREAMING', payload: typedChunk.content || '' });
        // Update context usage as content streams in
        // Use a small delay to batch rapid updates
        if (updateContextUsageRef.current) {
          setTimeout(() => {
            updateContextUsageRef.current();
          }, 100);
        }
      } else if (typedChunk.type === 'tool_call') {
        // NEW: Handle immediate single tool call execution
        console.log('Handling immediate tool call:', typedChunk.tool_call);

        if (typedChunk.tool_call && state.streamingMessageId) {
          const toolCall = typedChunk.tool_call;

          // Validate tool call has required fields
          if (!toolCall.id || !toolCall.function?.name) {
            console.warn('Invalid tool call received:', toolCall);
            return;
          }

          // Check for duplicate tool call (same tool name and arguments)
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments;
          
          // Normalize arguments for comparison
          // This handles: JSON string vs object, whitespace differences, empty vs whitespace-only values
          const normalizeArgs = (args: string | Record<string, unknown>): string => {
            let parsed: Record<string, unknown>;
            
            // Parse if string
            if (typeof args === 'string') {
              try {
                parsed = JSON.parse(args);
              } catch {
                // If not valid JSON, return trimmed string
                return args.trim();
              }
            } else {
              parsed = args;
            }
            
            // Normalize the object: trim string values, treat empty/whitespace-only strings as equivalent
            const normalized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(parsed)) {
              const trimmedKey = key.trim();
              
              if (typeof value === 'string') {
                const trimmed = value.trim();
                // Treat empty and whitespace-only strings as empty string
                normalized[trimmedKey] = trimmed === '' ? '' : trimmed;
              } else if (value !== null && value !== undefined) {
                normalized[trimmedKey] = value;
              } else {
                // Include null/undefined as empty string for comparison purposes
                normalized[trimmedKey] = '';
              }
            }
            
            // Sort keys for consistent comparison
            const sortedKeys = Object.keys(normalized).sort();
            const sorted: Record<string, unknown> = {};
            for (const key of sortedKeys) {
              sorted[key] = normalized[key];
            }
            
            return JSON.stringify(sorted);
          };
          
          const normalizedArgs = normalizeArgs(toolArgs);
          
          // Check for duplicates in multiple places:
          // 1. Tool calls already in state.messages (completed messages)
          // 2. Tool calls in the current message ref (being streamed)
          const checkDuplicate = (toolCalls: ToolCall[]): boolean => {
            return toolCalls.some(tc => {
              const existingToolName = tc.function.name;
              const existingToolArgs = tc.function.arguments;
              const normalizedExistingArgs = normalizeArgs(existingToolArgs);
              
              return existingToolName === toolName && normalizedExistingArgs === normalizedArgs;
            });
          };
          
          // Check in state messages
          const isDuplicateInState = state.messages.some(m => {
            if (m.role !== 'assistant' || !m.tool_calls) return false;
            return checkDuplicate(m.tool_calls);
          });
          
          // Check in current message ref (tool calls being streamed)
          const isDuplicateInCurrentMessage = checkDuplicate(toolCallsInCurrentMessageRef.current);
          
          const isDuplicate = isDuplicateInState || isDuplicateInCurrentMessage;
          
          if (isDuplicate) {
            console.log('Duplicate tool call detected, skipping:', toolName, normalizedArgs);
            // Don't add to message, don't execute, just let the stream continue
            // The LLM will regenerate without this duplicate tool call
            return;
          }

          // Add tool call to the streaming message for display
          if (!addedToolCallIdsRef.current.has(toolCall.id)) {
            addedToolCallIdsRef.current.add(toolCall.id);
            toolCallsInCurrentMessageRef.current.push(toolCall); // Track tool call
            console.log('Added tool call to ref:', toolCall.function.name, 'Total in ref:', toolCallsInCurrentMessageRef.current.length);
            dispatch({
              type: 'ADD_TOOL_CALL',
              payload: { messageId: state.streamingMessageId, toolCall },
            });
          }

          // Execute the tool immediately (preserving all rich features)
          handleImmediateToolCall(toolCall);
        } else {
          console.warn('Received tool_call chunk but no tool_call data or no streaming message ID');
        }
      } else if (typedChunk.type === 'tool_calls') {
        // LEGACY: Handle batch tool calls for backward compatibility
        console.log('Accumulating tool calls (batch mode)');
        pendingToolCallsRef.current = typedChunk.tool_calls || [];

        // Add tool calls to the streaming message for display
        for (const toolCall of typedChunk.tool_calls || []) {
          if (!addedToolCallIdsRef.current.has(toolCall.id)) {
            addedToolCallIdsRef.current.add(toolCall.id);
            dispatch({
              type: 'ADD_TOOL_CALL',
              payload: { messageId: state.streamingMessageId!, toolCall },
            });
          }
        }
      } else if (typedChunk.type === 'done') {
        console.log('Received done chunk');

        // If there are pending tool calls (legacy batch mode), execute them
        if (pendingToolCallsRef.current.length > 0) {
          console.log('Executing pending tool calls (batch mode):', pendingToolCallsRef.current);
          const toolCallsToExecute = [...pendingToolCallsRef.current];
          pendingToolCallsRef.current = []; // Clear pending
          handleToolCalls(toolCallsToExecute);
          return; // Don't end streaming yet - wait for tool execution to complete
        }

        // For immediate mode: check if we have any tool calls in the current message
        // Use the ref which is updated synchronously, not state which might be stale
        const toolCallsInMessage = toolCallsInCurrentMessageRef.current;
        const hasToolCalls = toolCallsInMessage.length > 0;
        
        console.log('Done chunk received - checking for tool calls:');
        console.log('  - Tool calls in ref:', toolCallsInMessage.length, toolCallsInMessage.map(tc => tc.function?.name));
        console.log('  - Executed tool calls:', executedToolCallsRef.current.size, Array.from(executedToolCallsRef.current));
        console.log('  - Tool results added:', toolResultsAddedRef.current.size, Array.from(toolResultsAddedRef.current));
        
        if (hasToolCalls) {
          console.log('Tool calls found in current message, will continue after tool execution completes');
          
          // Capture the streaming message ID now (before any delays or state changes)
          const streamingMsgId = state.streamingMessageId;
          
          // Check if all tool results are already ready (tool execution completed quickly)
          const toolCallIds = toolCallsInMessage.map(tc => tc.id);
          const allResultsReady = toolCallIds.every(id => toolResultsAddedRef.current.has(id));
          
          if (allResultsReady) {
            console.log('All tool results already ready, proceeding with continuation immediately');
            // All results ready, proceed immediately
            setTimeout(() => {
              continueAfterToolExecution(streamingMsgId || undefined);
            }, 100);
          } else {
            console.log('Waiting for tool results to complete, storing message ID for continuation');
            // Store the message ID so tool result handler can trigger continuation even if streaming ends
            if (streamingMsgId) {
              pendingContinuationRef.current = streamingMsgId;
            }
            // Wait a bit for tool execution to complete, then check if we should continue
            // The continuation function will check if all tool results are ready
            setTimeout(() => {
              continueAfterToolExecution(streamingMsgId || undefined);
            }, 300); // Increased delay to ensure tool results are added and state is updated
          }
          return; // Don't end streaming yet - continuation will handle it
        }

        // No tool calls in this message - normal end of stream
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
  }, [handleImmediateToolCall, continueAfterToolExecution, dispatch, state.streamingMessageId, state.currentProvider, state.currentModel, state.messages]);

  const handleCancelMessage = useCallback(async () => {
    console.log('Cancelling message');
    try {
      await window.electronAPI.chatCancel();
    } catch (error) {
      console.error('Failed to cancel message:', error);
    }
  }, []);

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

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    // Create assistant message for streaming
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
    dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

    // Clear tool call tracking for new message
    addedToolCallIdsRef.current.clear();
    pendingToolCallsRef.current = [];
    executedToolCallsRef.current.clear();
    toolCallsInCurrentMessageRef.current = [];
    toolResultsAddedRef.current.clear();
    isContinuingAfterToolsRef.current = false;

    // Build messages array with user message
    const messagesWithUser = [...state.messages, userMessage];

    // Create system prompt message if provided
    const systemPromptMessage = systemPrompt ? {
      id: `system-${Date.now()}`,
      role: 'system' as const,
      content: systemPrompt,
      timestamp: Date.now(),
    } : null;

    // Get context length to check usage
    // Use virtual context size if set (for debugging), otherwise use actual context length
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

    // Apply context management - this only affects what we send to the API, not state
    // ALWAYS apply context management if we have a contextTotal (required for rolling/halt modes)
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
        excludedMessages: messagesWithUser.length - contextResult.messagesToSend.length,
      });

      // Check if we should halt (Halt mode at 100%)
      if (contextResult.shouldHalt) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Conversation halted: context usage has reached 100%. Please start a new session or clear messages.',
        });
        dispatch({ type: 'END_STREAMING' });
        // Remove the user message we just added since we can't send
        dispatch({ 
          type: 'UPDATE_MESSAGE', 
          payload: { 
            id: userMessage.id, 
            updates: { content: 'Message not sent: context limit reached.' } 
          } 
        });
        return;
      }

      // Use truncated messages from context management
      messagesToSend = contextResult.messagesToSend;
    } else {
      // No context management - build messages array normally
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
      messageRoles: messagesToSend.slice(0, 10).map(m => m.role).join(', ') + (messagesToSend.length > 10 ? '...' : ''),
      hasToolMessages: messagesToSend.some(m => m.role === 'tool'),
      toolMessageCount: messagesToSend.filter(m => m.role === 'tool').length,
    });

    try {
      // Send message via IPC
      const result = await window.electronAPI.chatSendMessage({
        provider: state.currentProvider.id,
        model: state.currentModel.id,
        messages: messagesToSend,
        tools: toolRegistry.getDefinitions(),
      });

      // Check if the result contains an error
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
  }, [state.currentProvider, state.currentModel, state.messages, contextMode, virtualContextSize, dispatch, applyContextManagement]);

  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    if (state.isLoading) return; // Don't allow editing while loading
    
    const message = state.messages.find(m => m.id === messageId);
    if (!message) return;

    // Simply update the message content - no side effects
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, updates: { content: newContent } } });
  }, [state.isLoading, dispatch]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    if (state.isLoading) return; // Don't allow deletion while loading
    
    // Find the message being deleted
    const messageToDelete = state.messages.find(m => m.id === messageId);
    
    // If it's an assistant message with tool calls, also delete associated tool results
    if (messageToDelete && messageToDelete.role === 'assistant' && messageToDelete.tool_calls && messageToDelete.tool_calls.length > 0) {
      // Find all tool result messages that reference these tool calls
      const toolCallIds = messageToDelete.tool_calls.map(tc => tc.id).filter(Boolean);
      const toolResultMessages = state.messages.filter(m => 
        m.role === 'tool' && 
        m.tool_call_id && 
        toolCallIds.includes(m.tool_call_id)
      );
      
      // Delete all associated tool result messages first
      toolResultMessages.forEach(toolResult => {
        dispatch({ type: 'DELETE_MESSAGE', payload: toolResult.id });
      });
    }
    
    // Delete the message itself
    dispatch({ type: 'DELETE_MESSAGE', payload: messageId });
  }, [state.isLoading, state.messages, dispatch]);

  const handleFork = useCallback(async (messageId: string) => {
    if (state.isLoading || !workingDirectory) return; // Don't allow forking while loading
    
    // Find the message index
    const messageIndex = state.messages.findIndex(m => m.id === messageId);
    if (messageIndex < 0) return;
    
    // Get all messages up to and including the selected message
    const baseMessages = state.messages.slice(0, messageIndex + 1);
    
    // If the selected message is an assistant message with tool calls,
    // include any tool result messages that come after it but before the next user/assistant message
    const lastMessage = baseMessages[baseMessages.length - 1];
    const toolResultMessages: ChatMessage[] = [];
    
    if (lastMessage?.role === 'assistant' && lastMessage.tool_calls) {
      const toolCallIds = lastMessage.tool_calls.map(tc => tc.id).filter(Boolean);
      
      // Find tool result messages that come after this message
      for (let i = messageIndex + 1; i < state.messages.length; i++) {
        const msg = state.messages[i];
        if (msg.role === 'tool' && msg.tool_call_id && toolCallIds.includes(msg.tool_call_id)) {
          toolResultMessages.push(msg);
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          // Stop at the next user or assistant message
          break;
        }
      }
    }
    
    // Combine base messages with tool results
    const messagesToFork = [...baseMessages, ...toolResultMessages];
    
    // Create a new session
    const newSessionId = crypto.randomUUID();
    
    // Save the forked messages to the new session
    try {
      const displayName = `Fork from ${state.currentSessionName || 'session'}`;
      await window.electronAPI.sessionSave(
        workingDirectory,
        newSessionId,
        messagesToFork,
        displayName,
        true, // isCustomName
        state.currentProvider?.id,
        state.currentModel?.id
      );
      
      // Load the new session
      await loadSession(newSessionId);
    } catch (error) {
      console.error('Failed to fork conversation:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to fork conversation',
      });
    }
  }, [state.isLoading, state.messages, state.currentSessionName, state.currentProvider, state.currentModel, workingDirectory, dispatch, loadSession]);

  const handleContinue = useCallback(async () => {
    if (state.isLoading) return; // Don't allow continuation while loading
    
    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select a provider and model' });
      return;
    }

    if (state.messages.length === 0) {
      return; // No messages to continue from
    }

    // Capture current messages BEFORE adding the new assistant message
    // This ensures we send the complete conversation history without the empty streaming message
    const currentMessages = [...state.messages];

    // Create a new assistant message for streaming
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
    dispatch({ type: 'START_STREAMING', payload: assistantMessageId });

    // Clear tool call tracking for new message
    addedToolCallIdsRef.current.clear();
    pendingToolCallsRef.current = [];
    executedToolCallsRef.current.clear();
    toolCallsInCurrentMessageRef.current = [];
    toolResultsAddedRef.current.clear();
    toolResultMessagesRef.current.clear();
    isContinuingAfterToolsRef.current = false;

    // Use the captured messages (before adding the new assistant message)
    // This ensures we send the complete conversation history
    const messagesToSend = currentMessages;

    // Get context length to check usage
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

    // Apply context management if we have a context total
    let finalMessagesToSend: ChatMessage[];
    if (contextTotal) {
      const contextResult = applyContextManagement(
        messagesToSend,
        null, // No system prompt for continuation
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
      lastMessageContent: finalMessagesToSend[finalMessagesToSend.length - 1]?.content?.substring(0, 50),
      hasToolMessages: finalMessagesToSend.some(m => m.role === 'tool'),
      toolMessageCount: finalMessagesToSend.filter(m => m.role === 'tool').length,
      allMessages: finalMessagesToSend.map(m => ({ role: m.role, content: m.content?.substring(0, 30) })),
    });

    try {
      // Send continuation request via IPC
      const result = await window.electronAPI.chatSendMessage({
        provider: state.currentProvider.id,
        model: state.currentModel.id,
        messages: finalMessagesToSend,
        tools: toolRegistry.getDefinitions(),
      });

      // Check if the result contains an error
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

  const handleRegenerate = useCallback(async () => {
    if (state.isLoading) return; // Don't allow regeneration while loading
    
    if (!state.currentProvider || !state.currentModel) {
      dispatch({ type: 'SET_ERROR', payload: 'Please select a provider and model' });
      return;
    }

    // Find the last assistant message
    const lastAssistantIndex = state.messages.length - 1;
    const lastMessage = state.messages[lastAssistantIndex];
    
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return; // No assistant message to regenerate
    }

    // Check if there's an assistant message with tool calls before this one
    // If so, this is likely a response to tool results, and we should just regenerate this response
    let hasToolCallsBefore = false;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        hasToolCallsBefore = true;
        break;
      }
      if (msg.role === 'user') {
        break; // Stop at user message
      }
    }

    // If the last assistant message has tool calls, or if there are tool calls before it,
    // we want to regenerate just the response after tool results
    if ((lastMessage.tool_calls && lastMessage.tool_calls.length > 0) || hasToolCallsBefore) {
      // This is a response after tool calls, just delete this assistant message and continue from tool results
      dispatch({ type: 'DELETE_MESSAGE', payload: lastMessage.id });
      
      // Wait a bit for state to update, then continue from tool results
      setTimeout(() => {
        handleContinue();
      }, 100);
      return;
    }

    // The last assistant message doesn't have tool calls and there are no tool calls before it
    // This is a regular response, so regenerate from the user message
    // Find the last user message before this assistant message
    let lastUserIndex = -1;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex < 0) {
      return; // No user message found
    }

    // Get the user message content before deleting
    const userMessageContent = state.messages[lastUserIndex].content;

    // Delete the last user message, the assistant message, and all messages after it
    // This prevents duplicate user messages when regenerating
    const messagesToDelete = state.messages.slice(lastUserIndex);
    for (const msgToDelete of messagesToDelete) {
      dispatch({ type: 'DELETE_MESSAGE', payload: msgToDelete.id });
    }
    
    // Wait a bit for state to update, then re-send
    setTimeout(() => {
      handleSendMessage(userMessageContent);
    }, 100);
  }, [state.messages, state.isLoading, state.currentProvider, state.currentModel, dispatch, handleSendMessage, handleContinue]);

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

    // Copy to clipboard
    navigator.clipboard.writeText(formatted).then(() => {
      console.log('Chat state copied to clipboard!');
      console.log(formatted);
      alert('Chat state copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      // Fallback: log to console
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

    // Load tool configurations
    toolConfigManager.loadConfigs();

    // Initialize MCP tools after directory is selected, passing the working directory
    if (workingDirectory) {
      mcpToolsManager.initialize(workingDirectory).catch(error => {
        console.error('Failed to initialize MCP tools:', error);
      });
    }
  }, [workingDirectory]);

  // Setup chat chunk listener (separate effect to handle dependencies properly)
  useEffect(() => {
    setupChatChunkListener();

    return () => {
      window.electronAPI.removeChatChunkListener();
    };
  }, [setupChatChunkListener]);

  // Restore pending permissions for tool calls that require permission but have no result
  useEffect(() => {
    if (!workingDirectory || state.messages.length === 0) return;

    const restorePendingPermissions = async () => {
      // Find all tool calls that need permission restoration
      const toolCallsToRestore: Array<{ toolCall: ToolCall; previewData?: any }> = [];

      // Find all assistant messages with tool calls
      for (const message of state.messages) {
        if (message.role !== 'assistant' || !message.tool_calls) continue;

        for (const toolCall of message.tool_calls) {
          // Check if this tool call requires permission
          if (!toolRegistry.requiresPermission(toolCall.function.name)) continue;

          // Check if there's already a result for this tool call
          const hasResult = state.messages.some(
            m => m.role === 'tool' && m.tool_call_id === toolCall.id
          );

          // Skip if we've already restored permissions for this tool call
          if (restoredPermissionsRef.current.has(toolCall.id)) continue;

          // Skip if already in pending permissions
          if (pendingPermissions.has(toolCall.id)) continue;

          // If no result, prepare to restore it
          if (!hasResult) {
            toolCallsToRestore.push({ toolCall });
          }
        }
      }

      // Generate preview data and create permission handlers for each tool call
      const newPendingPermissions = new Map(pendingPermissions);
      for (const { toolCall } of toolCallsToRestore) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Find the assistant message that contains this tool call (capture it here)
          const messageWithToolCall = state.messages.find(m => 
            m.tool_calls?.some(tc => tc.id === toolCall.id)
          );
          const allToolCallIds = messageWithToolCall?.tool_calls?.map(tc => tc.id) || [toolCall.id];
          
          // Generate preview data if needed (for write/edit tools)
          let previewData: any = undefined;
          if (toolCall.function.name === 'write' && args.file_path) {
            try {
              const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
                file_path: args.file_path,
              });
              if (readResult.success && readResult.content) {
                const lines = readResult.content.split('\n').map(line => {
                  const tabIndex = line.indexOf('\t');
                  return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
                });
                previewData = {
                  old_content: lines.join('\n'),
                  new_content: args.content,
                  file_path: args.file_path,
                };
              } else {
                previewData = {
                  old_content: null,
                  new_content: args.content,
                  file_path: args.file_path,
                };
              }
            } catch (error) {
              console.error('Failed to read file for preview:', error);
              previewData = {
                old_content: null,
                new_content: args.content,
                file_path: args.file_path,
              };
            }
          } else if (toolCall.function.name === 'edit' && args.file_path) {
            try {
              const readResult = await window.electronAPI.internalToolRead(workingDirectory, {
                file_path: args.file_path,
              });
              if (readResult.success && readResult.content) {
                const lines = readResult.content.split('\n').map(line => {
                  const tabIndex = line.indexOf('\t');
                  return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
                });
                const oldContent = lines.join('\n');
                const newContent = args.replace_all
                  ? oldContent.replace(new RegExp((args.old_string as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), args.new_string as string)
                  : oldContent.replace(args.old_string as string, args.new_string as string);
                previewData = {
                  old_content: oldContent,
                  new_content: newContent,
                  file_path: args.file_path,
                };
              }
            } catch (error) {
              console.error('Failed to read file for edit preview:', error);
            }
          }

          // Create permission handlers
          newPendingPermissions.set(toolCall.id, {
            previewData,
            onAllow: async () => {
              // Check if already executing to prevent double execution
              if (executingToolCallsRef.current.has(toolCall.id)) {
                console.log('Tool call already executing, ignoring duplicate allow:', toolCall.id);
                return;
              }
              
              // Mark as executing immediately
              executingToolCallsRef.current.add(toolCall.id);
              
              // Clear permission state immediately (before execution) to prevent UI from showing it again
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
                
                // Add tool result message
                const toolResultMessage: ChatMessage = {
                  id: `tool-result-${Date.now()}-${Math.random()}`,
                  role: 'tool',
                  content: JSON.stringify(toolResult),
                  tool_call_id: toolCall.id,
                  timestamp: Date.now(),
                };
                dispatch({ type: 'ADD_MESSAGE', payload: toolResultMessage });
                
                // Track this result for continuation logic
                toolResultsAddedRef.current.add(toolCall.id);
                toolResultMessagesRef.current.set(toolCall.id, toolResultMessage);
                
                // Remove from executing set
                executingToolCallsRef.current.delete(toolCall.id);
                
                // Check if all tool calls for this message now have results
                // We captured allToolCallIds when creating the handler
                const resultsInRef = allToolCallIds.filter(id => 
                  toolResultsAddedRef.current.has(id)
                ).length;
                
                // If all tool calls have results, continue conversation after a delay
                if (resultsInRef === allToolCallIds.length) {
                  console.log('All tool calls have results, continuing conversation...');
                  // Wait for state to update, then continue
                  setTimeout(() => {
                    handleContinue();
                  }, 300);
                } else {
                  console.log(`Waiting for more tool results: ${resultsInRef}/${allToolCallIds.length}`);
                }
              } catch (error) {
                // Remove from executing set on error too
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
                
                // Track error result as well
                toolResultsAddedRef.current.add(toolCall.id);
                toolResultMessagesRef.current.set(toolCall.id, errorMessage);
                
                // Check if all tool calls for this message now have results (including errors)
                // Use the captured allToolCallIds from the handler closure
                const resultsInRef = allToolCallIds.filter(id => 
                  toolResultsAddedRef.current.has(id)
                ).length;
                
                // If all tool calls have results (including errors), continue conversation
                if (resultsInRef === allToolCallIds.length) {
                  console.log('All tool calls have results (including errors), continuing conversation...');
                  setTimeout(() => {
                    handleContinue();
                  }, 300);
                } else {
                  console.log(`Waiting for more tool results after error: ${resultsInRef}/${allToolCallIds.length}`);
                }
              } finally {
                // Ensure we always remove from executing set
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
              restoredPermissionsRef.current.add(toolCall.id);
              // Add a denied result message so the conversation can continue
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
          });
          
          restoredPermissionsRef.current.add(toolCall.id);
        } catch (error) {
          console.error('Failed to restore pending permission for tool call:', toolCall.id, error);
        }
      }

      // Update pending permissions if we found any to restore
      if (toolCallsToRestore.length > 0) {
        setPendingPermissions(newPendingPermissions);
      }
    };

    restorePendingPermissions();
  }, [state.messages, workingDirectory, dispatch, pendingPermissions]); // Only run when messages or workingDirectory changes

  // Global keyboard shortcuts
  useEffect(() => {
    // Detect if we're on Mac (check once per effect)
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;
      
      // CTRL/CMD+C - Continue
      if (modifierKey && e.key === 'c' && !state.isLoading) {
        // Only prevent default if no text is selected (to preserve copy functionality)
        const selection = window.getSelection();
        const hasSelection = selection && selection.toString().length > 0;
        if (!hasSelection) {
          e.preventDefault();
          handleContinue();
        }
      }
      
      // CTRL/CMD+R - Regenerate
      if (modifierKey && e.key === 'r' && !state.isLoading) {
        // Always prevent default to stop browser reload
        e.preventDefault();
        e.stopPropagation();
        handleRegenerate();
      }
      
      // CTRL/CMD+, - Settings
      if (modifierKey && e.key === ',') {
        e.preventDefault();
        onOpenSettings();
      }
      
      // CTRL/CMD+T - New Session
      if (modifierKey && e.key === 't' && !state.isLoading) {
        // Prevent default browser behavior (new tab)
        e.preventDefault();
        e.stopPropagation();
        handleNewSession();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [state.isLoading, handleContinue, handleRegenerate, onOpenSettings, handleNewSession]);

  // Update context usage when provider, model, messages, or virtual context size change
  // Use a ref pattern to avoid infinite loops from including updateContextUsage in deps
  const updateContextUsageRef = useRef(updateContextUsage);
  updateContextUsageRef.current = updateContextUsage;

  // Track previous values to avoid unnecessary updates
  const prevProviderIdRef = useRef<string | undefined>(undefined);
  const prevModelIdRef = useRef<string | undefined>(undefined);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevVirtualContextSizeRef = useRef<number | null>(null);
  const prevContextModeRef = useRef<'rolling' | 'halt'>('rolling');
  // Track total content length to detect content changes during streaming
  const prevMessagesContentLengthRef = useRef<number>(0);

  useEffect(() => {
    // Calculate total content length to detect changes during streaming
    const messagesContentLength = state.messages.reduce((sum, msg) => {
      return sum + (msg.content?.length || 0) + (msg.tool_calls?.length || 0) * 100; // Rough estimate for tool calls
    }, 0);

    // Only update if something actually changed
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
      updateContextUsageRef.current();
    }
  }, [state.currentProvider?.id, state.currentModel?.id, state.messages, virtualContextSize, contextMode]);

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
        {/* Header with working directory and settings */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: '1px solid rgba(205, 214, 244, 0.1)',
          flexShrink: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace' }}>
              {displayPath}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              value={state.currentSessionName}
              onChange={(e) => updateSessionName(e.target.value)}
              placeholder="Session name"
              size="small"
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: {
                  color: '#cdd6f4',
                  fontSize: '0.875rem',
                  maxWidth: 200,
                  '& input': {
                    padding: '4px 8px',
                    textOverflow: 'ellipsis',
                    '&::placeholder': {
                      color: 'rgba(205, 214, 244, 0.4)',
                      opacity: 1,
                    }
                  }
                }
              }}
              sx={{
                '& .MuiInput-root': {
                  backgroundColor: 'rgba(205, 214, 244, 0.05)',
                  borderRadius: '4px',
                  '&:hover': {
                    backgroundColor: 'rgba(205, 214, 244, 0.08)',
                  },
                  '&.Mui-focused': {
                    backgroundColor: 'rgba(205, 214, 244, 0.1)',
                  }
                }
              }}
            />
            <IconButton
              onClick={handleNewSession}
              disabled={state.isLoading}
              title={`New session (${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+T)`}
              sx={{
                color: '#cdd6f4',
                '&:hover': {
                  backgroundColor: 'rgba(205, 214, 244, 0.1)',
                },
                '&:disabled': {
                  color: 'rgba(205, 214, 244, 0.3)',
                },
              }}
            >
              <FilePlus size={18} />
            </IconButton>
            <IconButton
              onClick={handleOpenSessionMenu}
              disabled={state.isLoading}
              title="Session management"
              sx={{
                color: '#cdd6f4',
                '&:hover': {
                  backgroundColor: 'rgba(205, 214, 244, 0.1)',
                },
                '&:disabled': {
                  color: 'rgba(205, 214, 244, 0.3)',
                },
              }}
            >
              <SegmentIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton
              onClick={exportChatState}
              title="Export chat state to clipboard"
              sx={{
                color: '#cdd6f4',
                '&:hover': {
                  backgroundColor: 'rgba(205, 214, 244, 0.1)',
                },
              }}
            >
              <Download size={18} />
            </IconButton>
            <IconButton
              onClick={() => onOpenSettings()}
              title={`Settings (${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+,)`}
              sx={{
                color: '#cdd6f4',
                '&:hover': {
                  backgroundColor: 'rgba(205, 214, 244, 0.1)',
                },
              }}
            >
              <Settings size={18} />
            </IconButton>
            <IconButton
              onClick={() => setToolsPanelCollapsed(!toolsPanelCollapsed)}
              sx={{
                color: '#89b4fa',
                '&:hover': {
                  backgroundColor: 'rgba(137, 180, 250, 0.1)',
                },
              }}
            >
              <Badge
                variant="dot"
                invisible={!hasStartingServers}
                sx={{
                  '& .MuiBadge-dot': {
                    backgroundColor: '#f9e2af',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    border: '1.5px solid #1e1e2e',
                  },
                }}
              >
                <Wrench size={18} />
              </Badge>
            </IconButton>
          </Box>

          {/* Session Menu */}
          <Menu
            anchorEl={sessionMenuAnchor}
            open={Boolean(sessionMenuAnchor)}
            onClose={handleCloseSessionMenu}
            PaperProps={{
              sx: {
                backgroundColor: '#313244',
                color: '#cdd6f4',
                minWidth: 500,
                maxHeight: '70vh',
              }
            }}
            MenuListProps={{
              sx: {
                py: 0.5,
                px: 0.5,
              }
            }}
          >
            {sessions.map((session) => {
              const isCurrentSession = session.id === state.currentSessionId;
              const date = new Date(session.lastModified);
              const formattedDate = date.toLocaleString();
              const displayName = getSessionDisplayName(session.id, session.name, session.isCustomName);

              return (
                <MenuItem
                  key={session.id}
                  onClick={() => handleLoadSession(session.id)}
                  disabled={isCurrentSession}
                  sx={{
                    py: 0,
                    px: 0.5,
                    minHeight: 'unset',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    '&:hover': {
                      backgroundColor: 'rgba(137, 180, 250, 0.1)',
                    },
                    '&.Mui-disabled': {
                      opacity: 0.6,
                    },
                  }}
                >
                  <ListItemText
                    primary={displayName}
                    secondary={`${formattedDate} • ${session.messageCount} messages${isCurrentSession ? ' (current)' : ''}`}
                    primaryTypographyProps={{
                      sx: {
                        color: '#cdd6f4',
                        fontSize: '0.9rem',
                        lineHeight: 1.3,
                        mb: 0.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }
                    }}
                    secondaryTypographyProps={{
                      sx: { color: 'rgba(205, 214, 244, 0.6)', fontSize: '0.75rem', ml: 0.25, lineHeight: 1.3 }
                    }}
                    sx={{ my: 0.5 }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteSessionClick(session.id, e)}
                    sx={{
                      color: 'rgba(243, 139, 168, 0.6)',
                      ml: 1,
                      '&:hover': {
                        color: '#f38ba8',
                        backgroundColor: 'rgba(243, 139, 168, 0.1)',
                      },
                    }}
                  >
                    <X size={16} />
                  </IconButton>
                </MenuItem>
              );
            })}
            {sessions.length > 0 && [
              <Divider key="divider" sx={{ borderColor: 'rgba(205, 214, 244, 0.1)', my: 0.5 }} />,
              <MenuItem
                key="clear-all"
                onClick={handleClearAllSessionsClick}
                sx={{
                  py: 0.5,
                  px: 0.5,
                  minHeight: 'unset',
                  color: 'rgba(243, 139, 168, 0.8)',
                  '&:hover': {
                    backgroundColor: 'rgba(243, 139, 168, 0.1)',
                  },
                }}
              >
                <Trash2 size={16} style={{ marginRight: 8 }} />
                Clear All Sessions
              </MenuItem>
            ]}
          </Menu>

          {/* Delete Session Confirmation Dialog */}
          <Dialog
            open={deleteConfirmOpen}
            onClose={handleDeleteSessionCancel}
            PaperProps={{
              sx: {
                backgroundColor: '#313244',
                color: '#cdd6f4',
              }
            }}
          >
            <DialogTitle sx={{ color: '#cdd6f4' }}>Delete Session?</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ color: 'rgba(205, 214, 244, 0.8)' }}>
                Are you sure you want to delete this session? This action cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={handleDeleteSessionCancel}
                sx={{
                  color: 'rgba(205, 214, 244, 0.7)',
                  '&:hover': {
                    backgroundColor: 'rgba(205, 214, 244, 0.1)',
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteSessionConfirm}
                sx={{
                  color: '#f38ba8',
                  '&:hover': {
                    backgroundColor: 'rgba(243, 139, 168, 0.1)',
                  }
                }}
                autoFocus
              >
                Delete
              </Button>
            </DialogActions>
          </Dialog>

          {/* Clear All Sessions Confirmation Dialog */}
          <Dialog
            open={clearAllConfirmOpen}
            onClose={handleClearAllSessionsCancel}
            PaperProps={{
              sx: {
                backgroundColor: '#313244',
                color: '#cdd6f4',
              }
            }}
          >
            <DialogTitle sx={{ color: '#cdd6f4' }}>Clear All Sessions?</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ color: 'rgba(205, 214, 244, 0.8)' }}>
                Are you sure you want to delete all sessions? This will remove all chat history for this project. This action cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={handleClearAllSessionsCancel}
                sx={{
                  color: 'rgba(205, 214, 244, 0.7)',
                  '&:hover': {
                    backgroundColor: 'rgba(205, 214, 244, 0.1)',
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleClearAllSessionsConfirm}
                sx={{
                  color: '#f38ba8',
                  '&:hover': {
                    backgroundColor: 'rgba(243, 139, 168, 0.1)',
                  }
                }}
                autoFocus
              >
                Clear All
              </Button>
            </DialogActions>
          </Dialog>
        </Box>

        {/* Error display */}
        {state.error && (
          <Box sx={{
            p: 2,
            backgroundColor: 'rgba(243, 139, 168, 0.1)',
            borderBottom: '1px solid rgba(243, 139, 168, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}>
            <Typography variant="body2" sx={{ color: '#f38ba8', flexGrow: 1 }}>
              Error: {state.error}
            </Typography>
            <IconButton
              size="small"
              onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
              sx={{
                color: '#f38ba8',
                p: 0.5,
                '&:hover': {
                  backgroundColor: 'rgba(243, 139, 168, 0.2)',
                },
              }}
              title="Dismiss error"
            >
              <X size={16} />
            </IconButton>
          </Box>
        )}

        {/* Message list */}
        <MessageList 
          messages={state.messages} 
          isLoading={state.isLoading} 
          pendingPermissions={pendingPermissions} 
          toolCallStatuses={toolCallStatuses}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onRegenerate={handleRegenerate}
          onContinue={handleContinue}
          onFork={handleFork}
        />

        {/* Input box */}
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

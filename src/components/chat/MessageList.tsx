import { Box, Typography, Collapse, IconButton, keyframes, TextField } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types/chat';
import { ToolResultDisplay } from './ToolResultDisplay';
import { MarkdownMessage } from './MarkdownMessage';
import { Brain, ChevronDown, ChevronRight, Edit2, Trash2, RotateCw, Check, X, ArrowRight, GitBranch } from 'lucide-react';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  pendingPermissions?: Map<string, {
    onAllow: () => void;
    onDeny: () => void;
    previewData?: any;
  }>;
  toolCallStatuses?: Map<string, 'denied' | 'allowed'>;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onFork?: (messageId: string) => void;
}

// Keyframes for the dot animation
const dotPulse = keyframes`
  0%, 20% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.3;
  }
`;

function LoadingIndicator() {
  return (
    <Box sx={{
      display: 'flex',
      gap: 0.5,
      alignItems: 'center',
      py: 1,
    }}>
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#a6e3a1',
            animation: `${dotPulse} 1.4s ease-in-out infinite`,
            animationDelay: `${index * 0.2}s`,
          }}
        />
      ))}
    </Box>
  );
}

export function MessageList({ messages, isLoading, pendingPermissions, toolCallStatuses, onEditMessage, onDeleteMessage, onRegenerate, onContinue, onFork }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or permissions are requested
  useEffect(() => {
    // Use setTimeout to wait for animations/expansions to complete
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading, pendingPermissions]);

  // Check if we should show the loading indicator
  // Show it when isLoading is true AND the last assistant message has no content yet
  const shouldShowLoading = isLoading && messages.length > 0 &&
    messages[messages.length - 1]?.role === 'assistant' &&
    !messages[messages.length - 1]?.content &&
    (!messages[messages.length - 1]?.tool_calls || messages[messages.length - 1]?.tool_calls?.length === 0);

  // Find the last assistant message (for regenerate button)
  const lastAssistantMessage = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant'
    ? messages[messages.length - 1]
    : null;
  
  // Find the last non-tool message (for continue button)
  // Tool messages are not rendered, so we need to find the last visible message
  let lastVisibleMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'tool') {
      lastVisibleMessage = messages[i];
      break;
    }
  }

  return (
    <Box sx={{
      flexGrow: 1,
      overflowY: 'auto',
      p: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      {messages.length === 0 ? (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          <Typography variant="body1" sx={{ color: 'rgba(205, 214, 244, 0.5)' }}>
            Start a conversation...
          </Typography>
        </Box>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBlock
              key={message.id}
              message={message}
              allMessages={messages}
              pendingPermissions={pendingPermissions}
              toolCallStatuses={toolCallStatuses}
              onEditMessage={onEditMessage}
              onDeleteMessage={onDeleteMessage}
              isLastAssistant={lastAssistantMessage?.id === message.id && !isLoading}
              onRegenerate={onRegenerate}
              isLastMessage={lastVisibleMessage?.id === message.id && !isLoading}
              onContinue={onContinue}
              onFork={onFork}
              isLoading={isLoading}
            />
          ))}
          {shouldShowLoading && (
            <Box sx={{
              display: 'flex',
              gap: 0,
              alignItems: 'flex-start',
            }}>
              <Box sx={{
                flexGrow: 1,
                minWidth: 0,
                borderLeft: `4px solid #a6e3a1`,
                pl: 2,
              }}>
                <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5 }}>
                  Assistant
                </Typography>
                <LoadingIndicator />
              </Box>
            </Box>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </Box>
  );
}

function MessageBlock({ message, allMessages, pendingPermissions, toolCallStatuses, onEditMessage, onDeleteMessage, isLastAssistant, onRegenerate, isLastMessage, onContinue, onFork, isLoading }: {
  message: ChatMessage;
  allMessages: ChatMessage[];
  pendingPermissions?: Map<string, {
    onAllow: () => void;
    onDeny: () => void;
  }>;
  toolCallStatuses?: Map<string, 'denied' | 'allowed'>;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  isLastAssistant?: boolean;
  onRegenerate?: () => void;
  isLastMessage?: boolean;
  onContinue?: () => void;
  onFork?: (messageId: string) => void;
  isLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  // Check if this tool message is orphaned (no corresponding assistant message with tool_calls)
  if (isTool) {
    // Find if there's an assistant message that has this tool call
    const hasParentAssistant = allMessages.some(m => 
      m.role === 'assistant' && 
      m.tool_calls && 
      m.tool_calls.some(tc => tc.id === message.tool_call_id)
    );
    
    // If orphaned, show it as a standalone tool result
    if (!hasParentAssistant) {
      let parsedResult;
      try {
        parsedResult = JSON.parse(message.content);
      } catch {
        parsedResult = message.content;
      }
      
      return (
        <Box sx={{
          display: 'flex',
          gap: 0,
          alignItems: 'flex-start',
          position: 'relative',
        }}>
          <Box sx={{ 
            flexGrow: 1, 
            minWidth: 0,
            borderLeft: `4px solid #f9e2af`,
            pl: 2,
          }}>
            <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5 }}>
              Tool Result (orphaned)
            </Typography>
            <ToolResultDisplay
              toolCallName="Unknown"
              toolCallArgs={{}}
              result={parsedResult}
              isPendingPermission={false}
            />
          </Box>
        </Box>
      );
    }
    
    // Otherwise, don't render - it will be shown with its tool call
    return null;
  }

  // Don't render empty assistant messages - they'll be shown by the loading indicator
  if (message.role === 'assistant' && !message.content && (!message.tool_calls || message.tool_calls.length === 0)) {
    return null;
  }

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(message.content);
  };

  const handleSaveEdit = () => {
    if (onEditMessage && editContent !== message.content) {
      onEditMessage(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDeleteMessage) {
      onDeleteMessage(message.id);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    }
  };

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    }
  };

  const handleFork = () => {
    if (onFork) {
      onFork(message.id);
    }
  };

  return (
    <Box 
      sx={{
        display: 'flex',
        gap: 0,
        alignItems: 'flex-start',
        position: 'relative',
      }}
    >
      {/* Message content with left border */}
      <Box sx={{ 
        flexGrow: 1, 
        minWidth: 0,
        borderLeft: `4px solid ${isUser ? '#89b4fa' : '#a6e3a1'}`,
        pl: 2,
        position: 'relative',
      }}>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5 }}>
          {isUser ? 'You' : 'Assistant'}
        </Typography>

        {/* Thinking/Reasoning (if present) */}
        {message.thinking && (
          <Box sx={{
            mb: 1,
            border: '1px solid rgba(245, 194, 231, 0.3)',
            borderRadius: 1,
            backgroundColor: 'rgba(245, 194, 231, 0.05)',
            overflow: 'hidden',
          }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'rgba(245, 194, 231, 0.1)',
                },
              }}
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
            >
              <IconButton size="small" sx={{ color: '#f5c2e7', p: 0 }}>
                {thinkingExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </IconButton>
              <Brain size={16} color="#f5c2e7" />
              <Typography variant="body2" sx={{ color: '#f5c2e7', fontWeight: 500 }}>
                Thinking
              </Typography>
            </Box>
            <Collapse in={thinkingExpanded}>
              <Box sx={{ p: 1.5, pt: 0 }}>
                <Box sx={{
                  backgroundColor: '#1e1e2e',
                  borderRadius: 0.5,
                  p: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: 'rgba(205, 214, 244, 0.8)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {message.thinking}
                </Box>
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Main content */}
        {isEditing ? (
          <TextField
            fullWidth
            multiline
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                handleCancelEdit();
              }
            }}
            autoFocus
            sx={{
              mt: 1,
              '& .MuiOutlinedInput-root': {
                color: '#cdd6f4',
                backgroundColor: 'rgba(205, 214, 244, 0.05)',
                '& fieldset': {
                  borderColor: 'rgba(205, 214, 244, 0.2)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(205, 214, 244, 0.3)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#89b4fa',
                },
              },
            }}
          />
        ) : (
          message.content && (
            <Box sx={{ wordBreak: 'break-word' }}>
              <MarkdownMessage content={message.content} />
            </Box>
          )
        )}

        {/* Tool calls with their results */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {message.tool_calls.map((toolCall, index) => {
              let args;
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {
                args = toolCall.function.arguments;
              }

              // Find the corresponding tool result
              const toolResult = allMessages.find(
                m => m.role === 'tool' && m.tool_call_id === toolCall.id
              );

              let parsedResult;
              if (toolResult) {
                try {
                  parsedResult = JSON.parse(toolResult.content);
                } catch {
                  parsedResult = toolResult.content;
                }
              }

              // Check if this tool call is pending permission
              // But if we already have a tool result, don't show the permission prompt
              // (this prevents showing the prompt after execution due to async state updates)
              const pendingPermission = toolResult ? undefined : pendingPermissions?.get(toolCall.id);
              const status = toolCallStatuses?.get(toolCall.id);

              return (
                <ToolResultDisplay
                  key={toolCall.id || index}
                  toolCallName={toolCall.function.name}
                  toolCallArgs={args}
                  result={parsedResult}
                  isPendingPermission={!!pendingPermission}
                  onPermissionAllow={pendingPermission?.onAllow}
                  onPermissionDeny={pendingPermission?.onDeny}
                  previewData={pendingPermission && 'previewData' in pendingPermission ? pendingPermission.previewData : undefined}
                  permissionStatus={status}
                />
              );
            })}
          </Box>
        )}

        {/* Action buttons - always visible at bottom right */}
        <Box sx={{ 
          display: 'flex', 
          gap: 0.5, 
          alignItems: 'center',
          justifyContent: 'flex-end',
          mt: 1,
          pt: 0.5,
        }}>
          {isEditing ? (
            <>
              <IconButton
                size="small"
                onClick={handleSaveEdit}
                sx={{
                  color: '#a6e3a1',
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(166, 227, 161, 0.1)',
                  },
                }}
              >
                <Check size={14} />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleCancelEdit}
                sx={{
                  color: '#f38ba8',
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(243, 139, 168, 0.1)',
                  },
                }}
              >
                <X size={14} />
              </IconButton>
            </>
              ) : (
                <>
                  {isLastMessage && onContinue && (
                    <IconButton
                      size="small"
                      onClick={handleContinue}
                      disabled={isLoading}
                      sx={{
                        color: 'rgba(205, 214, 244, 0.5)',
                        p: 0.5,
                        '&:hover': {
                          color: '#89b4fa',
                          backgroundColor: 'rgba(137, 180, 250, 0.1)',
                        },
                        '&:disabled': {
                          color: 'rgba(205, 214, 244, 0.2)',
                        },
                      }}
                      title={`Continue conversation (${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+C)`}
                    >
                      <ArrowRight size={14} />
                    </IconButton>
                  )}
                  {isLastAssistant && onRegenerate && (
                    <IconButton
                      size="small"
                      onClick={handleRegenerate}
                      disabled={isLoading}
                      sx={{
                        color: 'rgba(205, 214, 244, 0.5)',
                        p: 0.5,
                        '&:hover': {
                          color: '#a6e3a1',
                          backgroundColor: 'rgba(166, 227, 161, 0.1)',
                        },
                        '&:disabled': {
                          color: 'rgba(205, 214, 244, 0.2)',
                        },
                      }}
                      title={`Regenerate response (${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl'}+R)`}
                    >
                      <RotateCw size={14} />
                    </IconButton>
                  )}
                  {onFork && (
                    <IconButton
                      size="small"
                      onClick={handleFork}
                      disabled={isLoading}
                      sx={{
                        color: 'rgba(205, 214, 244, 0.5)',
                        p: 0.5,
                        '&:hover': {
                          color: '#f9e2af',
                          backgroundColor: 'rgba(249, 226, 175, 0.1)',
                        },
                        '&:disabled': {
                          color: 'rgba(205, 214, 244, 0.2)',
                        },
                      }}
                      title="Fork conversation from this message"
                    >
                      <GitBranch size={14} />
                    </IconButton>
                  )}
                  {onEditMessage && (
                    <IconButton
                      size="small"
                      onClick={handleEdit}
                      disabled={isLoading}
                      sx={{
                        color: 'rgba(205, 214, 244, 0.5)',
                        p: 0.5,
                        '&:hover': {
                          color: '#89b4fa',
                          backgroundColor: 'rgba(137, 180, 250, 0.1)',
                        },
                        '&:disabled': {
                          color: 'rgba(205, 214, 244, 0.2)',
                        },
                      }}
                      title="Edit message"
                    >
                      <Edit2 size={14} />
                    </IconButton>
                  )}
                  {onDeleteMessage && (
                    <IconButton
                      size="small"
                      onClick={handleDelete}
                      disabled={isLoading}
                      sx={{
                        color: 'rgba(205, 214, 244, 0.5)',
                        p: 0.5,
                        '&:hover': {
                          color: '#f38ba8',
                          backgroundColor: 'rgba(243, 139, 168, 0.1)',
                        },
                        '&:disabled': {
                          color: 'rgba(205, 214, 244, 0.2)',
                        },
                      }}
                      title="Delete message"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </>
              )}
        </Box>
      </Box>
    </Box>
  );
}

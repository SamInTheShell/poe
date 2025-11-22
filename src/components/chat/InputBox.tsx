import { Box, TextField, Select, MenuItem, FormControl, ListSubheader, Typography } from '@mui/material';
import { FileText, Settings as SettingsIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { ProviderConfig, ModelConfig } from '../../types/chat';

// Helper function to format context usage
function formatContextUsage(used: number, total: number): string {
  const formatNumber = (n: number): string => {
    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    } else if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}k`;
    }
    return n.toString();
  };

  const usedFormatted = formatNumber(used);
  const totalFormatted = formatNumber(total);
  const percentage = ((used / total) * 100).toFixed(1);

  return `${usedFormatted}/${totalFormatted} (${percentage}%)`;
}

interface InputBoxProps {
  onSendMessage: (message: string, systemPrompt?: string) => void;
  onCancelMessage: () => void;
  isLoading: boolean;
  currentProvider: ProviderConfig | null;
  currentModel: ModelConfig | null;
  providers: ProviderConfig[];
  onProviderChange: (provider: ProviderConfig) => void;
  onModelChange: (model: ModelConfig) => void;
  onProviderAndModelChange: (provider: ProviderConfig, model: ModelConfig) => void;
  onOpenSettings?: (tab?: string | number) => void;
  focusTrigger?: number;
  contextUsage: {
    used: number;
    total: number;
  } | null;
  workingDirectory: string;
  virtualContextSize: number | null;
  onVirtualContextSizeChange: (size: number | null) => void;
}

export function InputBox({
  onSendMessage,
  onCancelMessage,
  isLoading,
  currentProvider,
  currentModel,
  providers,
  onProviderAndModelChange,
  onOpenSettings,
  focusTrigger,
  contextUsage,
  workingDirectory,
  virtualContextSize,
  onVirtualContextSizeChange,
}: InputBoxProps) {
  const [input, setInput] = useState('');
  const [prompts, setPrompts] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [contextMode, setContextMode] = useState<'rolling' | 'halt'>('rolling');
  const [isEditingContextSize, setIsEditingContextSize] = useState(false);
  const contextSizeInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  // Load context mode when working directory changes
  useEffect(() => {
    if (workingDirectory) {
      loadContextMode();
    } else {
      // Reset to default when no working directory
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
      // Default to rolling on error
      setContextMode('rolling');
    }
  };

  const handleContextModeChange = async (mode: 'rolling' | 'halt') => {
    setContextMode(mode);
    
    if (workingDirectory) {
      try {
        await window.electronAPI.projectContextModeWrite(workingDirectory, mode);
      } catch (error) {
        console.error('Failed to save context mode:', error);
      }
    }
  };

  // Focus input on mount (when chat view is shown)
  useEffect(() => {
    // Use setTimeout to ensure the input is fully rendered and ready
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  // Focus input when loading state changes (i.e., when AI finishes responding)
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  // Focus input when focusTrigger changes (when navigating back to chat)
  useEffect(() => {
    if (focusTrigger !== undefined && focusTrigger > 0 && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [focusTrigger]);

  // Global SHIFT+ENTER handler to focus input when not focused
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // SHIFT+ENTER - Focus input if not already focused
      if (e.shiftKey && e.key === 'Enter') {
        // Check if input is not focused
        if (inputRef.current && document.activeElement !== inputRef.current) {
          // Check if we're not in another input/textarea
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
            e.preventDefault();
            inputRef.current.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Global Escape key listener for canceling generation
  useEffect(() => {
    if (!isLoading) return;

    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelMessage();
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleGlobalKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isLoading, onCancelMessage]);

  const loadPrompts = async () => {
    // Ensure default prompt exists
    await initializeDefaultPrompt();

    const result = await window.electronAPI.promptsList();
    if (result.success) {
      setPrompts(result.prompts);

      // Restore last selected prompt if it still exists
      const lastSelected = localStorage.getItem('lastSelectedPrompt');
      if (lastSelected && result.prompts.includes(lastSelected)) {
        setSelectedPrompt(lastSelected);
      } else if (result.prompts.includes('Default')) {
        // If no last selected prompt, auto-select "Default"
        setSelectedPrompt('Default');
        localStorage.setItem('lastSelectedPrompt', 'Default');
      }
    }
  };

  const initializeDefaultPrompt = async () => {
    const listResult = await window.electronAPI.promptsList();
    if (listResult.success && !listResult.prompts.includes('Default')) {
      // Create default system prompt
      const defaultContent = `You are a helpful AI assistant with expertise in software development and coding tasks.

You have access to various tools to help with development:
- Read, write, and edit files in the project
- Search for files and content using glob patterns and grep
- Execute bash commands
- Manage files and directories

When working on tasks:
- Be thorough and precise in your responses
- Use the available tools effectively to complete tasks
- Ask clarifying questions when requirements are unclear
- Provide clear explanations of your changes and decisions`;

      await window.electronAPI.promptsWrite('Default', defaultContent);
    }
  };

  const handlePromptChange = (value: string) => {
    setSelectedPrompt(value);
    // Save selection to localStorage
    if (value) {
      localStorage.setItem('lastSelectedPrompt', value);
    } else {
      localStorage.removeItem('lastSelectedPrompt');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentProvider || !currentModel) return;

    // Load the system prompt content if one is selected
    let systemPromptContent: string | undefined;
    if (selectedPrompt) {
      const result = await window.electronAPI.promptsRead(selectedPrompt);
      if (result.success && result.content) {
        systemPromptContent = result.content;
      }
    }

    onSendMessage(input.trim(), systemPromptContent);
    setInput('');
  };

  const handleCancel = () => {
    onCancelMessage();
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && isLoading) {
      e.preventDefault();
      handleCancel();
    }
  };

  // Create a combined value for the current selection
  const currentValue = currentProvider && currentModel
    ? `${currentProvider.id}/${currentModel.id}`
    : '';

  // Create display text for the selected model
  const getDisplayText = (value: string) => {
    // Split only on the first '/' to separate provider from model
    const firstSlashIndex = value.indexOf('/');
    if (firstSlashIndex === -1) return '';

    const providerId = value.substring(0, firstSlashIndex);
    const modelId = value.substring(firstSlashIndex + 1);

    const provider = providers.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);
    if (provider && model) {
      return `${provider.name}/${model.name}`;
    }
    return '';
  };

  const handleModelSelection = (value: string) => {
    // Split only on the first '/' to separate provider from model
    const firstSlashIndex = value.indexOf('/');
    if (firstSlashIndex === -1) return;

    const providerId = value.substring(0, firstSlashIndex);
    const modelId = value.substring(firstSlashIndex + 1);

    const provider = providers.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);

    if (provider && model) {
      onProviderAndModelChange(provider, model);
    }
  };

  return (
    <Box sx={{
      borderTop: '1px solid rgba(205, 214, 244, 0.1)',
      p: 2,
      backgroundColor: '#1e1e2e',
    }}>
      {/* Selectors row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
        {/* Combined Provider/Model selector */}
        <FormControl size="small" sx={{ minWidth: 300 }}>
          <Select
            value={currentValue}
            onChange={(e) => handleModelSelection(e.target.value)}
            displayEmpty
            renderValue={(selected) => {
              if (!selected) {
                return <span style={{ color: 'rgba(205, 214, 244, 0.5)' }}>Select a model...</span>;
              }
              return getDisplayText(selected);
            }}
            sx={{
              color: '#cdd6f4',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.2)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.3)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#89b4fa',
              },
              '& .MuiSelect-icon': {
                color: '#cdd6f4',
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: '#313244',
                  color: '#cdd6f4',
                  '& .MuiMenuItem-root': {
                    minHeight: 'auto',
                    lineHeight: 1.2,
                    py: 0.5,
                    fontSize: '14px',
                    '&:hover': {
                      backgroundColor: 'rgba(137, 180, 250, 0.1)',
                    },
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(137, 180, 250, 0.2)',
                      '&:hover': {
                        backgroundColor: 'rgba(137, 180, 250, 0.25)',
                      },
                    },
                  },
                  '& .MuiListSubheader-root': {
                    backgroundColor: '#1e1e2e',
                    color: '#89b4fa',
                    fontWeight: 600,
                    lineHeight: '24px',
                    py: 0.75,
                  },
                },
              },
            }}
          >
            {providers.filter(p => p.enabled).map(provider => {
              const chatModels = provider.models.filter(m => m.type === 'chat');
              if (chatModels.length === 0) return null;

              return [
                <ListSubheader key={`header-${provider.id}`}>
                  {provider.name}
                </ListSubheader>,
                ...chatModels.map(model => (
                  <MenuItem
                    key={`${provider.id}/${model.id}`}
                    value={`${provider.id}/${model.id}`}
                    sx={{ pl: 4 }}
                  >
                    {model.name}
                  </MenuItem>
                ))
              ];
            })}
            {onOpenSettings && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings('providers');
                }}
                sx={{
                  borderTop: '1px solid rgba(205, 214, 244, 0.2)',
                  mt: 1.5,
                  pt: 1.5,
                  color: '#89b4fa',
                  display: 'flex',
                  gap: 1,
                }}
              >
                <SettingsIcon size={14} />
                Configure Providers
              </MenuItem>
            )}
          </Select>
        </FormControl>

        {/* System Prompt selector */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select
            value={selectedPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            displayEmpty
            renderValue={(selected) => {
              if (!selected) {
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FileText size={14} />
                    <span style={{ color: 'rgba(205, 214, 244, 0.5)' }}>System Prompt</span>
                  </Box>
                );
              }
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <FileText size={14} />
                  {selected}
                </Box>
              );
            }}
            sx={{
              color: '#cdd6f4',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.2)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.3)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#89b4fa',
              },
              '& .MuiSelect-icon': {
                color: '#cdd6f4',
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: '#313244',
                  color: '#cdd6f4',
                  '& .MuiMenuItem-root': {
                    minHeight: 'auto',
                    lineHeight: 1.2,
                    py: 0.5,
                    fontSize: '14px',
                    '&:hover': {
                      backgroundColor: 'rgba(137, 180, 250, 0.1)',
                    },
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(137, 180, 250, 0.2)',
                      '&:hover': {
                        backgroundColor: 'rgba(137, 180, 250, 0.25)',
                      },
                    },
                  },
                },
              },
            }}
          >
            {prompts.map((prompt) => (
              <MenuItem key={prompt} value={prompt}>
                {prompt}
              </MenuItem>
            ))}
            {onOpenSettings && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings('prompts');
                }}
                sx={{
                  borderTop: '1px solid rgba(205, 214, 244, 0.2)',
                  mt: 1.5,
                  pt: 1.5,
                  color: '#89b4fa',
                  display: 'flex',
                  gap: 1,
                }}
              >
                <SettingsIcon size={14} />
                Manage Prompts
              </MenuItem>
            )}
          </Select>
        </FormControl>

        {/* Context Mode selector */}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select
            value={contextMode}
            onChange={(e) => handleContextModeChange(e.target.value as 'rolling' | 'halt')}
            sx={{
              color: '#cdd6f4',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.2)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(205, 214, 244, 0.3)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#89b4fa',
              },
              '& .MuiSelect-icon': {
                color: '#cdd6f4',
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: '#313244',
                  color: '#cdd6f4',
                  '& .MuiMenuItem-root': {
                    minHeight: 'auto',
                    lineHeight: 1.2,
                    py: 0.5,
                    fontSize: '14px',
                    '&:hover': {
                      backgroundColor: 'rgba(137, 180, 250, 0.1)',
                    },
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(137, 180, 250, 0.2)',
                      '&:hover': {
                        backgroundColor: 'rgba(137, 180, 250, 0.25)',
                      },
                    },
                  },
                },
              },
            }}
          >
            <MenuItem value="rolling">Rolling Context</MenuItem>
            <MenuItem value="halt">Halting Context</MenuItem>
          </Select>
        </FormControl>

        {/* Spacer to push context usage to the right */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Context usage display */}
        {contextUsage && (
          isEditingContextSize ? (
            <TextField
              inputRef={contextSizeInputRef}
              size="small"
              defaultValue={virtualContextSize ?? contextUsage.total}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value === '') {
                  // Empty value - revert to default
                  onVirtualContextSizeChange(null);
                } else {
                  const numValue = parseInt(value, 10);
                  if (!isNaN(numValue) && numValue > 0) {
                    // Valid value - save virtual context size
                    onVirtualContextSizeChange(numValue);
                  } else {
                    // Invalid value - revert to current virtual or default
                    onVirtualContextSizeChange(null);
                  }
                }
                setIsEditingContextSize(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Use setTimeout to ensure blur happens after keydown event completes
                  // This allows the blur handler to properly read the input value
                  setTimeout(() => {
                    (e.target as HTMLInputElement).blur();
                  }, 0);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onVirtualContextSizeChange(null);
                  setIsEditingContextSize(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              autoFocus
              sx={{
                width: 120,
                '& .MuiInputBase-input': {
                  color: 'rgba(205, 214, 244, 0.4)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  padding: '4px 8px',
                },
                '& .MuiOutlinedInput-root': {
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
            <Typography
              onDoubleClick={() => setIsEditingContextSize(true)}
              sx={{
                color: 'rgba(205, 214, 244, 0.4)',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
                userSelect: 'none',
                '&:hover': {
                  color: 'rgba(205, 214, 244, 0.6)',
                },
              }}
              title="Double-click to set virtual context size for debugging"
            >
              {formatContextUsage(
                contextUsage.used,
                virtualContextSize ?? contextUsage.total
              )}
            </Typography>
          )
        )}
      </Box>

      {/* Input box */}
      <Box>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Press ESC to Cancel" : "Type your message... (SHIFT+ENTER: new line / focus input)"}
          disabled={isLoading || !currentProvider || !currentModel}
          inputRef={inputRef}
          autoFocus
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#cdd6f4',
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
      </Box>
    </Box>
  );
}

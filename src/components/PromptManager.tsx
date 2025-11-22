import { Box, Typography, Button, TextField, IconButton, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

export function PromptManager() {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [promptContent, setPromptContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Ref to store current editor value to avoid state staleness
  const promptContentRef = useRef<string>('');

  useEffect(() => {
    loadPrompts();
  }, []);

  useEffect(() => {
    setHasChanges(promptContent !== originalContent);
  }, [promptContent, originalContent]);

  // Keyboard shortcut for Ctrl/Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && selectedPrompt) {
          savePrompt();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, selectedPrompt]);

  const loadPrompts = async () => {
    const result = await window.electronAPI.promptsList();
    if (result.success) {
      setPrompts(result.prompts);
    }
  };

  const loadPrompt = async (name: string) => {
    const result = await window.electronAPI.promptsRead(name);
    if (result.success && result.content) {
      setPromptContent(result.content);
      promptContentRef.current = result.content;
      setOriginalContent(result.content);
      setSelectedPrompt(name);
    }
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;

    // Use ref to get the most current value
    const currentContent = promptContentRef.current;
    const result = await window.electronAPI.promptsWrite(selectedPrompt, currentContent);
    if (result.success) {
      setPromptContent(currentContent);
      setOriginalContent(currentContent);
      setHasChanges(false);
    }
  };

  const createPrompt = async () => {
    if (!newPromptName.trim()) return;

    // Check if prompt already exists
    if (prompts.includes(newPromptName)) {
      alert('A prompt with this name already exists');
      return;
    }

    const result = await window.electronAPI.promptsWrite(newPromptName, '');
    if (result.success) {
      await loadPrompts();
      setSelectedPrompt(newPromptName);
      setPromptContent('');
      promptContentRef.current = '';
      setOriginalContent('');
      setDialogOpen(false);
      setNewPromptName('');
    }
  };

  const deletePrompt = async (name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    const result = await window.electronAPI.promptsDelete(name);
    if (result.success) {
      if (selectedPrompt === name) {
        setSelectedPrompt(null);
        setPromptContent('');
        promptContentRef.current = '';
        setOriginalContent('');
      }
      await loadPrompts();
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
      {/* Prompts list */}
      <Box sx={{
        width: 250,
        borderRight: '1px solid rgba(205, 214, 244, 0.1)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(205, 214, 244, 0.1)' }}>
          <Button
            onClick={() => setDialogOpen(true)}
            startIcon={<Plus size={16} />}
            fullWidth
            sx={{
              color: '#a6e3a1',
              borderColor: '#a6e3a1',
              '&:hover': {
                backgroundColor: 'rgba(166, 227, 161, 0.1)',
                borderColor: '#a6e3a1',
              },
            }}
            variant="outlined"
          >
            New Prompt
          </Button>
        </Box>
        
        <List sx={{ flexGrow: 1, overflowY: 'auto', p: 0 }}>
          {prompts.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.5)' }}>
                No prompts yet
              </Typography>
            </Box>
          ) : (
            prompts.map((prompt) => (
              <ListItem
                key={prompt}
                onClick={() => loadPrompt(prompt)}
                sx={{
                  cursor: 'pointer',
                  backgroundColor: selectedPrompt === prompt ? 'rgba(137, 180, 250, 0.1)' : 'transparent',
                  borderLeft: selectedPrompt === prompt ? '3px solid #89b4fa' : '3px solid transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(205, 214, 244, 0.05)',
                  },
                }}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePrompt(prompt);
                    }}
                    sx={{ color: '#f38ba8' }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={prompt}
                  primaryTypographyProps={{
                    sx: { color: '#cdd6f4', fontSize: '14px' },
                  }}
                />
              </ListItem>
            ))
          )}
        </List>
      </Box>

      {/* Editor */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
        {selectedPrompt ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Edit2 size={18} color="#89b4fa" />
                <Typography variant="h6" sx={{ color: '#cdd6f4', fontSize: '16px' }}>
                  {selectedPrompt}
                </Typography>
              </Box>
              <Button
                onClick={savePrompt}
                disabled={!hasChanges}
                sx={{
                  color: '#a6e3a1',
                  borderColor: '#a6e3a1',
                  '&:hover': {
                    backgroundColor: 'rgba(166, 227, 161, 0.1)',
                    borderColor: '#a6e3a1',
                  },
                  '&:disabled': {
                    color: 'rgba(205, 214, 244, 0.3)',
                    borderColor: 'rgba(205, 214, 244, 0.3)',
                  },
                }}
                variant="outlined"
                size="small"
              >
                {hasChanges ? 'Save' : 'Saved'}
              </Button>
            </Box>

            <Box sx={{ flexGrow: 1, border: '1px solid rgba(205, 214, 244, 0.2)', borderRadius: 0.5, overflow: 'hidden' }}>
              <Editor
                height="100%"
                defaultLanguage="markdown"
                value={promptContent}
                onChange={(value) => {
                  const newValue = value || '';
                  setPromptContent(newValue);
                  promptContentRef.current = newValue;
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  wrappingIndent: 'indent',
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </Box>
          </>
        ) : (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}>
            <Typography variant="body1" sx={{ color: 'rgba(205, 214, 244, 0.5)' }}>
              Select a prompt to edit or create a new one
            </Typography>
          </Box>
        )}
      </Box>

      {/* New prompt dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: '#313244', color: '#cdd6f4' }}>
          Create New Prompt
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#1e1e2e', pt: 3 }}>
          <TextField
            autoFocus
            label="Prompt Name"
            fullWidth
            value={newPromptName}
            onChange={(e) => setNewPromptName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                createPrompt();
              }
            }}
            sx={{
              '& .MuiInputLabel-root': { color: 'rgba(205, 214, 244, 0.7)' },
              '& .MuiInputBase-root': {
                color: '#cdd6f4',
                '& fieldset': { borderColor: 'rgba(205, 214, 244, 0.2)' },
                '&:hover fieldset': { borderColor: 'rgba(205, 214, 244, 0.3)' },
                '&.Mui-focused fieldset': { borderColor: '#89b4fa' },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#313244', p: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: '#f38ba8' }}>
            Cancel
          </Button>
          <Button
            onClick={createPrompt}
            disabled={!newPromptName.trim()}
            sx={{ color: '#a6e3a1' }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


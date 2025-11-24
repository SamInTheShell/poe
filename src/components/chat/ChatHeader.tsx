import { Box, Typography, IconButton, Badge, TextField } from '@mui/material';
import SegmentIcon from '@mui/icons-material/Segment';
import { Settings, Download, Wrench, FilePlus } from 'lucide-react';

interface ChatHeaderProps {
  displayPath: string;
  currentSessionName: string;
  isLoading: boolean;
  hasStartingServers: boolean;
  onSessionNameChange: (name: string) => void;
  onNewSession: () => void;
  onOpenSessionMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onExportChatState: () => void;
  onOpenSettings: () => void;
  onToggleToolsPanel: () => void;
}

export function ChatHeader({
  displayPath,
  currentSessionName,
  isLoading,
  hasStartingServers,
  onSessionNameChange,
  onNewSession,
  onOpenSessionMenu,
  onExportChatState,
  onOpenSettings,
  onToggleToolsPanel,
}: ChatHeaderProps) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
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
          value={currentSessionName}
          onChange={(e) => onSessionNameChange(e.target.value)}
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
          onClick={onNewSession}
          disabled={isLoading}
          title={`New session (${isMac ? '⌘' : 'Ctrl'}+T)`}
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
          onClick={onOpenSessionMenu}
          disabled={isLoading}
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
          onClick={onExportChatState}
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
          onClick={onOpenSettings}
          title={`Settings (${isMac ? '⌘' : 'Ctrl'}+,)`}
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
          onClick={onToggleToolsPanel}
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
    </Box>
  );
}

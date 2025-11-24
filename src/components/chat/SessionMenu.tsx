import { Menu, MenuItem, ListItemText, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, IconButton } from '@mui/material';
import { X, Trash2 } from 'lucide-react';
import { getSessionDisplayName } from '../../utils/messageUtils';

interface Session {
  id: string;
  lastModified: string;
  messageCount: number;
  name: string;
  isCustomName: boolean;
}

interface SessionMenuProps {
  anchorEl: HTMLElement | null;
  sessions: Session[];
  currentSessionId: string;
  deleteConfirmOpen: boolean;
  clearAllConfirmOpen: boolean;
  onClose: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteClick: (sessionId: string, event: React.MouseEvent) => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onClearAllClick: () => void;
  onClearAllConfirm: () => void;
  onClearAllCancel: () => void;
}

export function SessionMenu({
  anchorEl,
  sessions,
  currentSessionId,
  deleteConfirmOpen,
  clearAllConfirmOpen,
  onClose,
  onLoadSession,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  onClearAllClick,
  onClearAllConfirm,
  onClearAllCancel,
}: SessionMenuProps) {
  return (
    <>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={onClose}
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
          const isCurrentSession = session.id === currentSessionId;
          const date = new Date(session.lastModified);
          const formattedDate = date.toLocaleString();
          const displayName = getSessionDisplayName(session.id, session.name, session.isCustomName);

          return (
            <MenuItem
              key={session.id}
              onClick={() => onLoadSession(session.id)}
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
                onClick={(e) => onDeleteClick(session.id, e)}
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
            onClick={onClearAllClick}
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
        onClose={onDeleteCancel}
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
            onClick={onDeleteCancel}
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
            onClick={onDeleteConfirm}
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
        onClose={onClearAllCancel}
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
            onClick={onClearAllCancel}
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
            onClick={onClearAllConfirm}
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
    </>
  );
}

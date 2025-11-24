import { Box, Typography, IconButton } from '@mui/material';
import { X } from 'lucide-react';

interface ErrorDisplayProps {
  error: string | null;
  onDismiss: () => void;
}

export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
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
        Error: {error}
      </Typography>
      <IconButton
        size="small"
        onClick={onDismiss}
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
  );
}

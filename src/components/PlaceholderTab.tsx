import { Box, Typography } from '@mui/material';

interface PlaceholderTabProps {
  tabName: string;
}

export function PlaceholderTab({ tabName }: PlaceholderTabProps) {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      height: '100%',
      backgroundColor: '#1e1e2e',
      gap: 2
    }}>
      <Typography variant="h5" sx={{ color: '#cdd6f4' }}>
        {tabName}
      </Typography>
      <Typography variant="body1" sx={{ color: 'rgba(205, 214, 244, 0.6)' }}>
        This is a placeholder tab
      </Typography>
    </Box>
  );
}


import { Box, Typography } from '@mui/material';

export function WelcomeTab() {
  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      height: '100%',
      backgroundColor: '#1e1e2e'
    }}>
      <Typography variant="h4" sx={{ color: '#cdd6f4' }}>
        Hello, World!
      </Typography>
    </Box>
  );
}


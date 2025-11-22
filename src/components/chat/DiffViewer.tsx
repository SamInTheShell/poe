import { Box, Typography } from '@mui/material';
import { diffLines } from 'diff';
import { useMemo } from 'react';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  fileName?: string;
}

interface Change {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

export function DiffViewer({ oldContent, newContent, fileName }: DiffViewerProps) {
  const diff = useMemo(() => {
    return diffLines(oldContent || '', newContent || '');
  }, [oldContent, newContent]);

  const renderLine = (change: Change, lineNum: number, isOld: boolean) => {
    const bgColor = change.added
      ? 'rgba(166, 227, 161, 0.15)'
      : change.removed
      ? 'rgba(243, 139, 168, 0.15)'
      : 'transparent';

    const lineColor = change.added
      ? '#a6e3a1'
      : change.removed
      ? '#f38ba8'
      : '#6c7086';

    const prefix = change.added ? '+' : change.removed ? '-' : ' ';
    const prefixColor = change.added ? '#a6e3a1' : change.removed ? '#f38ba8' : '#6c7086';

    return (
      <Box
        key={`${isOld ? 'old' : 'new'}-${lineNum}`}
        sx={{
          display: 'flex',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '18px',
          backgroundColor: bgColor,
          '&:hover': {
            backgroundColor: change.added
              ? 'rgba(166, 227, 161, 0.2)'
              : change.removed
              ? 'rgba(243, 139, 168, 0.2)'
              : 'rgba(108, 112, 134, 0.1)',
          },
        }}
      >
        <Box
          sx={{
            minWidth: '40px',
            textAlign: 'right',
            paddingRight: '8px',
            color: lineColor,
            userSelect: 'none',
            borderRight: '1px solid rgba(108, 112, 134, 0.2)',
          }}
        >
          {!change.added && !change.removed ? lineNum : ''}
        </Box>
        <Box
          sx={{
            minWidth: '20px',
            textAlign: 'center',
            paddingX: '8px',
            color: prefixColor,
            fontWeight: 'bold',
            userSelect: 'none',
          }}
        >
          {prefix}
        </Box>
        <Box
          sx={{
            flex: 1,
            paddingRight: '8px',
            color: '#cdd6f4',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        >
          {change.value}
        </Box>
      </Box>
    );
  };

  let oldLineNum = 1;
  let newLineNum = 1;

  return (
    <Box>
      {fileName && (
        <Typography
          variant="caption"
          sx={{
            color: '#89b4fa',
            display: 'block',
            mb: 1,
            fontFamily: 'monospace',
            fontWeight: 600,
          }}
        >
          {fileName}
        </Typography>
      )}
      <Box
        sx={{
          backgroundColor: '#181825',
          borderRadius: 0.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
          overflow: 'hidden',
        }}
      >
        {diff.map((change) => {
          const lines = change.value.split('\n');
          // Only remove the last empty line if the value ends with a newline
          // (this happens because split adds an empty string after the final \n)
          if (lines.length > 0 && lines[lines.length - 1] === '' && change.value.endsWith('\n')) {
            lines.pop();
          }

          return lines.map((line) => {
            const lineNum = change.removed ? oldLineNum++ : change.added ? newLineNum++ : (oldLineNum++, newLineNum++);
            const isOld = change.removed;

            return renderLine(
              { ...change, value: line },
              lineNum - 1,
              isOld
            );
          });
        })}
      </Box>

      {/* Stats */}
      <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
        <Typography variant="caption" sx={{ color: '#a6e3a1', fontFamily: 'monospace' }}>
          +{diff.filter(c => c.added).reduce((sum, c) => sum + c.count!, 0)} additions
        </Typography>
        <Typography variant="caption" sx={{ color: '#f38ba8', fontFamily: 'monospace' }}>
          -{diff.filter(c => c.removed).reduce((sum, c) => sum + c.count!, 0)} deletions
        </Typography>
      </Box>
    </Box>
  );
}

import { Box, Typography, Collapse, IconButton, Button } from '@mui/material';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, FileText, FolderTree } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DiffViewer } from './DiffViewer';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ToolResultDisplayProps {
  toolCallName: string;
  toolCallArgs: Record<string, unknown>;
  result: unknown;
  isPendingPermission?: boolean;
  onPermissionAllow?: () => void;
  onPermissionDeny?: () => void;
  previewData?: any;
  permissionStatus?: 'denied' | 'allowed';
}

// Helper to get file extension for syntax highlighting
function getLanguageFromPath(filePath: string | undefined): string {
  if (!filePath) return 'text';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'md': 'markdown',
    'sql': 'sql',
  };
  return languageMap[ext] || 'text';
}

// Custom renderer for Read tool
function ReadToolResult({ result, args }: { result: any; args: Record<string, unknown> }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'File read failed'}
          </Typography>
        </Box>
      </Box>
    );
  }
  
  if (!result.content) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          File Read
        </Typography>
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
        }}>
          <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.5)', fontStyle: 'italic', fontFamily: 'monospace', fontSize: '12px' }}>
            File is empty
          </Typography>
        </Box>
      </Box>
    );
  }

  const filePath = args.file_path as string;
  const language = getLanguageFromPath(filePath);

  // Remove line numbers from content (format: "     1\tcontent")
  const lines = result.content.split('\n').map((line: string) => {
    const tabIndex = line.indexOf('\t');
    return tabIndex >= 0 ? line.substring(tabIndex + 1) : line;
  });
  const content = lines.join('\n');

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Content
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        overflow: 'hidden',
        border: '1px solid rgba(108, 112, 134, 0.2)',
      }}>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '12px',
            fontSize: '12px',
            backgroundColor: 'transparent',
          }}
          showLineNumbers
          startingLineNumber={(result.offset || 0) + 1}
        >
          {content}
        </SyntaxHighlighter>
      </Box>
      {result.total_lines && (
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.5)', display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
          Showing {result.lines_returned} of {result.total_lines} lines
        </Typography>
      )}
    </Box>
  );
}

// Custom renderer for Edit tool
function EditToolResult({ result, args }: { result: any; args: Record<string, unknown> }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Edit operation failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  // If we have old_content and new_content, show a diff
  if (result.old_content !== undefined && result.new_content !== undefined) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Changes Applied
        </Typography>
        <DiffViewer
          oldContent={result.old_content || ''}
          newContent={result.new_content || ''}
          fileName={args.file_path as string}
        />
      </Box>
    );
  }

  // Otherwise just show a success message
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Changes Applied
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a6e3a1',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <CheckCircle size={14} />
          <Typography variant="body2" sx={{ color: '#a6e3a1', fontFamily: 'monospace' }}>
            Made {result.replacements} replacement{result.replacements !== 1 ? 's' : ''} in {args.file_path as string}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// Custom renderer for Glob tool
function GlobToolResult({ result }: { result: any }) {
  // Handle case where result might be a string that needs parsing
  let parsedResult = result;
  if (typeof result === 'string') {
    try {
      parsedResult = JSON.parse(result);
    } catch (e) {
      console.warn('[GlobToolResult] Failed to parse string result:', e);
      parsedResult = { success: false, error: 'Invalid result format' };
    }
  }

  // Debug logging
  if (parsedResult && typeof parsedResult === 'object') {
    console.log('[GlobToolResult] Result:', {
      success: parsedResult.success,
      hasFiles: 'files' in parsedResult,
      filesType: typeof parsedResult.files,
      filesIsArray: Array.isArray(parsedResult.files),
      filesValue: parsedResult.files,
      count: parsedResult.count,
    });
  }

  if (!parsedResult || (typeof parsedResult === 'object' && parsedResult.success === false)) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {parsedResult?.error || 'Glob search failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Ensure files is always an array - handle various result formats
  let files: string[] = [];
  if (Array.isArray(parsedResult.files)) {
    files = parsedResult.files;
  } else if (parsedResult.files !== undefined && parsedResult.files !== null) {
    // If files is not an array but exists, try to handle it
    if (typeof parsedResult.files === 'string') {
      // Maybe it's a JSON string?
      try {
        const parsed = JSON.parse(parsedResult.files);
        if (Array.isArray(parsed)) {
          files = parsed;
        } else {
          console.warn('[GlobToolResult] files string is not a JSON array:', parsedResult.files);
          files = [];
        }
      } catch {
        console.warn('[GlobToolResult] files is a string but not valid JSON:', parsedResult.files);
        files = [];
      }
    } else {
      // If files is not an array but exists, log warning and default to empty
      console.warn('[GlobToolResult] files is not an array:', typeof parsedResult.files, parsedResult.files);
      files = [];
    }
  }
  
  // Also check if result itself might be an array (edge case)
  if (Array.isArray(parsedResult) && files.length === 0) {
    files = parsedResult;
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Matching Files ({parsedResult.count ?? files.length})
      </Typography>
      {files.length > 0 ? (
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {files.map((file: string, idx: number) => (
            <Box
              key={idx}
              sx={{
                p: 0.75,
                pl: 1.5,
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#89b4fa',
                borderBottom: idx < files.length - 1 ? '1px solid rgba(108, 112, 134, 0.1)' : 'none',
                '&:hover': {
                  backgroundColor: 'rgba(137, 180, 250, 0.05)',
                },
              }}
            >
              {file}
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
        }}>
          <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.5)', fontStyle: 'italic', fontFamily: 'monospace', fontSize: '12px' }}>
            No files found matching the pattern
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// Custom renderer for Grep tool
function GrepToolResult({ result, args }: { result: any; args: Record<string, unknown> }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Grep search failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  const outputMode = args.output_mode as string || 'files_with_matches';

  if (outputMode === 'files_with_matches') {
    const files = result.files || [];
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Files with Matches ({result.count || 0})
        </Typography>
        {files.length > 0 ? (
          <Box sx={{
            backgroundColor: '#1e1e2e',
            borderRadius: 0.5,
            border: '1px solid rgba(108, 112, 134, 0.2)',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {files.map((file: string, idx: number) => (
              <Box
                key={idx}
                sx={{
                  p: 0.75,
                  pl: 1.5,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#89b4fa',
                  borderBottom: idx < files.length - 1 ? '1px solid rgba(108, 112, 134, 0.1)' : 'none',
                  '&:hover': {
                    backgroundColor: 'rgba(137, 180, 250, 0.05)',
                  },
                }}
              >
                {file}
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{
            backgroundColor: '#1e1e2e',
            borderRadius: 0.5,
            p: 1.5,
            border: '1px solid rgba(108, 112, 134, 0.2)',
          }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.5)', fontStyle: 'italic', fontFamily: 'monospace', fontSize: '12px' }}>
              No matches found
            </Typography>
          </Box>
        )}
      </Box>
    );
  } else {
    // Content or count mode
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Matches
        </Typography>
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          p: 1,
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#cdd6f4',
          overflowX: 'auto',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          <pre style={{ margin: 0 }}>
            {result.content || 'No matches'}
          </pre>
        </Box>
      </Box>
    );
  }
}

// Custom renderer for Ls tool
function LsToolResult({ result }: { result: any }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Directory listing failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  const entries = result.entries || [];
  const isDetailedFormat = entries.length > 0 && typeof entries[0] === 'object';

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Directory Listing: {result.path} ({result.count || 0} items)
      </Typography>
      {entries.length > 0 ? (
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {entries.map((entry: any, idx: number) => {
            const isDir = typeof entry === 'object' ? entry.type === 'directory' : false;
            const name = typeof entry === 'string' ? entry : entry.name;

            return (
              <Box
                key={idx}
                sx={{
                  p: 0.75,
                  pl: 1.5,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: isDir ? '#89b4fa' : '#cdd6f4',
                  borderBottom: idx < entries.length - 1 ? '1px solid rgba(108, 112, 134, 0.1)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  '&:hover': {
                    backgroundColor: 'rgba(137, 180, 250, 0.05)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isDir ? <FolderTree size={14} /> : <FileText size={14} />}
                  <span>{name}</span>
                </Box>
                {isDetailedFormat && typeof entry === 'object' && (
                  <Box sx={{ display: 'flex', gap: 2, color: 'rgba(205, 214, 244, 0.5)', fontSize: '11px' }}>
                    {entry.size !== undefined && <span>{formatBytes(entry.size)}</span>}
                    {entry.modified && <span>{new Date(entry.modified).toLocaleDateString()}</span>}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={{
          backgroundColor: '#1e1e2e',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(108, 112, 134, 0.2)',
        }}>
          <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.5)', fontStyle: 'italic', fontFamily: 'monospace', fontSize: '12px' }}>
            Directory is empty (no files or folders found)
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

// Custom renderer for Move tool
function MoveToolResult({ result }: { result: any; args: Record<string, unknown> }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Move operation failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Moved Successfully
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '50px' }}>
              From:
            </Typography>
            <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace' }}>
              {result.source_path}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '50px' }}>
              To:
            </Typography>
            <Typography variant="body2" sx={{ color: '#a6e3a1', fontFamily: 'monospace' }}>
              {result.destination_path}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '50px' }}>
              Type:
            </Typography>
            <Typography variant="body2" sx={{ color: '#89b4fa', fontFamily: 'monospace' }}>
              {result.type}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// Custom renderer for Rm tool
function RmToolResult({ result }: { result: any }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Delete operation failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Deleted Successfully
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '70px' }}>
              Path:
            </Typography>
            <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace' }}>
              {result.path}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '70px' }}>
              Type:
            </Typography>
            <Typography variant="body2" sx={{ color: '#89b4fa', fontFamily: 'monospace' }}>
              {result.type}
            </Typography>
          </Box>
          {result.recursive && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', minWidth: '70px' }}>
                Recursive:
              </Typography>
              <Typography variant="body2" sx={{ color: '#f9e2af', fontFamily: 'monospace' }}>
                Yes (deleted all contents)
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// Custom renderer for Mkdir tool
function MkdirToolResult({ result }: { result: any }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Directory creation failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Directory Created
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle size={14} color="#a6e3a1" />
          <Typography variant="body2" sx={{ color: '#a6e3a1', fontFamily: 'monospace' }}>
            Created directory at {result.path}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// Custom renderer for Write tool
function WriteToolResult({ result, args }: { result: any; args: Record<string, unknown> }) {
  if (!result?.success) {
    return (
      <Box>
        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
          Error
        </Typography>
        <Box sx={{
          backgroundColor: 'rgba(243, 139, 168, 0.1)',
          borderRadius: 0.5,
          p: 1.5,
          border: '1px solid rgba(243, 139, 168, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <XCircle size={16} color="#f38ba8" />
          <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
            {result.error || 'Write operation failed'}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        File Written Successfully
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle size={14} color="#a6e3a1" />
          <Typography variant="body2" sx={{ color: '#a6e3a1', fontFamily: 'monospace' }}>
            Wrote {result.bytes_written || 0} bytes to {result.file_path || args.file_path}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// Custom renderer for Bash tool
function BashToolResult({ result, args }: { result: any; args: Record<string, unknown> }) {
  const command = args.command as string || result?.command || 'Unknown command';
  const success = result?.success !== false; // Default to true if not specified
  const stdout = result?.stdout || '';
  const stderr = result?.stderr || '';
  const exitCode = result?.exit_code;

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
        Command Execution {success ? '✓' : '✗'}
      </Typography>
      <Box sx={{
        backgroundColor: '#1e1e2e',
        borderRadius: 0.5,
        border: '1px solid rgba(108, 112, 134, 0.2)',
        overflow: 'hidden',
      }}>
        <Box sx={{
          p: 1,
          backgroundColor: 'rgba(108, 112, 134, 0.1)',
          borderBottom: '1px solid rgba(108, 112, 134, 0.2)',
        }}>
          <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', fontFamily: 'monospace', fontSize: '11px' }}>
            $ {command}
          </Typography>
        </Box>
        {stdout && (
          <Box sx={{
            p: 1,
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#cdd6f4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {stdout}
          </Box>
        )}
        {stderr && (
          <Box sx={{
            p: 1,
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#f38ba8',
            backgroundColor: 'rgba(243, 139, 168, 0.05)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '300px',
            overflowY: 'auto',
            borderTop: stdout ? '1px solid rgba(243, 139, 168, 0.2)' : 'none',
          }}>
            {stderr}
          </Box>
        )}
        {!stdout && !stderr && (
          <Box sx={{
            p: 1,
            fontFamily: 'monospace',
            fontSize: '12px',
            color: 'rgba(205, 214, 244, 0.5)',
            fontStyle: 'italic',
          }}>
            {success ? 'Command executed successfully (no output)' : 'Command failed (no output)'}
          </Box>
        )}
        {exitCode !== undefined && exitCode !== 0 && (
          <Box sx={{
            p: 0.75,
            pl: 1,
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'rgba(243, 139, 168, 0.7)',
            backgroundColor: 'rgba(243, 139, 168, 0.05)',
            borderTop: '1px solid rgba(243, 139, 168, 0.2)',
          }}>
            Exit code: {exitCode}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function ToolResultDisplay({
  toolCallName,
  toolCallArgs,
  result,
  isPendingPermission = false,
  onPermissionAllow,
  onPermissionDeny,
  previewData,
  permissionStatus,
}: ToolResultDisplayProps) {
  // Built-in tools that should always be expanded (they have custom visualizations)
  const builtInTools = ['read', 'write', 'edit', 'find', 'grep', 'ls', 'bash', 'move', 'rm', 'mkdir'];
  const isBuiltInTool = builtInTools.includes(toolCallName);
  
  // Auto-expand if: pending permission OR built-in tool (they have custom visualizations)
  const shouldAutoExpand = isPendingPermission || isBuiltInTool;
  const [expanded, setExpanded] = useState(shouldAutoExpand);
  
  // Ensure built-in tools are always expanded
  useEffect(() => {
    if (isBuiltInTool && !expanded) {
      setExpanded(true);
    }
  }, [isBuiltInTool, expanded]);

  // Create compact representation for collapsed state
  const argsPreview = toolCallArgs && typeof toolCallArgs === 'object'
    ? Object.entries(toolCallArgs)
        .map(([, value]) => {
          const strValue = typeof value === 'string' ? `"${value}"` : String(value);
          return strValue.length > 20 ? strValue.substring(0, 20) + '...' : strValue;
        })
        .join(', ')
    : '';

  const compactDisplay = `${toolCallName}(${argsPreview})`;

  const borderColor = isPendingPermission 
    ? 'rgba(249, 226, 175, 0.5)' 
    : 'rgba(166, 227, 161, 0.3)';
  const bgColor = isPendingPermission
    ? 'rgba(249, 226, 175, 0.1)'
    : 'rgba(166, 227, 161, 0.05)';
  const iconColor = isPendingPermission ? '#f9e2af' : '#a6e3a1';

  return (
    <Box sx={{
      border: `1px solid ${borderColor}`,
      borderRadius: 1,
      backgroundColor: bgColor,
      p: 1.5,
      my: 1,
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: expanded ? 1 : 0,
        cursor: isBuiltInTool ? 'default' : 'pointer',
      }}
      onClick={() => {
        if (!isBuiltInTool) {
          setExpanded(!expanded);
        }
      }}
      >
        {!isBuiltInTool && (
          <IconButton size="small" sx={{ color: iconColor, p: 0 }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </IconButton>
        )}
        {isBuiltInTool && (
          <Box sx={{ width: 16, height: 16 }} /> // Spacer to align with non-built-in tools
        )}
        <Wrench size={16} color={iconColor} />
        <Typography variant="body2" sx={{ color: iconColor, fontWeight: 500, fontFamily: 'monospace', fontSize: '13px' }}>
          {compactDisplay}
        </Typography>
        {isPendingPermission && (
          <Typography variant="caption" sx={{ color: '#f9e2af', fontStyle: 'italic', ml: 1 }}>
            Requires Permission
          </Typography>
        )}
      </Box>

      {/* Collapsible content */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 3 }}>
          {/* Show diff preview for write/edit tools during permission request or after execution */}
          {(toolCallName === 'write' || toolCallName === 'edit') && (previewData || (result && typeof result === 'object' && 'old_content' in result)) ? (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
                {isPendingPermission ? 'Preview' : 'Changes'}
              </Typography>
              <DiffViewer
                oldContent={(previewData?.old_content || (result as any)?.old_content) || ''}
                newContent={(previewData?.new_content || (result as any)?.new_content) || ''}
                fileName={(previewData?.file_path || (result as any)?.file_path || toolCallArgs.file_path as string)}
              />
            </Box>
          ) : (
            /* Show arguments for tools that don't have custom renderers */
            toolCallArgs && Object.keys(toolCallArgs).length > 0 && !['read', 'edit', 'find', 'grep', 'ls', 'move', 'rm', 'mkdir'].includes(toolCallName) && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
                  Arguments
                </Typography>
                <Box sx={{
                  backgroundColor: '#1e1e2e',
                  borderRadius: 0.5,
                  p: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#cdd6f4',
                  overflowX: 'auto',
                }}>
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(toolCallArgs, null, 2)}
                  </pre>
                </Box>
              </Box>
            )
          )}

          {/* Permission Request */}
          {isPendingPermission && onPermissionAllow && onPermissionDeny && (
            <Box sx={{ mt: 1.5 }}>
              <Box sx={{
                backgroundColor: '#1e1e2e',
                borderRadius: 0.5,
                p: 2,
                border: '1px solid rgba(249, 226, 175, 0.3)',
              }}>
                <Typography variant="body2" sx={{ color: '#f9e2af', mb: 1.5, fontWeight: 500 }}>
                  ⚠️ This tool requires your permission to execute
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.7)', display: 'block', mb: 2 }}>
                  Review the arguments above and decide whether to allow this tool to run.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPermissionDeny();
                    }}
                    size="small"
                    startIcon={<XCircle size={16} />}
                    sx={{
                      color: '#f38ba8',
                      borderColor: '#f38ba8',
                      '&:hover': {
                        backgroundColor: 'rgba(243, 139, 168, 0.1)',
                        borderColor: '#f38ba8',
                      },
                    }}
                    variant="outlined"
                  >
                    Deny
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPermissionAllow();
                    }}
                    size="small"
                    startIcon={<CheckCircle size={16} />}
                    sx={{
                      backgroundColor: '#a6e3a1',
                      color: '#1e1e2e',
                      '&:hover': {
                        backgroundColor: '#94d890',
                      },
                    }}
                    variant="contained"
                  >
                    Allow
                  </Button>
                </Box>
              </Box>
            </Box>
          )}

          {/* Permission Status - show what the user decided */}
          {!isPendingPermission && permissionStatus && (
            <Box sx={{ mt: 1.5 }}>
              <Box sx={{
                backgroundColor: '#1e1e2e',
                borderRadius: 0.5,
                p: 1.5,
                border: permissionStatus === 'denied'
                  ? '1px solid rgba(243, 139, 168, 0.3)'
                  : '1px solid rgba(166, 227, 161, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}>
                {permissionStatus === 'denied' ? (
                  <>
                    <XCircle size={16} color="#f38ba8" />
                    <Typography variant="body2" sx={{ color: '#f38ba8', fontWeight: 500 }}>
                      Permission Denied
                    </Typography>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} color="#a6e3a1" />
                    <Typography variant="body2" sx={{ color: '#a6e3a1', fontWeight: 500 }}>
                      Permission Granted
                    </Typography>
                  </>
                )}
              </Box>
            </Box>
          )}

          {/* Result - use custom renderers for built-in tools */}
          {!isPendingPermission && result !== undefined && (
            <>
              {/* Show error if result indicates failure */}
              {typeof result === 'object' && result !== null && 'success' in result && result.success === false ? (
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
                    Error
                  </Typography>
                  <Box sx={{
                    backgroundColor: 'rgba(243, 139, 168, 0.1)',
                    borderRadius: 0.5,
                    p: 1.5,
                    border: '1px solid rgba(243, 139, 168, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}>
                    <XCircle size={16} color="#f38ba8" />
                    <Typography variant="body2" sx={{ color: '#f38ba8', fontFamily: 'monospace', fontSize: '12px' }}>
                      {(result as any).error || 'Tool execution failed'}
                    </Typography>
                  </Box>
                </Box>
              ) : toolCallName === 'read' ? (
                <ReadToolResult result={result} args={toolCallArgs} />
              ) : toolCallName === 'edit' && typeof result === 'object' && result !== null && 'old_content' in result ? (
                // Edit tool shows diff in preview section, skip result display
                null
              ) : toolCallName === 'edit' ? (
                <EditToolResult result={result} args={toolCallArgs} />
              ) : toolCallName === 'find' ? (
                <GlobToolResult result={result} />
              ) : toolCallName === 'grep' ? (
                <GrepToolResult result={result} args={toolCallArgs} />
              ) : toolCallName === 'ls' ? (
                <LsToolResult result={result} />
              ) : toolCallName === 'move' ? (
                <MoveToolResult result={result} args={toolCallArgs} />
              ) : toolCallName === 'rm' ? (
                <RmToolResult result={result} />
              ) : toolCallName === 'mkdir' ? (
                <MkdirToolResult result={result} />
              ) : toolCallName === 'write' && typeof result === 'object' && result !== null && 'old_content' in result ? (
                // Write tool shows diff in preview section, skip result display
                null
              ) : toolCallName === 'write' ? (
                <WriteToolResult result={result} args={toolCallArgs} />
              ) : toolCallName === 'bash' ? (
                <BashToolResult result={result} args={toolCallArgs} />
              ) : (
                // Default result display for other tools (MCP tools, etc.)
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.6)', display: 'block', mb: 0.5, fontWeight: 600 }}>
                    Result
                  </Typography>
                  <Box sx={{
                    backgroundColor: '#1e1e2e',
                    borderRadius: 0.5,
                    p: 1,
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#cdd6f4',
                    overflowX: 'auto',
                  }}>
                    <pre style={{ margin: 0 }}>
                      {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                    </pre>
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Show pending state if no result yet and not waiting for permission */}
          {!isPendingPermission && result === undefined && (
            <Box>
              <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.4)', fontStyle: 'italic' }}>
                Executing...
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

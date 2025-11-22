import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  // Handle empty content gracefully
  if (!content || content.trim() === '') {
    return null;
  }

  return (
    <Box sx={{
      color: '#cdd6f4',
      '& p': {
        margin: '0.5em 0',
        '&:first-of-type': {
          marginTop: 0,
        },
        '&:last-of-type': {
          marginBottom: 0,
        },
      },
      '& ul, & ol': {
        margin: '0.5em 0',
        paddingLeft: '1.5em',
      },
      '& li': {
        margin: '0.25em 0',
      },
      '& blockquote': {
        margin: '0.5em 0',
        paddingLeft: '1em',
        borderLeft: '3px solid #89b4fa',
        color: 'rgba(205, 214, 244, 0.8)',
      },
      '& h1, & h2, & h3, & h4, & h5, & h6': {
        margin: '0.75em 0 0.5em',
        color: '#89b4fa',
        fontWeight: 600,
      },
      '& h1': { fontSize: '1.5em' },
      '& h2': { fontSize: '1.3em' },
      '& h3': { fontSize: '1.15em' },
      '& code': {
        backgroundColor: 'rgba(205, 214, 244, 0.1)',
        padding: '0.15em 0.4em',
        borderRadius: '3px',
        fontSize: '0.9em',
        fontFamily: '"Fira Code", "Courier New", monospace',
      },
      '& pre': {
        margin: '0.75em 0',
      },
      '& pre code': {
        backgroundColor: 'transparent',
        padding: 0,
      },
      '& a': {
        color: '#89b4fa',
        textDecoration: 'none',
        '&:hover': {
          textDecoration: 'underline',
        },
      },
      '& hr': {
        border: 'none',
        borderTop: '1px solid rgba(205, 214, 244, 0.2)',
        margin: '1em 0',
      },
      '& table': {
        borderCollapse: 'collapse',
        margin: '0.75em 0',
        width: '100%',
      },
      '& th, & td': {
        border: '1px solid rgba(205, 214, 244, 0.2)',
        padding: '0.5em',
        textAlign: 'left',
      },
      '& th': {
        backgroundColor: 'rgba(137, 180, 250, 0.1)',
        fontWeight: 600,
      },
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const inline = !match;

            return !inline && language ? (
              <SyntaxHighlighter
                style={oneDark as { [key: string]: React.CSSProperties }}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: '6px',
                  fontSize: '0.9em',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
}

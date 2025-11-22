import type { Tool } from '../../types/chat';

export const GlobTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'find',
      description: 'Fuzzy file finder tool. Supports fuzzy matching, regex patterns (wrapped in /pattern/flags), and glob-like patterns (e.g., "*.js", "**/*.ts"). Returns matching file paths. The path parameter (if provided) must start with / representing the root of the project directory.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The search pattern. Can be: fuzzy text (e.g., "hello"), regex (e.g., "/\\.go$/"), or glob pattern (e.g., "**/*.ts", "*.js")',
          },
          path: {
            type: 'string',
            description: 'Optional directory to search in (relative to project root, must start with /). If not specified, searches from project root.',
          },
        },
        required: ['pattern'],
      },
    },
  },

  requiresMainProcess: true,

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Glob tool must be executed in main process');
  },
};

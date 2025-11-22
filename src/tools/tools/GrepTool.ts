import type { Tool } from '../../types/chat';

export const GrepTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for patterns in files using regex. Supports filtering by file type or glob pattern. The path parameter (if provided) must start with / representing the root of the project directory.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression pattern to search for',
          },
          path: {
            type: 'string',
            description: 'Optional file or directory to search in (relative to project root, must start with /). Defaults to project root.',
          },
          glob: {
            type: 'string',
            description: 'Optional glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
          },
          case_insensitive: {
            type: 'boolean',
            description: 'If true, perform case-insensitive search',
          },
          output_mode: {
            type: 'string',
            description: 'Output mode: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts',
            enum: ['content', 'files_with_matches', 'count'],
          },
          context_before: {
            type: 'number',
            description: 'Number of lines to show before each match (only for content mode)',
          },
          context_after: {
            type: 'number',
            description: 'Number of lines to show after each match (only for content mode)',
          },
        },
        required: ['pattern'],
      },
    },
  },

  requiresMainProcess: true,

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Grep tool must be executed in main process');
  },
};

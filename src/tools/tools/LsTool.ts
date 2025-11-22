import type { Tool } from '../../types/chat';

export const LsTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'ls',
      description: 'Lists contents of a directory in the project. The path parameter must start with / representing the root of the project directory. If no path is provided, lists the project root.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list (relative to project root, must start with /). Defaults to project root if not provided.',
          },
          show_hidden: {
            type: 'boolean',
            description: 'If true, include hidden files (starting with .)',
          },
          long_format: {
            type: 'boolean',
            description: 'If true, show detailed information including file sizes and modification times',
          },
        },
        required: [],
      },
    },
  },

  requiresMainProcess: true,

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Ls tool must be executed in main process');
  },
};

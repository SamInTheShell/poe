import type { Tool } from '../../types/chat';

export const ReadTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'read',
      description: 'Reads a file from the project directory. The path parameter must start with / representing the root of the project directory. For example: /src/App.tsx or /README.md',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to read (relative to project root, must start with /)',
          },
          offset: {
            type: 'number',
            description: 'The line number to start reading from (optional, defaults to 0)',
          },
          limit: {
            type: 'number',
            description: 'The maximum number of lines to read (optional, defaults to entire file)',
          },
        },
        required: ['file_path'],
      },
    },
  },

  requiresMainProcess: true,

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Read tool must be executed in main process');
  },
};

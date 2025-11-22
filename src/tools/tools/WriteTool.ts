import type { Tool } from '../../types/chat';

export const WriteTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'write',
      description: 'Writes content to a file in the project directory. Creates the file if it does not exist, or overwrites it if it does. The path parameter must start with / representing the root of the project directory.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to write (relative to project root, must start with /)',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },

  requiresMainProcess: true,
  defaultPermission: 'ask',

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Write tool must be executed in main process');
  },
};

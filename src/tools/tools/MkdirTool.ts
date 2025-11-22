import type { Tool } from '../../types/chat';

export const MkdirTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'mkdir',
      description: 'Creates a new directory within the project. The path must start with / representing the root of the project directory. Parent directories are created automatically if they don\'t exist.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the directory to create (relative to project root, must start with /)',
          },
        },
        required: ['path'],
      },
    },
  },

  requiresMainProcess: true,
  defaultPermission: 'ask',

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Mkdir tool must be executed in main process');
  },
};

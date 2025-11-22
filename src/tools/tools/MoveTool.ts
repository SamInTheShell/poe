import type { Tool } from '../../types/chat';

export const MoveTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'move',
      description: 'Moves or renames files and directories within the project. Both source and destination paths must start with / representing the root of the project directory. This operation is destructive and requires permission.',
      parameters: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'The path to the file or directory to move (relative to project root, must start with /)',
          },
          destination_path: {
            type: 'string',
            description: 'The destination path (relative to project root, must start with /)',
          },
        },
        required: ['source_path', 'destination_path'],
      },
    },
  },

  requiresMainProcess: true,
  defaultPermission: 'ask',

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Move tool must be executed in main process');
  },
};

import type { Tool } from '../../types/chat';

export const RmTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'rm',
      description: 'Removes (deletes) files or directories within the project. The path must start with / representing the root of the project directory. This operation is destructive and cannot be undone - requires permission.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file or directory to remove (relative to project root, must start with /)',
          },
          recursive: {
            type: 'boolean',
            description: 'If true, recursively delete directories and their contents. Required for non-empty directories.',
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
    throw new Error('Rm tool must be executed in main process');
  },
};

import type { Tool } from '../../types/chat';

export const EditTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Performs exact string replacements in files within the project directory. The old_string must match exactly (including whitespace) to be replaced. The path parameter must start with / representing the root of the project directory.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to edit (relative to project root, must start with /)',
          },
          old_string: {
            type: 'string',
            description: 'The exact text to find and replace (must match exactly including whitespace)',
          },
          new_string: {
            type: 'string',
            description: 'The text to replace it with',
          },
          replace_all: {
            type: 'boolean',
            description: 'If true, replace all occurrences. If false (default), only replace if the match is unique.',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },

  requiresMainProcess: true,
  defaultPermission: 'ask',

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Edit tool must be executed in main process');
  },
};

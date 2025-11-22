import type { Tool } from '../../types/chat';

export const BashTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Executes a bash command in the project directory. Use this for terminal operations like git, npm, build commands, etc. All commands run in the project root directory.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute',
          },
          description: {
            type: 'string',
            description: 'Clear, concise description of what this command does (5-10 words)',
          },
          timeout: {
            type: 'number',
            description: 'Optional timeout in milliseconds (default: 120000ms / 2 minutes, max: 600000ms / 10 minutes)',
          },
        },
        required: ['command'],
      },
    },
  },

  requiresMainProcess: true,
  defaultPermission: 'ask',

  async execute() {
    // This will be executed in the main process via IPC
    throw new Error('Bash tool must be executed in main process');
  },
};

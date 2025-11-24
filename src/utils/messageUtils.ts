import type { ChatMessage } from '../types/chat';

/**
 * Helper function to ensure system messages are always first in the messages array
 */
export const ensureSystemPromptFirst = (messages: ChatMessage[], systemPrompt: ChatMessage | null = null): ChatMessage[] => {
  if (messages.length === 0) {
    return systemPrompt ? [systemPrompt] : [];
  }

  // Separate system messages from other messages
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');

  // If systemPrompt is provided, use it as the primary (and only) system message
  // Otherwise, use system messages from the array
  if (systemPrompt) {
    return [systemPrompt, ...otherMessages];
  }

  // No explicit system prompt provided, use system messages from array (should be first already)
  return [...systemMessages, ...otherMessages];
};

/**
 * Helper function to get display name for a session
 */
export const getSessionDisplayName = (sessionId: string, customName: string, isCustom: boolean): string => {
  if (isCustom && customName) {
    return customName;
  }
  if (sessionId === 'default') {
    return 'Default Session';
  }
  // Return first 8 chars of UUID
  return `Session ${sessionId.substring(0, 8)}`;
};

/**
 * Rough estimation of token usage (since Ollama doesn't report tokens)
 */
export const estimateTokenUsage = (messages: ChatMessage[]): number => {
  // Rough estimate: 1 token ≈ 4 characters
  let totalChars = 0;
  for (const message of messages) {
    totalChars += message.content.length;
    // Add some overhead for role, formatting, and tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        totalChars += toolCall.function.name.length;
        totalChars += toolCall.function.arguments.length;
      }
    }
  }
  return Math.ceil(totalChars / 4);
};

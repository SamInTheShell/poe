import type { Tool, ToolDefinition, ParameterSchema } from '../types/chat';
import type { MCPToolInfo, ToolPermission } from '../types/mcp';

export interface MCPToolMetadata {
  serverName: string;
  enabled: boolean;
  permission: ToolPermission;
}

/**
 * Converts MCP tool schema to our internal ToolDefinition format
 */
function convertMCPSchemaToToolDefinition(
  mcpTool: MCPToolInfo,
  serverName: string
): ToolDefinition {
  const properties: Record<string, ParameterSchema> = {};

  // Convert MCP input schema properties to our format
  if (mcpTool.inputSchema.properties) {
    for (const [key, value] of Object.entries(mcpTool.inputSchema.properties)) {
      const prop = value as {
        type?: string;
        description?: string;
        enum?: string[];
        items?: unknown;
      };
      
      const baseProperty: ParameterSchema = {
        type: prop.type || 'string',
        description: prop.description || '',
      };

      if (prop.enum) {
        baseProperty.enum = prop.enum;
      }

      if (prop.items) {
        baseProperty.items = prop.items as ParameterSchema;
      }

      properties[key] = baseProperty;
    }
  }

  return {
    type: 'function',
    function: {
      name: `${serverName}__${mcpTool.name}`,
      description: `[MCP: ${serverName}] ${mcpTool.description}`,
      parameters: {
        type: 'object',
        properties,
        required: mcpTool.inputSchema.required || [],
      },
    },
  };
}

/**
 * Creates a Tool instance from an MCP tool
 */
export function createMCPTool(
  mcpTool: MCPToolInfo,
  metadata: MCPToolMetadata
): Tool {
  const definition = convertMCPSchemaToToolDefinition(mcpTool, metadata.serverName);

  return {
    definition,
    requiresMainProcess: false,
    defaultPermission: metadata.permission,
    execute: async (params: Record<string, unknown>) => {
      // If permission is 'ask', we need to show a confirmation dialog
      // For now, we'll handle this in the chat container
      // The actual MCP call happens through the IPC
      
      const result = await window.electronAPI.mcpCallTool(
        metadata.serverName,
        mcpTool.name,
        params
      );

      if (!result.success) {
        throw new Error(result.error || 'MCP tool call failed');
      }

      // MCP tools return a structured result with content array
      // Convert it to a simpler format
      const mcpResult = result.result as {
        content: Array<{
          type: string;
          text?: string;
          [key: string]: unknown;
        }>;
        isError?: boolean;
      };

      if (mcpResult.isError) {
        throw new Error(
          mcpResult.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n')
        );
      }

      // Extract text content from the result
      const textContent = mcpResult.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      return {
        success: true,
        content: textContent,
        raw: mcpResult,
      };
    },
  };
}

/**
 * Helper to extract server name and tool name from a full tool name
 */
export function parseMCPToolName(fullName: string): {
  serverName: string;
  toolName: string;
} | null {
  const parts = fullName.split('__');
  if (parts.length !== 2) {
    return null;
  }
  return {
    serverName: parts[0],
    toolName: parts[1],
  };
}


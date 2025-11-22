// MCP (Model Context Protocol) types

export type ToolPermission = 'ask' | 'allow';

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  projectPath?: string; // Optional working directory for the MCP server process
}

export interface MCPToolConfig {
  enabled: boolean;
  permission: ToolPermission;
}

export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
  toolSettings?: Record<string, Record<string, MCPToolConfig>>; // serverName -> toolName -> config
}

export interface MCPProjectOverrides {
  envOverrides: Record<string, Record<string, string>>; // serverName -> envVar -> value
}

export type MCPServerState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export interface MCPServerStatus {
  name: string;
  state: MCPServerState;
  running: boolean; // Kept for backwards compatibility, equivalent to state === 'running'
  pid?: number;
  error?: string;
  tools?: MCPToolInfo[];
  startedAt?: string; // ISO timestamp
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPListToolsResult {
  tools: MCPToolInfo[];
}

export interface MCPCallToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPCallToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

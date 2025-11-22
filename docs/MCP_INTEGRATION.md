# MCP (Model Context Protocol) Integration

This document describes the MCP server integration built into MindMachine.

## Overview

The MCP integration allows MindMachine to:
- Connect to external MCP servers
- Dynamically load tools from those servers
- Manage tool permissions (Ask/Allow)
- Enable/disable individual tools
- Restart MCP servers
- Execute tools from the chat interface

## Configuration

### MCP Server Configuration

### MCP Server Configuration

Create a configuration file at `~/.config/poe/mcp.json`:

```json
{
  "mcpServers": {
    "coder-mcp": {
      "command": "uvx",
      "args": [
        "--from",
        "/Users/pilot/repos/github.com/samintheshell/pwd-mcp",
        "--with-editable",
        "/Users/pilot/repos/github.com/samintheshell/pwd-mcp",
        "coder-mcp"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ],
      "env": {
        "CUSTOM_VAR": "value"
      }
    }
  },
  "toolSettings": {
    "coder-mcp": {
      "read_file": {
        "enabled": true,
        "permission": "allow"
      },
      "write_file": {
        "enabled": true,
        "permission": "ask"
      }
    }
  }
}
```

### Tool Settings

Each tool can be configured with:

- **`enabled`**: Whether the tool is available to the AI (default: `true`)
- **`permission`**: How to handle tool execution
  - `allow`: Execute automatically
  - `ask`: Prompt user for permission before executing

### Project-Specific Environment Variable Overrides

POE supports project-specific environment variable overrides for MCP servers. This allows you to customize environment variables per project without modifying the global configuration.

#### How It Works

1. **Global Configuration**: `~/.config/poe/mcp.json` defines default environment variables for each MCP server
2. **Project Overrides**: Each project can override specific environment variables in `.poe/mcp-overrides.json`
3. **UI Management**: Environment variables can be edited in the Tools panel within each MCP server section
4. **Persistence**: Project-specific overrides are automatically saved and restored when reopening projects

#### Managing Environment Variables

In the Tools panel:
1. Expand an MCP server section to view its tools
2. Environment variables appear above the tools list (when present)
3. Edit values directly in the input fields
4. Add new variables using the "Add variable..." field
5. Variables that differ from global defaults are highlighted with a yellow border
6. Custom variables (not in global config) can be removed with the X button
7. Global variables can be reset to default values with the reset button
8. Click the refresh icon next to "Environment Variables" to restart the server with new values

#### Example Use Cases

- **API Keys**: Different API keys per project
- **Database URLs**: Project-specific database connections
- **Debug Levels**: Different logging levels for different projects
- **Working Directories**: Project-specific paths and configurations

#### File Structure

```
project-directory/
├── .poe/
│   └── mcp-overrides.json
└── ... (project files)
```

Example `.poe/mcp-overrides.json`:
```json
{
  "envOverrides": {
    "filesystem": {
      "API_KEY": "project-specific-key",
      "DEBUG_LEVEL": "verbose"
    },
    "coder-mcp": {
      "CUSTOM_PATH": "/project/specific/path"
    }
  }
}
```

### Important Notes

- **MCP servers do NOT start automatically on app launch**
- Servers only start when you enter the chat (after selecting a project directory)
- This ensures the correct working directory (PWD/CWD) is set before tool execution
- MCP configuration is read from `~/.config/poe/mcp.json`

## Architecture

### Components

1. **MCP Server Manager** (`electron/mcp-manager.ts`)
   - Manages lifecycle of MCP server processes
   - Handles JSON-RPC communication with servers
   - Loads tool definitions from servers
   - Executes tool calls

2. **MCP Tool Adapter** (`src/tools/MCPToolAdapter.ts`)
   - Converts MCP tool schemas to internal tool format
   - Wraps MCP tool execution in the tool registry interface
   - Handles permission checks

3. **MCP Tools Manager** (`src/tools/MCPToolsManager.ts`)
   - Initializes MCP servers on startup
   - Registers MCP tools with the tool registry
   - Manages tool configuration and permissions
   - Provides refresh functionality

4. **MCP Panel** (`src/components/chat/MCPPanel.tsx`)
   - Compact sidebar panel in the chat interface
   - Located on the left side of the chat
   - Collapsible to maximize chat space
   - Start/Stop/Restart server controls
   - Per-tool enable/disable toggles
   - Permission level selection
   - Real-time server status indicators

5. **Tool Permission Dialog** (`src/components/ToolPermissionDialog.tsx`)
   - Prompts user before executing tools with `permission: "ask"`
   - Shows tool details and arguments
   - Allow/Deny actions

### IPC Handlers

The following IPC handlers are exposed via `window.electronAPI`:

- `mcpStartServer(name, config)` - Start an MCP server
- `mcpStopServer(name)` - Stop an MCP server
- `mcpRestartServer(name, config)` - Restart an MCP server
- `mcpCallTool(serverName, toolName, args)` - Execute a tool
- `mcpGetServerStatus(name)` - Get single server status
- `mcpGetAllServersStatus()` - Get all servers status

### Tool Naming

MCP tools are registered with a namespaced format:
```
{serverName}__{toolName}
```

For example:
- `coder-mcp__read_file`
- `filesystem__list_directory`

This prevents name collisions between different servers.

## Usage

### Accessing MCP Panel

1. Select a project directory to enter the chat
2. The MCP panel appears on the left side of the chat interface
3. Click the collapse button (chevron icon) to expand/collapse the panel
4. Servers will automatically start when you enter the chat

### Managing Servers

- **Start**: Click the "Start" button next to a stopped server
- **Stop**: Click the "Stop" button next to a running server
- **Restart**: Click the refresh icon next to a running server

### Managing Tools

1. Expand a server's tools list by clicking the accordion
2. Toggle the "Enabled" checkbox to enable/disable a tool
3. Use the dropdown to select permission level:
   - **Allow**: Tool executes automatically
   - **Ask**: User is prompted before execution

### Using Tools in Chat

Once enabled, MCP tools are automatically available to the AI. The AI can call them like any other tool:

```
User: Can you read the file /path/to/file.txt?
Assistant: [Calls coder-mcp__read_file with path parameter]
```

If a tool has `permission: "ask"`, a dialog will appear asking for confirmation before execution.

## Development

### Adding New MCP Servers

1. Add server configuration to `mcp.json`
2. Restart the application or use the MCP Settings UI to start the server
3. Tools will be automatically loaded and registered

### Custom Tool Permissions

To implement custom permission logic:

1. Modify `MCPToolAdapter.ts` to check permissions before execution
2. Integrate with `ToolPermissionDialog.tsx` for user prompts
3. Update `MCPToolsManager.ts` to track permission state

## Troubleshooting

### Server Won't Start

Check:
1. The command path is correct
2. All required dependencies are installed
3. The server logs in the console (Ctrl+Shift+I)

### Tools Not Appearing

1. Ensure the server is running (green "Running" status)
2. Check that tools are enabled in tool settings
3. Try refreshing by restarting the server

### Tool Execution Fails

1. Check the tool arguments in the console
2. Verify the server is still running
3. Check server logs for errors

## Security

- MCP servers run as child processes with limited privileges
- Tool permissions provide user control over dangerous operations
- Servers can only access paths explicitly configured
- All tool executions are logged for audit

## Future Enhancements

Potential improvements:
- Hot-reload configuration without restart
- Tool usage statistics and history
- Batch tool permission approvals
- Server health monitoring and auto-restart
- Tool call rate limiting
- Sandboxed tool execution

import { toolRegistry } from './ToolRegistry';
import { createMCPTool } from './MCPToolAdapter';
import { toolConfigManager } from './ToolConfigManager';
import type { MCPServersConfig, MCPToolInfo, MCPProjectOverrides } from '../types/mcp';
import yaml from 'js-yaml';

class MCPToolsManager {
  private loadedTools: Map<string, { serverName: string; tool: MCPToolInfo }> = new Map();
  private config: MCPServersConfig | null = null;
  private projectOverrides: MCPProjectOverrides | null = null;
  private initialized = false;
  private initializing = false;
  private projectPath: string | null = null;

  /**
   * Initialize MCP tools by loading configuration and starting servers
   * @param projectPath - The project directory path to use as working directory for MCP servers
   */
  async initialize(projectPath?: string): Promise<void> {
    // Store project path for future use
    if (projectPath) {
      this.projectPath = projectPath;
    }
    // Prevent double initialization (important for React StrictMode)
    if (this.initialized) {
      console.log('MCP tools already initialized, skipping');
      return;
    }

    if (this.initializing) {
      console.log('MCP tools initialization already in progress, skipping');
      return;
    }

    this.initializing = true;

    try {
      console.log('Initializing MCP tools...');

      // Load MCP configuration (backend now returns YAML)
      const result = await window.electronAPI.configRead('mcp.json');
      if (!result.success || !result.content) {
        console.log('No MCP configuration found');
        this.initializing = false;
        return;
      }

      try {
        this.config = yaml.load(result.content) as MCPServersConfig;
      } catch (error) {
        console.error('Failed to parse MCP configuration:', error);
        this.initializing = false;
        return;
      }

      // Load project-specific overrides if we have a project path
      if (this.projectPath) {
        await this.loadProjectOverrides();
      }

      // Get current server statuses to check what's already running
      const allStatuses = await window.electronAPI.mcpGetAllServersStatus();
      const runningServers = new Set(
        allStatuses.filter(s => s.running).map(s => s.name)
      );

      // Auto-start all configured servers (skip if already running)
      const startPromises = Object.entries(this.config.mcpServers).map(
        async ([serverName, serverConfig]) => {
          try {
            // Skip if already running
            if (runningServers.has(serverName)) {
              console.log(`MCP server ${serverName} is already running, skipping start`);
              return;
            }

            // Add project path and environment overrides to server config
            const configWithPath = {
              ...serverConfig,
              projectPath: this.projectPath || undefined,
              env: {
                ...serverConfig.env,
                ...(this.projectOverrides?.envOverrides?.[serverName] || {}),
              },
            };

            console.log(`Auto-starting MCP server: ${serverName}${this.projectPath ? ` (cwd: ${this.projectPath})` : ''}`);
            const result = await window.electronAPI.mcpStartServer(serverName, configWithPath);
            if (!result.success) {
              console.error(`Failed to start ${serverName}:`, result.error);
            }
          } catch (error) {
            console.error(`Error starting ${serverName}:`, error);
          }
        }
      );

      await Promise.all(startPromises);

      // Wait a bit for servers to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Load tools from all servers
      await this.refreshTools();

      this.initialized = true;
      this.initializing = false;
      console.log(`MCP initialization complete. Loaded ${this.loadedTools.size} tools.`);
    } catch (error) {
      console.error('MCP initialization failed:', error);
      this.initializing = false;
      throw error;
    }
  }

  /**
   * Refresh tools from all servers and register them
   */
  async refreshTools(): Promise<void> {
    if (!this.config) return;

    // Get current server statuses
    const statuses = await window.electronAPI.mcpGetAllServersStatus();

    // Unregister all previously loaded MCP tools
    for (const [fullToolName] of this.loadedTools.entries()) {
      toolRegistry.unregister(fullToolName);
    }
    this.loadedTools.clear();

    // Register tools from each running server
    for (const status of statuses) {
      if (!status.running || !status.tools) continue;

      for (const toolInfo of status.tools) {
        const toolConfig = this.config.toolSettings?.[status.name]?.[toolInfo.name] || {
          enabled: true,
          permission: 'ask' as const,
        };

        // Only register enabled tools
        if (!toolConfig.enabled) {
          console.log(`Skipping disabled tool: ${status.name}/${toolInfo.name}`);
          continue;
        }

        // Create and register the tool
        const fullToolName = `${status.name}__${toolInfo.name}`;

        try {
          const tool = createMCPTool(toolInfo, {
            serverName: status.name,
            enabled: toolConfig.enabled,
            permission: toolConfig.permission,
          });

          toolRegistry.register(tool);
          this.loadedTools.set(fullToolName, {
            serverName: status.name,
            tool: toolInfo,
          });

          // Ensure the tool config is saved in ToolConfigManager
          toolConfigManager.setConfig(fullToolName, {
            enabled: toolConfig.enabled,
            permission: toolConfig.permission,
            isBuiltIn: false,
            serverName: status.name,
          });

          console.log(`Registered MCP tool: ${fullToolName} with permission: ${toolConfig.permission}`);
        } catch (error) {
          console.error(`Failed to register tool ${fullToolName}:`, error);
        }
      }
    }

    console.log(`Refreshed ${this.loadedTools.size} MCP tools`);
  }

  /**
   * Get all loaded MCP tools
   */
  getLoadedTools(): Array<{ fullName: string; serverName: string; tool: MCPToolInfo }> {
    return Array.from(this.loadedTools.entries()).map(([fullName, data]) => ({
      fullName,
      ...data,
    }));
  }

  /**
   * Check if a tool requires permission
   */
  async requiresPermission(fullToolName: string): Promise<boolean> {
    if (!this.config) return false;

    const toolData = this.loadedTools.get(fullToolName);
    if (!toolData) return false;

    const toolConfig = this.config.toolSettings?.[toolData.serverName]?.[toolData.tool.name];
    return toolConfig?.permission === 'ask';
  }

  /**
   * Load project-specific MCP overrides
   */
  private async loadProjectOverrides(): Promise<void> {
    if (!this.projectPath) return;

    try {
      const result = await window.electronAPI.projectMcpOverridesRead(this.projectPath);
      if (result.success && result.content) {
        // Project overrides are still JSON (they're project-specific)
        this.projectOverrides = JSON.parse(result.content) as MCPProjectOverrides;
        console.log('Loaded project MCP overrides:', this.projectOverrides);
      } else {
        // Initialize empty overrides if file doesn't exist
        this.projectOverrides = { envOverrides: {} };
      }
    } catch (error) {
      console.error('Failed to load project MCP overrides:', error);
      this.projectOverrides = { envOverrides: {} };
    }
  }

  /**
   * Save project-specific MCP overrides
   */
  private async saveProjectOverrides(): Promise<void> {
    if (!this.projectPath || !this.projectOverrides) return;

    try {
      const content = JSON.stringify(this.projectOverrides, null, 2);
      const result = await window.electronAPI.projectMcpOverridesWrite(this.projectPath, content);
      if (!result.success) {
        console.error('Failed to save project MCP overrides:', result.error);
      }
    } catch (error) {
      console.error('Failed to save project MCP overrides:', error);
    }
  }

  /**
   * Get project-specific environment overrides for a server
   */
  getProjectEnvOverrides(serverName: string): Record<string, string> {
    return this.projectOverrides?.envOverrides?.[serverName] || {};
  }

  /**
   * Set project-specific environment override for a server
   */
  async setProjectEnvOverride(serverName: string, key: string, value: string): Promise<void> {
    if (!this.projectOverrides) {
      this.projectOverrides = { envOverrides: {} };
    }

    if (!this.projectOverrides.envOverrides[serverName]) {
      this.projectOverrides.envOverrides[serverName] = {};
    }

    this.projectOverrides.envOverrides[serverName][key] = value;
    await this.saveProjectOverrides();
  }

  /**
   * Remove project-specific environment override for a server
   */
  async removeProjectEnvOverride(serverName: string, key: string): Promise<void> {
    if (!this.projectOverrides?.envOverrides?.[serverName]) return;

    delete this.projectOverrides.envOverrides[serverName][key];

    // Clean up empty server entries
    if (Object.keys(this.projectOverrides.envOverrides[serverName]).length === 0) {
      delete this.projectOverrides.envOverrides[serverName];
    }

    await this.saveProjectOverrides();
  }

  /**
   * Get the global server configuration
   */
  getServerConfig(serverName: string): any {
    return this.config?.mcpServers?.[serverName] || null;
  }

  /**
   * Restart a server with updated environment variables
   */
  async restartServerWithOverrides(serverName: string): Promise<void> {
    if (!this.config?.mcpServers?.[serverName]) return;

    const serverConfig = this.config.mcpServers[serverName];
    const configWithOverrides = {
      ...serverConfig,
      projectPath: this.projectPath || undefined,
      env: {
        ...serverConfig.env,
        ...(this.projectOverrides?.envOverrides?.[serverName] || {}),
      },
    };

    try {
      await window.electronAPI.mcpRestartServer(serverName, configWithOverrides);
    } catch (error) {
      console.error(`Failed to restart server ${serverName} with overrides:`, error);
      throw error;
    }
  }

  /**
   * Get the server name and tool info for a full tool name
   */
  getToolInfo(fullToolName: string): { serverName: string; tool: MCPToolInfo } | null {
    return this.loadedTools.get(fullToolName) || null;
  }
}

export const mcpToolsManager = new MCPToolsManager();

import type { ToolPermission } from '../types/mcp';
import yaml from 'js-yaml';

export interface ToolConfig {
  enabled: boolean;
  permission: ToolPermission;
  isBuiltIn: boolean;
  serverName?: string; // For MCP tools
}

class ToolConfigManager {
  private configs: Map<string, ToolConfig> = new Map();
  private listeners: Set<() => void> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMcpJsonContent: string | null = null;
  private lastToolsJsonContent: string | null = null;

  async loadConfigs(): Promise<void> {
    let configsLoaded = false;

    try {
      // Load MCP config (backend now returns YAML)
      const mcpResult = await window.electronAPI.configRead('mcp.json');
      if (mcpResult.success && mcpResult.content) {
        const mcpData = yaml.load(mcpResult.content) as { toolSettings?: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> };

        // Load MCP tool settings
        if (mcpData.toolSettings) {
          for (const [serverName, tools] of Object.entries(mcpData.toolSettings)) {
            for (const [toolName, config] of Object.entries(tools as Record<string, { enabled: boolean; permission: ToolPermission }>)) {
              const fullName = `${serverName}__${toolName}`;
              this.configs.set(fullName, {
                enabled: config.enabled,
                permission: config.permission,
                isBuiltIn: false,
                serverName,
              });
            }
          }
        }
      }

      // Load built-in tool config
      const builtInResult = await window.electronAPI.configRead('tools.json');
      if (builtInResult.success && builtInResult.content) {
        this.lastToolsJsonContent = builtInResult.content;
        const builtInData = JSON.parse(builtInResult.content);
        for (const [toolName, config] of Object.entries(builtInData as Record<string, { enabled: boolean; permission: ToolPermission }>)) {
          this.configs.set(toolName, {
            enabled: config.enabled,
            permission: config.permission,
            isBuiltIn: true,
          });
        }
        configsLoaded = true;
      }

      // Cache MCP config content
      if (mcpResult.success && mcpResult.content) {
        this.lastMcpJsonContent = mcpResult.content;
      }
    } catch (error) {
      console.error('Failed to load tool configs:', error);
    }

    // If no configs were loaded (fresh start), initialize with defaults
    if (!configsLoaded) {
      await this.initializeDefaults();
    }

    this.notifyListeners();
  }

  private async initializeDefaults(): Promise<void> {
    // Define default permissions for built-in tools
    const defaultConfigs: Record<string, ToolPermission> = {
      // Allow permissions (read-only operations)
      read: 'allow',
      glob: 'allow',
      grep: 'allow',
      ls: 'allow',

      // Ask permissions (write/modify operations)
      write: 'ask',
      edit: 'ask',
      bash: 'ask',
      move: 'ask',
      rm: 'ask',
      mkdir: 'ask',
    };

    // Set defaults in memory
    for (const [toolName, permission] of Object.entries(defaultConfigs)) {
      this.configs.set(toolName, {
        enabled: true,
        permission,
        isBuiltIn: true,
      });
    }

    // Save to disk immediately (no debounce needed for initial setup)
    await this.saveConfigs(true);
    console.log('Initialized default tool configurations');
  }

  async saveConfigs(immediate: boolean = false): Promise<void> {
    // Cancel any pending save
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // If immediate, save right away, otherwise debounce
    if (!immediate) {
      this.saveTimer = setTimeout(() => {
        this.saveConfigs(true);
      }, 500); // Debounce for 500ms
      return;
    }

    try {
      // Separate built-in and MCP configs
      const builtInConfigs: Record<string, { enabled: boolean; permission: ToolPermission }> = {};
      const mcpConfigs: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> = {};

      for (const [toolName, config] of this.configs.entries()) {
        if (config.isBuiltIn) {
          builtInConfigs[toolName] = {
            enabled: config.enabled,
            permission: config.permission,
          };
        } else if (config.serverName) {
          if (!mcpConfigs[config.serverName]) {
            mcpConfigs[config.serverName] = {};
          }
          // Extract just the tool name (after the server prefix)
          const shortName = toolName.replace(`${config.serverName}__`, '');
          mcpConfigs[config.serverName][shortName] = {
            enabled: config.enabled,
            permission: config.permission,
          };
        }
      }

      // Save built-in configs only if changed
      const toolsJson = JSON.stringify(builtInConfigs, null, 2);
      if (toolsJson !== this.lastToolsJsonContent) {
        await window.electronAPI.configWrite('tools.json', toolsJson);
        this.lastToolsJsonContent = toolsJson;
      }

      // Save MCP configs (merge with existing mcp.yaml, but use cached content if available)
      let mcpData: { mcpServers?: Record<string, unknown>; toolSettings: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> } = { mcpServers: {}, toolSettings: mcpConfigs };
      if (this.lastMcpJsonContent) {
        try {
          const existing = yaml.load(this.lastMcpJsonContent) as { mcpServers?: Record<string, unknown>; toolSettings?: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> };
          mcpData = { ...existing, toolSettings: mcpConfigs };
        } catch (e) {
          // If cached content is invalid, read fresh
          const mcpResult = await window.electronAPI.configRead('mcp.json');
          if (mcpResult.success && mcpResult.content) {
            const existing = yaml.load(mcpResult.content) as { mcpServers?: Record<string, unknown>; toolSettings?: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> };
            mcpData = { ...existing, toolSettings: mcpConfigs };
            this.lastMcpJsonContent = mcpResult.content;
          }
        }
      } else {
        // No cached content, read fresh
        const mcpResult = await window.electronAPI.configRead('mcp.json');
        if (mcpResult.success && mcpResult.content) {
          const existing = yaml.load(mcpResult.content) as { mcpServers?: Record<string, unknown>; toolSettings?: Record<string, Record<string, { enabled: boolean; permission: ToolPermission }>> };
          mcpData = { ...existing, toolSettings: mcpConfigs };
          this.lastMcpJsonContent = mcpResult.content;
        }
      }

      // Only write if toolSettings actually changed (backend handles YAML conversion)
      const mcpYaml = yaml.dump(mcpData, { indent: 2, lineWidth: -1 });
      if (mcpYaml !== this.lastMcpJsonContent) {
        await window.electronAPI.configWrite('mcp.json', mcpYaml);
        this.lastMcpJsonContent = mcpYaml;
      }
    } catch (error) {
      console.error('Failed to save tool configs:', error);
    }
  }

  getConfig(toolName: string, defaultPermission: ToolPermission = 'allow'): ToolConfig {
    return this.configs.get(toolName) || {
      enabled: true,
      permission: defaultPermission,
      isBuiltIn: !toolName.includes('__'),
    };
  }

  setConfig(toolName: string, config: Partial<ToolConfig>): void {
    const existing = this.getConfig(toolName);
    const updated = { ...existing, ...config };
    this.configs.set(toolName, updated);
    // Debounced save - will batch multiple rapid changes
    this.saveConfigs(false);
    this.notifyListeners();
  }

  isEnabled(toolName: string): boolean {
    return this.getConfig(toolName).enabled;
  }

  requiresPermission(toolName: string): boolean {
    return this.getConfig(toolName).permission === 'ask';
  }

  getAllConfigs(): Map<string, ToolConfig> {
    return new Map(this.configs);
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

export const toolConfigManager = new ToolConfigManager();


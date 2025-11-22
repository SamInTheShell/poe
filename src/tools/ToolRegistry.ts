import type { Tool, ToolDefinition } from '../types/chat';
import { toolConfigManager } from './ToolConfigManager';

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.definition.function.name, tool);
  }

  unregister(toolName: string) {
    this.tools.delete(toolName);
  }

  getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  getDefinitions(): ToolDefinition[] {
    // Only return definitions for enabled tools
    return Array.from(this.tools.values())
      .filter(t => {
        const toolName = t.definition.function.name;
        const config = toolConfigManager.getConfig(toolName, t.defaultPermission);
        return config.enabled;
      })
      .map(t => t.definition);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(toolName: string, params: Record<string, unknown>, projectPath?: string): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`);
    }

    // Check if tool is enabled
    const config = toolConfigManager.getConfig(toolName, tool.defaultPermission);
    if (!config.enabled) {
      throw new Error(`Tool "${toolName}" is disabled`);
    }

    if (tool.requiresMainProcess) {
      // Internal tools require projectPath
      if (!projectPath) {
        throw new Error(`Tool "${toolName}" requires a project path`);
      }

      // Execute internal tools via their specific IPC handlers
      switch (toolName) {
        case 'read':
          return await window.electronAPI.internalToolRead(projectPath, params as any);
        case 'write':
          return await window.electronAPI.internalToolWrite(projectPath, params as any);
        case 'edit':
          return await window.electronAPI.internalToolEdit(projectPath, params as any);
        case 'find':
          return await window.electronAPI.internalToolGlob(projectPath, params as any);
        case 'grep':
          return await window.electronAPI.internalToolGrep(projectPath, params as any);
        case 'bash':
          return await window.electronAPI.internalToolBash(projectPath, params as any);
        case 'ls':
          return await window.electronAPI.internalToolLs(projectPath, params as any);
        case 'rm':
          return await window.electronAPI.internalToolRm(projectPath, params as any);
        case 'move':
          return await window.electronAPI.internalToolMove(projectPath, params as any);
        case 'mkdir':
          return await window.electronAPI.internalToolMkdir(projectPath, params as any);
        default:
          // For other tools that require main process (future expansion)
          return await window.electronAPI.executeTool(toolName, params);
      }
    }

    // Execute in renderer process
    return await tool.execute(params);
  }

  requiresPermission(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    const config = toolConfigManager.getConfig(toolName, tool?.defaultPermission);
    return config.permission === 'ask';
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();

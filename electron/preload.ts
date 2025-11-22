// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron");

console.log("Preload script loading...");

const electronAPI = {
  // Window controls
  minimizeWindow: () => {
    console.log("Calling window-minimize");
    return ipcRenderer.invoke("window-minimize");
  },
  maximizeWindow: () => {
    console.log("Calling window-maximize");
    return ipcRenderer.invoke("window-maximize");
  },
  closeWindow: () => {
    console.log("Calling window-close");
    return ipcRenderer.invoke("window-close");
  },
  // Database functions
  store: (input: string) => {
    console.log("Calling database-store");
    return ipcRenderer.invoke("database-store", input);
  },
  search: (query: string, count?: number) => {
    console.log("Calling database-search");
    return ipcRenderer.invoke("database-search", query, count);
  },
  demoVectorDatabase: () => {
    console.log("Calling database-demo");
    return ipcRenderer.invoke("database-demo");
  },
  // Directory selection functions
  selectDirectory: () => {
    console.log("Calling select-directory");
    return ipcRenderer.invoke("select-directory");
  },
  expandPath: (inputPath: string) => {
    console.log("Calling expand-path");
    return ipcRenderer.invoke("expand-path", inputPath);
  },
  validateDirectory: (dirPath: string) => {
    console.log("Calling validate-directory");
    return ipcRenderer.invoke("validate-directory", dirPath);
  },
  changeWorkingDirectory: (dirPath: string) => {
    console.log("Calling change-working-directory");
    return ipcRenderer.invoke("change-working-directory", dirPath);
  },
  // Config file functions
  configRead: (filename: string) => {
    return ipcRenderer.invoke("config-read", filename);
  },
  configWrite: (filename: string, content: string) => {
    return ipcRenderer.invoke("config-write", filename, content);
  },
  configInitDefaults: (filename: string, template: string) => {
    console.log("Calling config-init-defaults");
    return ipcRenderer.invoke("config-init-defaults", filename, template);
  },
  // Project MCP override functions
  projectMcpOverridesRead: (projectPath: string) => {
    console.log("Calling project-mcp-overrides-read");
    return ipcRenderer.invoke("project-mcp-overrides-read", projectPath);
  },
  projectMcpOverridesWrite: (projectPath: string, content: string) => {
    console.log("Calling project-mcp-overrides-write");
    return ipcRenderer.invoke("project-mcp-overrides-write", projectPath, content);
  },
  // Project context mode functions
  projectContextModeRead: (projectPath: string) => {
    console.log("Calling project-context-mode-read");
    return ipcRenderer.invoke("project-context-mode-read", projectPath);
  },
  projectContextModeWrite: (projectPath: string, mode: string) => {
    console.log("Calling project-context-mode-write");
    return ipcRenderer.invoke("project-context-mode-write", projectPath, mode);
  },
  // Chat functions
  chatSendMessage: (params: {
    provider: string;
    model: string;
    messages: unknown[];
    tools?: unknown[];
  }) => {
    console.log("Calling chat-send-message");
    return ipcRenderer.invoke("chat-send-message", params);
  },
  chatCancel: () => {
    console.log("Calling chat-cancel");
    return ipcRenderer.invoke("chat-cancel");
  },
  chatGetContextLength: (params: {
    provider: string;
    model: string;
  }) => {
    console.log("Calling chat-get-context-length");
    return ipcRenderer.invoke("chat-get-context-length", params);
  },
  onChatChunk: (callback: (chunk: unknown) => void) => {
    ipcRenderer.on("chat-chunk", (_, chunk) => callback(chunk));
  },
  removeChatChunkListener: () => {
    ipcRenderer.removeAllListeners("chat-chunk");
  },
  executeTool: (toolName: string, params: Record<string, unknown>) => {
    console.log("Calling execute-tool");
    return ipcRenderer.invoke("execute-tool", toolName, params);
  },
  getHomeDir: () => {
    return ipcRenderer.invoke("get-home-dir");
  },

  // Session storage functions
  sessionSave: (projectPath: string, sessionId: string, messages: unknown[], sessionName?: string, isCustomName?: boolean, providerId?: string, modelId?: string) => {
    console.log("Calling session-save");
    return ipcRenderer.invoke("session-save", projectPath, sessionId, messages, sessionName, isCustomName, providerId, modelId);
  },
  sessionLoad: (projectPath: string, sessionId: string) => {
    console.log("Calling session-load");
    return ipcRenderer.invoke("session-load", projectPath, sessionId);
  },
  sessionList: (projectPath: string) => {
    console.log("Calling session-list");
    return ipcRenderer.invoke("session-list", projectPath);
  },
  sessionDelete: (projectPath: string, sessionId: string) => {
    console.log("Calling session-delete");
    return ipcRenderer.invoke("session-delete", projectPath, sessionId);
  },
  sessionClearAll: (projectPath: string) => {
    console.log("Calling session-clear-all");
    return ipcRenderer.invoke("session-clear-all", projectPath);
  },
  sessionGetLast: (projectPath: string) => {
    console.log("Calling session-get-last");
    return ipcRenderer.invoke("session-get-last", projectPath);
  },

  // Recent projects functions
  recentProjectsAdd: (projectPath: string) => {
    console.log("Calling recent-projects-add");
    return ipcRenderer.invoke("recent-projects-add", projectPath);
  },
  recentProjectsGet: () => {
    console.log("Calling recent-projects-get");
    return ipcRenderer.invoke("recent-projects-get");
  },
  recentProjectsClear: () => {
    console.log("Calling recent-projects-clear");
    return ipcRenderer.invoke("recent-projects-clear");
  },

  // Preferences functions
  preferencesGet: (key: string) => {
    console.log("Calling preferences-get");
    return ipcRenderer.invoke("preferences-get", key);
  },
  preferencesSet: (key: string, value: unknown) => {
    console.log("Calling preferences-set");
    return ipcRenderer.invoke("preferences-set", key, value);
  },

  // Prompt management functions
  promptsList: () => {
    return ipcRenderer.invoke("prompts-list");
  },
  promptsRead: (name: string) => {
    return ipcRenderer.invoke("prompts-read", name);
  },
  promptsWrite: (name: string, content: string) => {
    return ipcRenderer.invoke("prompts-write", name, content);
  },
  promptsDelete: (name: string) => {
    return ipcRenderer.invoke("prompts-delete", name);
  },

  // MCP functions
  mcpStartServer: (name: string, config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }) => {
    console.log("Calling mcp-start-server");
    return ipcRenderer.invoke("mcp-start-server", name, config);
  },
  mcpStopServer: (name: string) => {
    console.log("Calling mcp-stop-server");
    return ipcRenderer.invoke("mcp-stop-server", name);
  },
  mcpRestartServer: (name: string, config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }) => {
    console.log("Calling mcp-restart-server");
    return ipcRenderer.invoke("mcp-restart-server", name, config);
  },
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) => {
    console.log("Calling mcp-call-tool");
    return ipcRenderer.invoke("mcp-call-tool", serverName, toolName, args);
  },
  mcpGetServerStatus: (name: string) => {
    console.log("Calling mcp-get-server-status");
    return ipcRenderer.invoke("mcp-get-server-status", name);
  },
  mcpGetAllServersStatus: () => {
    console.log("Calling mcp-get-all-servers-status");
    return ipcRenderer.invoke("mcp-get-all-servers-status");
  },
  mcpReconcileServers: (newConfig: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
    projectPath?: string;
  }>) => {
    console.log("Calling mcp-reconcile-servers");
    return ipcRenderer.invoke("mcp-reconcile-servers", newConfig);
  },

  // Internal tool functions
  internalToolRead: (projectPath: string, params: {
    file_path: string;
    offset?: number;
    limit?: number;
  }) => {
    console.log("Calling internal-tool-read");
    return ipcRenderer.invoke("internal-tool-read", projectPath, params);
  },
  internalToolWrite: (projectPath: string, params: {
    file_path: string;
    content: string;
  }) => {
    console.log("Calling internal-tool-write");
    return ipcRenderer.invoke("internal-tool-write", projectPath, params);
  },
  internalToolEdit: (projectPath: string, params: {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }) => {
    console.log("Calling internal-tool-edit");
    return ipcRenderer.invoke("internal-tool-edit", projectPath, params);
  },
  internalToolGlob: (projectPath: string, params: {
    pattern: string;
    path?: string;
  }) => {
    console.log("Calling internal-tool-glob");
    return ipcRenderer.invoke("internal-tool-glob", projectPath, params);
  },
  internalToolGrep: (projectPath: string, params: {
    pattern: string;
    path?: string;
    glob?: string;
    case_insensitive?: boolean;
    output_mode?: 'content' | 'files_with_matches' | 'count';
    context_before?: number;
    context_after?: number;
  }) => {
    console.log("Calling internal-tool-grep");
    return ipcRenderer.invoke("internal-tool-grep", projectPath, params);
  },
  internalToolBash: (projectPath: string, params: {
    command: string;
    description?: string;
    timeout?: number;
  }) => {
    console.log("Calling internal-tool-bash");
    return ipcRenderer.invoke("internal-tool-bash", projectPath, params);
  },
  internalToolLs: (projectPath: string, params: {
    path?: string;
    show_hidden?: boolean;
    long_format?: boolean;
  }) => {
    console.log("Calling internal-tool-ls");
    return ipcRenderer.invoke("internal-tool-ls", projectPath, params);
  },
  internalToolMove: (projectPath: string, params: {
    source_path: string;
    destination_path: string;
  }) => {
    console.log("Calling internal-tool-move");
    return ipcRenderer.invoke("internal-tool-move", projectPath, params);
  },
  internalToolRm: (projectPath: string, params: {
    path: string;
    recursive?: boolean;
  }) => {
    console.log("Calling internal-tool-rm");
    return ipcRenderer.invoke("internal-tool-rm", projectPath, params);
  },
  internalToolMkdir: (projectPath: string, params: {
    path: string;
  }) => {
    console.log("Calling internal-tool-mkdir");
    return ipcRenderer.invoke("internal-tool-mkdir", projectPath, params);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

console.log("electronAPI exposed to main world");

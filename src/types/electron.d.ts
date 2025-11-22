interface VectorRecord {
  id: string;
  original_string: string;
  prompt_eval_count: number;
  distance?: number;
}

interface DirectoryValidationResult {
  valid: boolean;
  error: string | null;
}

interface WorkingDirectoryChangeResult {
  success: boolean;
  error: string | null;
}

interface ConfigReadResult {
  success: boolean;
  content: string | null;
  error: string | null;
}

interface ConfigWriteResult {
  success: boolean;
  error: string | null;
}

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  // Database functions
  store: (input: string) => Promise<string>
  search: (query: string, count?: number) => Promise<VectorRecord[]>
  demoVectorDatabase: () => Promise<void>
  // Directory selection functions
  selectDirectory: () => Promise<string | null>
  expandPath: (inputPath: string) => Promise<string>
  validateDirectory: (dirPath: string) => Promise<DirectoryValidationResult>
  changeWorkingDirectory: (dirPath: string) => Promise<WorkingDirectoryChangeResult>
  // Config file functions
  configRead: (filename: string) => Promise<ConfigReadResult>
  configWrite: (filename: string, content: string) => Promise<ConfigWriteResult>
  configInitDefaults: (filename: string, template: string) => Promise<ConfigWriteResult>
  // Project MCP override functions
  projectMcpOverridesRead: (projectPath: string) => Promise<ConfigReadResult>
  projectMcpOverridesWrite: (projectPath: string, content: string) => Promise<ConfigWriteResult>
  // Project context mode functions
  projectContextModeRead: (projectPath: string) => Promise<{ success: boolean; mode: string; error: string | null }>
  projectContextModeWrite: (projectPath: string, mode: string) => Promise<ConfigWriteResult>
  // Chat functions
  chatSendMessage: (params: {
    provider: string;
    model: string;
    messages: unknown[];
    tools?: unknown[];
  }) => Promise<{ success: boolean; error?: string }>
  chatCancel: () => Promise<{ success: boolean; error?: string }>
  chatGetContextLength: (params: {
    provider: string;
    model: string;
  }) => Promise<{ success: boolean; contextLength?: number; error?: string }>
  onChatChunk: (callback: (chunk: unknown) => void) => void
  removeChatChunkListener: () => void
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<unknown>
  getHomeDir: () => Promise<string>

  // Session storage functions
  sessionSave: (projectPath: string, sessionId: string, messages: unknown[], sessionName?: string, isCustomName?: boolean, providerId?: string, modelId?: string) => Promise<{ success: boolean; error: string | null }>
  sessionLoad: (projectPath: string, sessionId: string) => Promise<{ success: boolean; messages: unknown[] | null; lastModified?: string; name?: string; isCustomName?: boolean; providerId?: string | null; modelId?: string | null; error: string | null }>
  sessionList: (projectPath: string) => Promise<{ success: boolean; sessions: Array<{ id: string; lastModified: string; messageCount: number; name: string; isCustomName: boolean }>; error: string | null }>
  sessionDelete: (projectPath: string, sessionId: string) => Promise<{ success: boolean; error: string | null }>
  sessionClearAll: (projectPath: string) => Promise<{ success: boolean; error: string | null }>
  sessionGetLast: (projectPath: string) => Promise<{ success: boolean; sessionId: string | null; error: string | null }>

  // Recent projects functions
  recentProjectsAdd: (projectPath: string) => Promise<{ success: boolean; error: string | null }>
  recentProjectsGet: () => Promise<{ success: boolean; projects: Array<{ path: string; lastAccessed: string }>; error: string | null }>
  recentProjectsClear: () => Promise<{ success: boolean; error: string | null }>

  // Preferences functions
  preferencesGet: (key: string) => Promise<{ success: boolean; value: unknown; error: string | null }>
  preferencesSet: (key: string, value: unknown) => Promise<{ success: boolean; error: string | null }>

  // Prompt management functions
  promptsList: () => Promise<{ success: boolean; prompts: string[]; error: string | null }>
  promptsRead: (name: string) => Promise<{ success: boolean; content: string | null; error: string | null }>
  promptsWrite: (name: string, content: string) => Promise<{ success: boolean; error: string | null }>
  promptsDelete: (name: string) => Promise<{ success: boolean; error: string | null }>

  // MCP functions
  mcpStartServer: (name: string, config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }) => Promise<{ success: boolean; error: string | null }>
  mcpStopServer: (name: string) => Promise<{ success: boolean; error: string | null }>
  mcpRestartServer: (name: string, config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }) => Promise<{ success: boolean; error: string | null }>
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    result: unknown;
    error: string | null;
  }>
  mcpGetServerStatus: (name: string) => Promise<{
    name: string;
    running: boolean;
    pid?: number;
    error?: string;
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
    }>;
  } | null>
  mcpGetAllServersStatus: () => Promise<Array<{
    name: string;
    state: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
    running: boolean;
    pid?: number;
    error?: string;
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
    }>;
    startedAt?: string;
  }>>
  mcpReconcileServers: (newConfig: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
    projectPath?: string;
  }>) => Promise<{
    success: boolean;
    error: string | null;
  }>

  // Internal tool functions
  internalToolRead: (projectPath: string, params: {
    file_path: string;
    offset?: number;
    limit?: number;
  }) => Promise<{
    success: boolean;
    content?: string;
    total_lines?: number;
    lines_returned?: number;
    offset?: number;
    error?: string;
  }>
  internalToolWrite: (projectPath: string, params: {
    file_path: string;
    content: string;
  }) => Promise<{
    success: boolean;
    file_path?: string;
    bytes_written?: number;
    old_content?: string | null;
    new_content?: string;
    error?: string;
  }>
  internalToolEdit: (projectPath: string, params: {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }) => Promise<{
    success: boolean;
    file_path?: string;
    replacements?: number;
    error?: string;
  }>
  internalToolGlob: (projectPath: string, params: {
    pattern: string;
    path?: string;
  }) => Promise<{
    success: boolean;
    files?: string[];
    count?: number;
    error?: string;
  }>
  internalToolGrep: (projectPath: string, params: {
    pattern: string;
    path?: string;
    glob?: string;
    case_insensitive?: boolean;
    output_mode?: 'content' | 'files_with_matches' | 'count';
    context_before?: number;
    context_after?: number;
  }) => Promise<{
    success: boolean;
    files?: string[];
    count?: number;
    content?: string;
    error?: string;
  }>
  internalToolBash: (projectPath: string, params: {
    command: string;
    description?: string;
    timeout?: number;
  }) => Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    command?: string;
    exit_code?: number;
    error?: string;
  }>
  internalToolLs: (projectPath: string, params: {
    path?: string;
    show_hidden?: boolean;
    long_format?: boolean;
  }) => Promise<{
    success: boolean;
    path?: string;
    entries?: string[] | Array<{
      name: string;
      type: 'directory' | 'file' | 'other';
      size: number;
      modified: string;
    }>;
    count?: number;
    error?: string;
  }>
  internalToolMove: (projectPath: string, params: {
    source_path: string;
    destination_path: string;
  }) => Promise<{
    success: boolean;
    source_path?: string;
    destination_path?: string;
    type?: 'file' | 'directory';
    error?: string;
  }>
  internalToolRm: (projectPath: string, params: {
    path: string;
    recursive?: boolean;
  }) => Promise<{
    success: boolean;
    path?: string;
    type?: 'file' | 'directory';
    recursive?: boolean;
    error?: string;
  }>
  internalToolMkdir: (projectPath: string, params: {
    path: string;
  }) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

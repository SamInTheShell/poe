import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import { mcpManager } from "./mcp-manager";
import { providerRegistry } from "./providers/ProviderRegistry";
import type { ChatMessage as ProviderChatMessage, ToolCall, ToolResult } from "./providers/types";
import {
  handleRead,
  handleWrite,
  handleEdit,
  handleGlob,
  handleGrep,
  handleBash,
  handleLs,
  handleMove,
  handleRm,
  handleMkdir,
} from "./internal-tools";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR_NAME = "poe";

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = app.isPackaged
  ? path.join(__dirname, "../dist")
  : path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let currentStreamAbortController: AbortController | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

function launchNewInstance() {
  console.log("Launching new instance of the application");

  // Get the path to the Electron executable
  const electronPath = process.execPath;

  // In development, we need to pass the app path
  // In production, the app is bundled into the executable
  if (app.isPackaged) {
    // Production: spawn a new instance of the packaged app
    spawn(electronPath, [], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    // Development: spawn electron with the app directory
    const appPath = process.env.APP_ROOT || path.join(__dirname, "..");
    spawn(electronPath, [appPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
}

app.whenReady().then(() => {
  // Create application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+N",
          click: () => launchNewInstance(),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        // Removed "reload" and "forceReload" to allow CTRL/CMD+R for regenerate
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  // On macOS, add the app name menu
  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();
});

app.on("window-all-closed", async () => {
  await mcpManager.stopAll();
  app.quit();
});

app.on("activate", () => {
  // On macOS, clicking the dock icon should always launch a new instance
  launchNewInstance();
});

// TitleBar Button IPC Handlers
ipcMain.handle("window-minimize", () => {
  console.log("Received window-minimize");
  if (!win) return;
  win.minimize();
});

ipcMain.handle("window-maximize", () => {
  console.log("Received window-maximize");
  if (!win) return;
  if (win.isMaximized()) {
    win.restore();
  } else {
    win.maximize();
  }
});

ipcMain.handle("window-close", () => {
  console.log("Received window-close");
  if (!win) return;
  win.close();
});

// Database IPC handlers
ipcMain.handle("database-store", async (_, input: string) => {
  console.log("Received database-store");
  return await store(input);
});

ipcMain.handle("database-search", async (_, query: string, count?: number) => {
  console.log("Received database-search");
  return await search(query, count);
});

ipcMain.handle("database-demo", async () => {
  console.log("Received database-demo");
  return await demoVectorDatabase();
});

// Directory selection IPC handlers
ipcMain.handle("select-directory", async () => {
  console.log("Received select-directory");
  if (!win) return null;

  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("expand-path", async (_, inputPath: string) => {
  console.log("Received expand-path:", inputPath);

  if (inputPath.startsWith("~")) {
    return path.join(homedir(), inputPath.slice(1));
  }

  return inputPath;
});

ipcMain.handle("validate-directory", async (_, dirPath: string) => {
  console.log("Received validate-directory:", dirPath);

  try {
    if (!existsSync(dirPath)) {
      return { valid: false, error: "Path does not exist" };
    }

    const stats = statSync(dirPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: "Path is not a directory" };
    }

    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("change-working-directory", async (_, dirPath: string) => {
  console.log("Received change-working-directory:", dirPath);

  try {
    console.log("BEFORE: Current working directory:", process.cwd());
    process.chdir(dirPath);
    console.log("AFTER: Current working directory:", process.cwd());

    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to change working directory:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Helper function to check if a file is YAML
function isYamlFile(filename: string): boolean {
  return filename.endsWith(".yaml") || filename.endsWith(".yml");
}

// Helper function to parse config content (YAML or JSON)
function parseConfig(content: string, filename: string): unknown {
  if (isYamlFile(filename)) {
    return yaml.load(content);
  }
  return JSON.parse(content);
}

// Helper function to stringify config content (YAML or JSON)
function stringifyConfig(data: unknown, filename: string): string {
  if (isYamlFile(filename)) {
    return yaml.dump(data, { indent: 2, lineWidth: -1 });
  }
  return JSON.stringify(data, null, 2);
}

// Helper function to migrate JSON config to YAML
async function migrateJsonToYaml(jsonPath: string, yamlPath: string): Promise<void> {
  if (!existsSync(jsonPath)) {
    return;
  }
  
  if (existsSync(yamlPath)) {
    // YAML already exists, don't migrate
    return;
  }

  try {
    const content = await readFile(jsonPath, "utf-8");
    const data = JSON.parse(content);
    const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });
    await writeFile(yamlPath, yamlContent, "utf-8");
    console.log(`Migrated ${jsonPath} to ${yamlPath}`);
  } catch (error) {
    console.error(`Failed to migrate ${jsonPath} to ${yamlPath}:`, error);
  }
}

// Config file IPC handlers
ipcMain.handle("config-read", async (_, filename: string) => {
  try {
    // For providers and mcp, check both YAML and JSON (for migration)
    if (filename === "providers.json" || filename === "mcp.json") {
      const yamlFilename = filename.replace(".json", ".yaml");
      const yamlPath = path.join(homedir(), ".config", CONFIG_DIR_NAME, yamlFilename);
      const jsonPath = path.join(homedir(), ".config", CONFIG_DIR_NAME, filename);
      
      // Prefer YAML if it exists
      if (existsSync(yamlPath)) {
        const content = await readFile(yamlPath, "utf-8");
        return { success: true, content, error: null };
      }
      
      // Try to migrate JSON to YAML if JSON exists
      if (existsSync(jsonPath)) {
        await migrateJsonToYaml(jsonPath, yamlPath);
        if (existsSync(yamlPath)) {
          const content = await readFile(yamlPath, "utf-8");
          return { success: true, content, error: null };
        }
        // Fall back to JSON if migration failed
        const content = await readFile(jsonPath, "utf-8");
        return { success: true, content, error: null };
      }
      
      return { success: false, content: null, error: "File does not exist" };
    }

    // For other files, read directly
    const configPath = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      filename,
    );

    if (!existsSync(configPath)) {
      return { success: false, content: null, error: "File does not exist" };
    }

    const content = await readFile(configPath, "utf-8");
    return { success: true, content, error: null };
  } catch (error) {
    console.error("Failed to read config file:", error);
    return {
      success: false,
      content: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("config-write", async (_, filename: string, content: string) => {
  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    
    // For providers and mcp, convert .json to .yaml
    let actualFilename = filename;
    if (filename === "providers.json" || filename === "mcp.json") {
      actualFilename = filename.replace(".json", ".yaml");
    }
    
    const configPath = path.join(configDir, actualFilename);

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Validate content based on file type
    try {
      if (isYamlFile(actualFilename)) {
        yaml.load(content); // Validate YAML
      } else {
        JSON.parse(content); // Validate JSON
      }
    } catch (parseError) {
      return {
        success: false,
        error: `Invalid ${isYamlFile(actualFilename) ? "YAML" : "JSON"}: ${parseError instanceof Error ? parseError.message : "Parse error"}`,
      };
    }

    // Write file
    await writeFile(configPath, content, "utf-8");
    
    // If we wrote a YAML file and the old JSON exists, optionally delete it (keep it for now for safety)
    // TODO: Could add logic to delete old JSON after migration period

    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to write config file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle(
  "config-init-defaults",
  async (_, filename: string, template: string) => {
    console.log("Received config-init-defaults:", filename);

    try {
      const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
      
      // For providers and mcp, use .yaml extension
      let actualFilename = filename;
      if (filename === "providers.json" || filename === "mcp.json") {
        actualFilename = filename.replace(".json", ".yaml");
      }
      
      const configPath = path.join(configDir, actualFilename);

      // Only create if doesn't exist (check both YAML and JSON for migration)
      if (!existsSync(configPath)) {
        // Check for old JSON file and migrate if exists
        if ((filename === "providers.json" || filename === "mcp.json")) {
          const jsonPath = path.join(configDir, filename);
          if (existsSync(jsonPath)) {
            await migrateJsonToYaml(jsonPath, configPath);
            if (existsSync(configPath)) {
              console.log("Migrated existing config file:", configPath);
              return { success: true, error: null };
            }
          }
        }
        
        // Ensure directory exists
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        await writeFile(configPath, template, "utf-8");
        console.log("Created default config file:", configPath);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to initialize default config:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

// Session storage IPC handlers
ipcMain.handle(
  "session-save",
  async (
    _,
    projectPath: string,
    sessionId: string,
    messages: unknown[],
    sessionName?: string,
    isCustomName?: boolean,
    providerId?: string,
    modelId?: string,
  ) => {
    console.log(
      "Received session-save for project:",
      projectPath,
      "session:",
      sessionId,
    );

    try {
      const sessionsDir = path.join(
        homedir(),
        ".config",
        CONFIG_DIR_NAME,
        "chat-sessions",
      );

      // Ensure directory exists
      if (!existsSync(sessionsDir)) {
        mkdirSync(sessionsDir, { recursive: true });
      }

      // Create a sanitized filename from the project path and session ID
      const sanitizedPath = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
      const sessionFile = path.join(
        sessionsDir,
        `${sanitizedPath}_${sessionId}.json`,
      );

      const sessionData = {
        sessionId,
        projectPath,
        lastModified: new Date().toISOString(),
        messages,
        name: sessionName || "",
        isCustomName: isCustomName || false,
        providerId: providerId || null,
        modelId: modelId || null,
      };

      await writeFile(
        sessionFile,
        JSON.stringify(sessionData, null, 2),
        "utf-8",
      );
      console.log("Session saved:", sessionFile);

      // Track this as the last used session for this project
      const prefsDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
      const lastSessionFile = path.join(prefsDir, "last-sessions.json");

      let lastSessions: Record<string, string> = {};
      if (existsSync(lastSessionFile)) {
        const content = await readFile(lastSessionFile, "utf-8");
        lastSessions = JSON.parse(content);
      }

      lastSessions[projectPath] = sessionId;
      await writeFile(
        lastSessionFile,
        JSON.stringify(lastSessions, null, 2),
        "utf-8",
      );

      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to save session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle(
  "session-load",
  async (_, projectPath: string, sessionId: string) => {
    console.log(
      "Received session-load for project:",
      projectPath,
      "session:",
      sessionId,
    );

    try {
      const sessionsDir = path.join(
        homedir(),
        ".config",
        CONFIG_DIR_NAME,
        "chat-sessions",
      );
      const sanitizedPath = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
      const sessionFile = path.join(
        sessionsDir,
        `${sanitizedPath}_${sessionId}.json`,
      );

      if (!existsSync(sessionFile)) {
        return { success: true, messages: null, error: null };
      }

      const content = await readFile(sessionFile, "utf-8");
      const sessionData = JSON.parse(content);

      return {
        success: true,
        messages: sessionData.messages,
        lastModified: sessionData.lastModified,
        name: sessionData.name || "",
        isCustomName: sessionData.isCustomName || false,
        providerId: sessionData.providerId || null,
        modelId: sessionData.modelId || null,
        error: null,
      };
    } catch (error) {
      console.error("Failed to load session:", error);
      return {
        success: false,
        messages: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle("session-list", async (_, projectPath: string) => {
  console.log("Received session-list for project:", projectPath);

  try {
    const sessionsDir = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "chat-sessions",
    );

    if (!existsSync(sessionsDir)) {
      return { success: true, sessions: [], error: null };
    }

    const sanitizedPath = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
    const prefix = `${sanitizedPath}_`;

    const files = readdirSync(sessionsDir).filter(
      (file) => file.startsWith(prefix) && file.endsWith(".json"),
    );

    const sessions = await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path.join(sessionsDir, file);
          const content = await readFile(filePath, "utf-8");
          const data = JSON.parse(content);

          // Extract session ID from filename
          const sessionId = file.replace(prefix, "").replace(".json", "");

          return {
            id: sessionId,
            lastModified: data.lastModified,
            messageCount: Array.isArray(data.messages)
              ? data.messages.length
              : 0,
            name: data.name || "",
            isCustomName: data.isCustomName || false,
          };
        } catch (error) {
          console.error("Failed to read session file:", file, error);
          return null;
        }
      }),
    );

    // Filter out null entries and sort by lastModified (most recent first)
    const validSessions = sessions
      .filter((s) => s !== null)
      .sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime(),
      );

    return { success: true, sessions: validSessions, error: null };
  } catch (error) {
    console.error("Failed to list sessions:", error);
    return {
      success: false,
      sessions: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle(
  "session-delete",
  async (_, projectPath: string, sessionId: string) => {
    console.log(
      "Received session-delete for project:",
      projectPath,
      "session:",
      sessionId,
    );

    try {
      const sessionsDir = path.join(
        homedir(),
        ".config",
        CONFIG_DIR_NAME,
        "chat-sessions",
      );
      const sanitizedPath = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
      const sessionFile = path.join(
        sessionsDir,
        `${sanitizedPath}_${sessionId}.json`,
      );

      if (existsSync(sessionFile)) {
        await unlink(sessionFile);
        console.log("Session deleted:", sessionFile);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to delete session:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle("session-clear-all", async (_, projectPath: string) => {
  console.log("Received session-clear-all for project:", projectPath);

  try {
    const sessionsDir = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "chat-sessions",
    );

    if (!existsSync(sessionsDir)) {
      return { success: true, error: null };
    }

    const sanitizedPath = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
    const prefix = `${sanitizedPath}_`;

    const files = readdirSync(sessionsDir).filter(
      (file) => file.startsWith(prefix) && file.endsWith(".json"),
    );

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      await unlink(filePath);
    }

    console.log(`Cleared ${files.length} session(s)`);
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to clear sessions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("session-get-last", async (_, projectPath: string) => {
  console.log("Received session-get-last for project:", projectPath);

  try {
    const prefsDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const lastSessionFile = path.join(prefsDir, "last-sessions.json");

    if (!existsSync(lastSessionFile)) {
      return { success: true, sessionId: null, error: null };
    }

    const content = await readFile(lastSessionFile, "utf-8");
    const lastSessions = JSON.parse(content);

    return {
      success: true,
      sessionId: lastSessions[projectPath] || null,
      error: null,
    };
  } catch (error) {
    console.error("Failed to get last session:", error);
    return {
      success: false,
      sessionId: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Recent projects IPC handlers
ipcMain.handle("recent-projects-add", async (_, projectPath: string) => {
  console.log("Received recent-projects-add:", projectPath);

  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const recentFile = path.join(configDir, "recent-projects.json");

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    let recentProjects: Array<{ path: string; lastAccessed: string }> = [];

    if (existsSync(recentFile)) {
      const content = await readFile(recentFile, "utf-8");
      recentProjects = JSON.parse(content);
    }

    // Remove if already exists
    recentProjects = recentProjects.filter((p) => p.path !== projectPath);

    // Add to front
    recentProjects.unshift({
      path: projectPath,
      lastAccessed: new Date().toISOString(),
    });

    // Keep only the 10 most recent
    recentProjects = recentProjects.slice(0, 10);

    await writeFile(
      recentFile,
      JSON.stringify(recentProjects, null, 2),
      "utf-8",
    );

    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to add recent project:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("recent-projects-get", async () => {
  console.log("Received recent-projects-get");

  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const recentFile = path.join(configDir, "recent-projects.json");

    if (!existsSync(recentFile)) {
      return { success: true, projects: [], error: null };
    }

    const content = await readFile(recentFile, "utf-8");
    const projects = JSON.parse(content);

    // Filter out projects that no longer exist
    const validProjects = projects.filter((p: { path: string }) =>
      existsSync(p.path),
    );

    // Update the file if we filtered any out
    if (validProjects.length !== projects.length) {
      await writeFile(
        recentFile,
        JSON.stringify(validProjects, null, 2),
        "utf-8",
      );
    }

    return { success: true, projects: validProjects, error: null };
  } catch (error) {
    console.error("Failed to get recent projects:", error);
    return {
      success: false,
      projects: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("recent-projects-clear", async () => {
  console.log("Received recent-projects-clear");

  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const recentFile = path.join(configDir, "recent-projects.json");

    // Write an empty array to the file
    if (existsSync(recentFile)) {
      await writeFile(recentFile, JSON.stringify([], null, 2), "utf-8");
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to clear recent projects:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// User preferences IPC handlers
ipcMain.handle("preferences-get", async (_, key: string) => {
  console.log("Received preferences-get:", key);

  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const prefsFile = path.join(configDir, "preferences.json");

    if (!existsSync(prefsFile)) {
      return { success: true, value: null, error: null };
    }

    const content = await readFile(prefsFile, "utf-8");
    const prefs = JSON.parse(content);

    return { success: true, value: prefs[key] ?? null, error: null };
  } catch (error) {
    console.error("Failed to get preference:", error);
    return {
      success: false,
      value: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("preferences-set", async (_, key: string, value: unknown) => {
  console.log("Received preferences-set:", key, value);

  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const prefsFile = path.join(configDir, "preferences.json");

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    let prefs: Record<string, unknown> = {};

    if (existsSync(prefsFile)) {
      const content = await readFile(prefsFile, "utf-8");
      prefs = JSON.parse(content);
    }

    prefs[key] = value;

    await writeFile(prefsFile, JSON.stringify(prefs, null, 2), "utf-8");

    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to set preference:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Helper function to create a safe filename from project path
function getProjectConfigPath(projectPath: string, filename: string): string {
  // Create a hash-based identifier from the project path to avoid collisions
  const hash = createHash("sha256").update(projectPath).digest("hex").substring(0, 16);
  const projectsDir = path.join(homedir(), ".config", CONFIG_DIR_NAME, "projects");
  const projectConfigDir = path.join(projectsDir, hash);
  return path.join(projectConfigDir, filename);
}

// Project MCP override IPC handlers
ipcMain.handle("project-mcp-overrides-read", async (_, projectPath: string) => {
  try {
    const overridesFile = getProjectConfigPath(projectPath, "mcp-overrides.json");

    if (!existsSync(overridesFile)) {
      return { success: true, content: null, error: null };
    }

    const content = await readFile(overridesFile, "utf-8");
    return { success: true, content, error: null };
  } catch (error) {
    console.error("Failed to read project MCP overrides:", error);
    return {
      success: false,
      content: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("project-mcp-overrides-write", async (_, projectPath: string, content: string) => {
  try {
    const overridesFile = getProjectConfigPath(projectPath, "mcp-overrides.json");
    const projectConfigDir = path.dirname(overridesFile);

    // Ensure directory exists
    if (!existsSync(projectConfigDir)) {
      mkdirSync(projectConfigDir, { recursive: true });
    }

    await writeFile(overridesFile, content, "utf-8");
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to write project MCP overrides:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Project context mode IPC handlers
ipcMain.handle("project-context-mode-read", async (_, projectPath: string) => {
  try {
    const contextModeFile = getProjectConfigPath(projectPath, "context-mode.json");

    if (!existsSync(contextModeFile)) {
      // Return default value if file doesn't exist
      return { success: true, mode: "rolling", error: null };
    }

    const content = await readFile(contextModeFile, "utf-8");
    const config = JSON.parse(content);
    const mode = config.mode === "halt" ? "halt" : "rolling";
    return { success: true, mode, error: null };
  } catch (error) {
    console.error("Failed to read project context mode:", error);
    return {
      success: false,
      mode: "rolling",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("project-context-mode-write", async (_, projectPath: string, mode: string) => {
  try {
    const contextModeFile = getProjectConfigPath(projectPath, "context-mode.json");
    const projectConfigDir = path.dirname(contextModeFile);

    // Ensure directory exists
    if (!existsSync(projectConfigDir)) {
      mkdirSync(projectConfigDir, { recursive: true });
    }

    // Validate mode
    const validMode = mode === "halt" ? "halt" : "rolling";
    const config = { mode: validMode };

    await writeFile(contextModeFile, JSON.stringify(config, null, 2), "utf-8");
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to write project context mode:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Chat IPC handlers
ipcMain.handle(
  "chat-send-message",
  async (
    event,
    params: {
      provider: string;
      model: string;
      messages: unknown[];
      tools?: unknown[];
    },
  ) => {
    console.log("Received chat-send-message:", params.provider, params.model);

    try {
      const { provider: providerId, model, messages, tools } = params;

      // Create new AbortController for this request
      currentStreamAbortController = new AbortController();

      // Ensure providers are loaded
      await loadProviders();

      // Get provider from registry
      const provider = providerRegistry.getProvider(providerId);
      if (!provider) {
        throw new Error(`Provider ${providerId} not found or not enabled`);
      }

      // Check if model supports tools
      const capabilities = provider.getCapabilities();
      const toolsToSend = capabilities.supportsTools ? tools : undefined;

      if (!capabilities.supportsTools && tools && tools.length > 0) {
        console.log(
          `Provider ${providerId} does not support tools, tools will not be sent`,
        );
      }

      // Convert messages to provider format
      const providerMessages: ProviderChatMessage[] = (messages as any[]).map(m => ({
        role: m.role,
        content: m.content || '',
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        timestamp: m.timestamp || Date.now(),
        thinking: m.thinking,
      }));

      // Create tool execution callback
      const onToolCall = async (toolCall: ToolCall): Promise<ToolResult> => {
        // Send individual tool call to frontend for immediate display and execution
        event.sender.send("chat-chunk", {
          type: "tool_call",
          tool_call: toolCall,
        });

        // Tool execution happens in frontend, we just acknowledge here
        return { success: true, content: 'Tool execution handled by frontend' };
      };

      // Stream the chat
      const streamGenerator = provider.streamChat({
        model,
        messages: providerMessages,
        tools: toolsToSend as any,
        signal: currentStreamAbortController.signal,
        onToolCall,
      });

      // Process stream and send chunks to frontend
      for await (const chunk of streamGenerator) {
        event.sender.send("chat-chunk", chunk);
      }

      return {
        success: true,
        message: {
          role: "assistant",
          content: "", // Content was streamed
        },
      };
    } catch (error) {
      console.error("Failed to send chat message:", error);

      // Send error chunk to frontend
      event.sender.send("chat-chunk", {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      currentStreamAbortController = null;
    }
  },
);

ipcMain.handle("chat-cancel", async () => {
  console.log("Received chat-cancel");
  if (currentStreamAbortController) {
    currentStreamAbortController.abort();
    currentStreamAbortController = null;
    return { success: true };
  }
  return { success: false, error: "No active stream to cancel" };
});

// Get context length for a model
ipcMain.handle("chat-get-context-length", async (_, params: {
  provider: string;
  model: string;
}) => {
  try {
    const { provider: providerId, model } = params;

    // Ensure providers are loaded
    await loadProviders();

    // Get provider from registry
    const provider = providerRegistry.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found or not enabled`);
    }

    const contextLength = await provider.getContextLength(model);
    return { success: true, contextLength };
  } catch (error) {
    console.error("Failed to get context length:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Load providers into registry from config
async function loadProviders() {
  try {
    const configDir = path.join(homedir(), ".config", CONFIG_DIR_NAME);
    const yamlPath = path.join(configDir, "providers.yaml");
    const jsonPath = path.join(configDir, "providers.json");
    
    let configContent: string | null = null;
    let configPath: string | null = null;

    // Prefer YAML, fall back to JSON
    if (existsSync(yamlPath)) {
      configPath = yamlPath;
      configContent = await readFile(yamlPath, "utf-8");
    } else if (existsSync(jsonPath)) {
      // Try to migrate JSON to YAML
      await migrateJsonToYaml(jsonPath, yamlPath);
      if (existsSync(yamlPath)) {
        configPath = yamlPath;
        configContent = await readFile(yamlPath, "utf-8");
      } else {
        // Fall back to JSON
        configPath = jsonPath;
        configContent = await readFile(jsonPath, "utf-8");
      }
    }

    if (!configContent || !configPath) {
      return;
    }

    const providersData = parseConfig(configContent, configPath) as { providers?: unknown[] };

    if (providersData.providers && Array.isArray(providersData.providers)) {
      providerRegistry.updateProviders(providersData.providers as any);
    }
  } catch (error) {
    console.error("Failed to load providers:", error);
  }
}

// Legacy API functions (kept for backward compatibility during transition)
async function callOllamaAPI(
  providerConfig: { baseURL: string },
  model: string,
  messages: unknown[],
  tools: unknown[] | undefined,
  event: Electron.IpcMainInvokeEvent,
) {
  const url = `${providerConfig.baseURL}/api/chat`;

  // Build a map of tool_call_id to tool_name for tool result messages
  const toolCallMap = new Map<string, string>();
  messages.forEach((m: Record<string, unknown>) => {
    if (m.tool_calls && Array.isArray(m.tool_calls)) {
      m.tool_calls.forEach(
        (tc: { id?: string; function?: { name?: string } }) => {
          if (tc.id && tc.function?.name) {
            toolCallMap.set(tc.id, tc.function.name);
          }
        },
      );
    }
  });

  // Clean messages - only include fields that Ollama expects
  const cleanedMessages = messages.map((m: Record<string, unknown>) => {
    const cleaned: Record<string, unknown> = {
      role: m.role,
    };

    // Only add content if it's not empty or if there are no tool calls
    // When there are tool calls, content can be omitted
    if (
      m.content &&
      (typeof m.content !== "string" || m.content.trim() !== "")
    ) {
      cleaned.content = m.content;
    } else if (!m.tool_calls) {
      // Always include content for non-tool-call messages, even if empty
      cleaned.content = m.content || "";
    }

    // Handle tool calls - strip id and type fields for Ollama, convert arguments to object
    if (m.tool_calls && Array.isArray(m.tool_calls)) {
      cleaned.tool_calls = m.tool_calls.map(
        (tc: {
          function: {
            name: string;
            arguments: string | Record<string, unknown>;
          };
        }) => ({
          function: {
            name: tc.function.name,
            arguments:
              typeof tc.function.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments,
          },
        }),
      );
    }

    // For tool result messages, use tool_name instead of tool_call_id
    if (m.role === "tool" && m.tool_call_id) {
      const toolName = toolCallMap.get(m.tool_call_id as string);
      if (toolName) {
        cleaned.tool_name = toolName;
      }
    }

    return cleaned;
  });

  const requestBody: Record<string, unknown> = {
    model,
    messages: cleanedMessages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  console.log(
    "Sending to Ollama:",
    JSON.stringify(
      {
        model,
        messages: cleanedMessages,
        tools: tools?.length || 0,
      },
      null,
      2,
    ),
  );

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: currentStreamAbortController?.signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  // Stream the response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let fullMessage = "";
  let toolCalls: unknown[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.message?.content) {
            fullMessage += data.message.content;
            event.sender.send("chat-chunk", {
              type: "content",
              content: data.message.content,
            });
          }

          if (data.message?.tool_calls) {
            // Normalize Ollama tool calls to match expected format
            // Ollama format: { function: { name: "...", arguments: {...} } }
            // Expected format: { id: "...", type: "function", function: { name: "...", arguments: "..." } }
            toolCalls = data.message.tool_calls.map(
              (
                tc: {
                  id?: string;
                  function: {
                    name: string;
                    arguments: string | Record<string, unknown>;
                  };
                },
                index: number,
              ) => ({
                id: tc.id || `call_${Date.now()}_${index}`,
                type: "function",
                function: {
                  name: tc.function.name,
                  arguments:
                    typeof tc.function.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments),
                },
              }),
            );
            event.sender.send("chat-chunk", {
              type: "tool_calls",
              tool_calls: toolCalls,
            });
          }

          if (data.done) {
            event.sender.send("chat-chunk", { type: "done", done: true });
          }
        } catch (parseError) {
          console.error("Failed to parse chunk:", parseError);
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Stream aborted by user");
      event.sender.send("chat-chunk", { type: "cancelled" });
      throw error;
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  return {
    success: true,
    message: {
      role: "assistant",
      content: fullMessage,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
  };
}

async function callLMStudioAPI(
  providerConfig: { baseURL: string; apiKey?: string },
  model: string,
  messages: unknown[],
  tools: unknown[] | undefined,
  event: Electron.IpcMainInvokeEvent,
) {
  const url = `${providerConfig.baseURL}/v1/chat/completions`;

  // Clean up messages to avoid LM Studio issues
  // Remove assistant messages with duplicate tool_call_ids (retries)
  const seenToolCallIds = new Set<string>();
  const cleanedMessages = messages.filter((m: Record<string, unknown>) => {
    // If it's an assistant message with tool_calls, check for duplicates
    if (m.role === "assistant" && m.tool_calls && Array.isArray(m.tool_calls)) {
      const toolCallIds = m.tool_calls.map((tc: any) => tc.id);

      // Check if any of these tool call IDs have been seen before
      const hasDuplicate = toolCallIds.some((id) => seenToolCallIds.has(id));

      if (hasDuplicate) {
        // Skip this message - it's a retry with the same tool_call_id
        return false;
      }

      // Add these IDs to the seen set
      toolCallIds.forEach((id) => seenToolCallIds.add(id));
    }

    return true;
  });

  const requestBody: Record<string, unknown> = {
    model,
    messages: cleanedMessages.map((m: Record<string, unknown>) => {
      const msg: Record<string, unknown> = {
        role: m.role,
      };

      // Content is required for most roles, but might be null for assistant with tool_calls
      // LM Studio requires content to be a string or null, not undefined
      if (m.content !== undefined && m.content !== null && m.content !== "") {
        msg.content = m.content;
      } else if (m.role === "assistant" && m.tool_calls) {
        // Assistant messages with tool_calls can have null content
        msg.content = null;
      } else if (m.role === "tool") {
        // Tool messages must have content
        msg.content = m.content || "";
      } else {
        // Default to empty string for other roles
        msg.content = m.content || "";
      }

      // Only include tool_calls if it exists
      if (m.tool_calls) {
        msg.tool_calls = m.tool_calls;
      }
      // Only include tool_call_id if it exists (for tool role)
      if (m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      // Only include name if it exists (for tool role)
      if (m.name) {
        msg.name = m.name;
      }

      return msg;
    }),
    stream: true,
    stream_options: {
      include_usage: true,
    },
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    // Only add tool_choice on initial requests, not continuations
    // Continuations already have tool context in the message history
    const hasToolResults = cleanedMessages.some(
      (m: Record<string, unknown>) => m.role === "tool",
    );
    if (!hasToolResults) {
      requestBody.tool_choice = "auto";
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (providerConfig.apiKey) {
    headers.Authorization = `Bearer ${providerConfig.apiKey}`;
  }

  // Log the request for debugging
  console.log(
    "LM Studio request:",
    JSON.stringify(
      {
        url,
        model,
        messagesCount: requestBody.messages?.length,
        hasTools: !!requestBody.tools,
        toolsCount: requestBody.tools?.length || 0,
      },
      null,
      2,
    ),
  );

  // Log full request body for debugging tool call issues
  if (process.env.DEBUG_LMS) {
    console.log(
      "Full LM Studio request body:",
      JSON.stringify(requestBody, null, 2),
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: currentStreamAbortController?.signal,
  });

  if (!response.ok) {
    let errorDetails = response.statusText;
    try {
      const errorBody = await response.text();
      if (errorBody) {
        errorDetails += ` - ${errorBody}`;
      }
    } catch (e) {
      // Ignore error reading body
    }
    console.error(`LM Studio API error (${response.status}):`, errorDetails);
    console.error("Request body:", JSON.stringify(requestBody, null, 2));
    throw new Error(`LM Studio API error: ${errorDetails}`);
  }

  // Stream the response (SSE format)
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let fullMessage = "";
  let toolCalls: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }> = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk
        .split("\n")
        .filter((line) => line.trim() && line.startsWith("data:"));

      for (const line of lines) {
        const data = line.replace(/^data: /, "");
        if (data === "[DONE]") {
          event.sender.send("chat-chunk", { type: "done", done: true });
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            fullMessage += delta.content;
            event.sender.send("chat-chunk", {
              type: "content",
              content: delta.content,
            });
          }

          // Handle tool_calls streaming (OpenAI format)
          // Tool calls come as deltas with indices that need to be accumulated
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              // Initialize the tool call at this index if it doesn't exist
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: toolCallDelta.id || `call_${index}`,
                  type: toolCallDelta.type || "function",
                  function: {
                    name: "",
                    arguments: "",
                  },
                };
              }

              // Accumulate the function name
              if (toolCallDelta.function?.name) {
                toolCalls[index].function!.name = toolCallDelta.function.name;
              }

              // Accumulate the arguments
              if (toolCallDelta.function?.arguments) {
                toolCalls[index].function!.arguments =
                  (toolCalls[index].function!.arguments || "") +
                  toolCallDelta.function.arguments;
              }
            }

            // Send the accumulated tool calls
            event.sender.send("chat-chunk", {
              type: "tool_calls",
              tool_calls: toolCalls.filter((tc) => tc !== undefined),
            });
          }

          // Handle usage information (when stream_options.include_usage is true)
          if (parsed.usage) {
            event.sender.send("chat-chunk", {
              type: "usage",
              usage: {
                prompt_tokens: parsed.usage.prompt_tokens,
                completion_tokens: parsed.usage.completion_tokens,
                total_tokens: parsed.usage.total_tokens,
              },
            });
          }
        } catch (parseError) {
          console.error("Failed to parse SSE chunk:", parseError);
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Stream aborted by user");
      event.sender.send("chat-chunk", { type: "cancelled" });
      throw error;
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  return {
    success: true,
    message: {
      role: "assistant",
      content: fullMessage,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
  };
}

ipcMain.handle(
  "execute-tool",
  async (_, toolName: string, params: Record<string, unknown>) => {
    console.log("Received execute-tool:", toolName, params);

    // For now, tools execute in renderer
    // This handler is for future main-process tools
    return {
      success: false,
      error: "Tool execution not implemented in main process yet",
    };
  },
);

ipcMain.handle("get-home-dir", async () => {
  return homedir();
});

// Prompt management IPC handlers
ipcMain.handle("prompts-list", async () => {
  try {
    const promptsDir = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "prompts",
    );

    if (!existsSync(promptsDir)) {
      mkdirSync(promptsDir, { recursive: true });
      return { success: true, prompts: [], error: null };
    }

    const files = readdirSync(promptsDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(".md", ""));

    return { success: true, prompts: files, error: null };
  } catch (error) {
    console.error("Failed to list prompts:", error);
    return { success: false, prompts: [], error: String(error) };
  }
});

ipcMain.handle("prompts-read", async (_, name: string) => {
  try {
    const promptPath = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "prompts",
      `${name}.md`,
    );

    if (!existsSync(promptPath)) {
      return { success: false, content: null, error: "Prompt does not exist" };
    }

    const content = await readFile(promptPath, "utf-8");
    return { success: true, content, error: null };
  } catch (error) {
    console.error("Failed to read prompt:", error);
    return { success: false, content: null, error: String(error) };
  }
});

ipcMain.handle("prompts-write", async (_, name: string, content: string) => {
  try {
    const promptsDir = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "prompts",
    );
    const promptPath = path.join(promptsDir, `${name}.md`);

    // Ensure directory exists
    if (!existsSync(promptsDir)) {
      mkdirSync(promptsDir, { recursive: true });
    }

    await writeFile(promptPath, content, "utf-8");
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to write prompt:", error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("prompts-delete", async (_, name: string) => {
  try {
    const promptPath = path.join(
      homedir(),
      ".config",
      CONFIG_DIR_NAME,
      "prompts",
      `${name}.md`,
    );

    if (!existsSync(promptPath)) {
      return { success: false, error: "Prompt does not exist" };
    }

    await unlink(promptPath);
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to delete prompt:", error);
    return { success: false, error: String(error) };
  }
});

// MCP IPC handlers
ipcMain.handle(
  "mcp-start-server",
  async (
    _,
    name: string,
    config: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    },
  ) => {
    console.log("Received mcp-start-server:", name);
    try {
      await mcpManager.startServer(name, config);
      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle("mcp-stop-server", async (_, name: string) => {
  console.log("Received mcp-stop-server:", name);
  try {
    await mcpManager.stopServer(name);
    return { success: true, error: null };
  } catch (error) {
    console.error("Failed to stop MCP server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle(
  "mcp-restart-server",
  async (
    _,
    name: string,
    config: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    },
  ) => {
    console.log("Received mcp-restart-server:", name);
    try {
      await mcpManager.restartServer(name, config);
      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to restart MCP server:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle(
  "mcp-call-tool",
  async (
    _,
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => {
    console.log("Received mcp-call-tool:", serverName, toolName, args);
    try {
      const result = await mcpManager.callTool(serverName, toolName, args);
      return { success: true, result, error: null };
    } catch (error) {
      console.error("Failed to call MCP tool:", error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle("mcp-get-server-status", async (_, name: string) => {
  console.log("Received mcp-get-server-status:", name);
  const status = mcpManager.getServerStatus(name);
  return status;
});

ipcMain.handle("mcp-get-all-servers-status", async () => {
  console.log("Received mcp-get-all-servers-status");
  return mcpManager.getAllServersStatus();
});

ipcMain.handle(
  "mcp-reconcile-servers",
  async (_, newConfig: Record<string, any>) => {
    console.log("Received mcp-reconcile-servers");
    try {
      await mcpManager.reconcileServers(newConfig);
      return { success: true, error: null };
    } catch (error) {
      console.error("Failed to reconcile MCP servers:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

// Internal tool IPC handlers
ipcMain.handle("internal-tool-read", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-read:", projectPath, params.file_path);
  return await handleRead({ projectPath, ...params });
});

ipcMain.handle(
  "internal-tool-write",
  async (_, projectPath: string, params) => {
    console.log("Received internal-tool-write:", projectPath, params.file_path);
    return await handleWrite({ projectPath, ...params });
  },
);

ipcMain.handle("internal-tool-edit", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-edit:", projectPath, params.file_path);
  return await handleEdit({ projectPath, ...params });
});

ipcMain.handle("internal-tool-glob", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-glob:", projectPath, params.pattern);
  return await handleGlob({ projectPath, ...params });
});

ipcMain.handle("internal-tool-grep", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-grep:", projectPath, params.pattern);
  return await handleGrep({ projectPath, ...params });
});

ipcMain.handle("internal-tool-bash", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-bash:", projectPath, params.command);
  return await handleBash({ projectPath, ...params });
});

ipcMain.handle("internal-tool-ls", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-ls:", projectPath, params.path || "/");
  return await handleLs({ projectPath, ...params });
});

ipcMain.handle("internal-tool-move", async (_, projectPath: string, params) => {
  console.log(
    "Received internal-tool-move:",
    projectPath,
    params.source_path,
    "->",
    params.destination_path,
  );
  return await handleMove({ projectPath, ...params });
});

ipcMain.handle("internal-tool-rm", async (_, projectPath: string, params) => {
  console.log("Received internal-tool-rm:", projectPath, params.path);
  return await handleRm({ projectPath, ...params });
});

ipcMain.handle(
  "internal-tool-mkdir",
  async (_, projectPath: string, params) => {
    console.log("Received internal-tool-mkdir:", projectPath, params.path);
    return await handleMkdir({ projectPath, ...params });
  },
);

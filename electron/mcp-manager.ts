import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

type MCPServerState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

interface MCPServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    projectPath?: string;
}

interface MCPToolInfo {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
    };
}

interface MCPServerStatus {
    name: string;
    state: MCPServerState;
    running: boolean; // Kept for backwards compatibility
    pid?: number;
    error?: string;
    tools?: MCPToolInfo[];
    startedAt?: string;
}

class MCPServer extends EventEmitter {
    private process: ChildProcess | null = null;
    private messageId = 0;
    private pendingRequests: Map<
        number,
        {
            resolve: (value: unknown) => void;
            reject: (error: Error) => void;
        }
    > = new Map();
    private buffer = "";
    public tools: MCPToolInfo[] = [];
    private state: MCPServerState = 'stopped';
    private errorMessage?: string;
    private startedAt?: Date;

    constructor(
        public name: string,
        private config: MCPServerConfig,
    ) {
        super();
    }

    async start(): Promise<void> {
        if (this.process) {
            throw new Error(`Server ${this.name} is already running`);
        }

        this.state = 'starting';
        this.errorMessage = undefined;
        this.startedAt = new Date();

        console.log(`Starting MCP server: ${this.name}`);
        console.log(
            `Command: ${this.config.command} ${this.config.args.join(" ")}`,
        );
        if (this.config.projectPath) {
            console.log(`Working directory: ${this.config.projectPath}`);
        }

        // Ensure PATH includes common locations for tools like uvx
        const env = { ...process.env, ...this.config.env };

        // On macOS, GUI apps don't get the full shell PATH
        // Add common paths where tools might be installed
        if (process.platform === "darwin") {
            const commonPaths = [
                "/usr/local/bin",
                "/opt/homebrew/bin",
                "/usr/bin",
                "/bin",
            ];
            const existingPath = env.PATH || "";
            const pathsToAdd = commonPaths.filter((p) => !existingPath.includes(p));
            if (pathsToAdd.length > 0) {
                env.PATH = [existingPath, ...pathsToAdd].filter(Boolean).join(":");
            }
        }

        this.process = spawn(this.config.command, this.config.args, {
            env,
            stdio: ["pipe", "pipe", "pipe"],
            cwd: this.config.projectPath, // Set working directory to project path
        });

        this.process.on("error", (error) => {
            console.error(`MCP server ${this.name} error:`, error);
            this.state = 'failed';
            this.errorMessage = error.message;
            this.emit("error", error);
        });

        this.process.on("exit", (code, signal) => {
            console.log(
                `MCP server ${this.name} exited with code ${code}, signal ${signal}`,
            );
            this.process = null;
            if (this.state === 'running' || this.state === 'starting') {
                this.state = 'stopped';
            }
            this.emit("exit", { code, signal });
        });

        if (this.process.stdout) {
            this.process.stdout.on("data", (data: Buffer) => {
                this.handleStdout(data.toString());
            });
        }

        if (this.process.stderr) {
            this.process.stderr.on("data", (data: Buffer) => {
                console.error(`MCP server ${this.name} stderr:`, data.toString());
            });
        }

        // Initialize the server with timeout
        try {
            const initTimeout = 60000; // 60 second timeout
            await Promise.race([
                this.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Server initialization timed out after 60 seconds')), initTimeout)
                )
            ]);

            // Load available tools
            await this.loadTools();

            this.state = 'running';
            console.log(`MCP server ${this.name} is now running`);
        } catch (error) {
            this.state = 'failed';
            this.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to start MCP server ${this.name}:`, this.errorMessage);

            // Clean up the process
            if (this.process) {
                this.process.kill('SIGTERM');
                this.process = null;
            }

            throw error;
        }
    }

    private handleStdout(data: string): void {
        this.buffer += data;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.handleMessage(message);
                } catch (error) {
                    console.error(
                        `Failed to parse message from ${this.name}:`,
                        line,
                        error,
                    );
                }
            }
        }
    }

    private handleMessage(message: {
        id?: number;
        result?: unknown;
        error?: unknown;
    }): void {
        if (message.id !== undefined) {
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
                this.pendingRequests.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(JSON.stringify(message.error)));
                } else {
                    pending.resolve(message.result);
                }
            }
        }
    }

    private async sendRequest(
        method: string,
        params?: unknown,
    ): Promise<unknown> {
        if (!this.process || !this.process.stdin) {
            throw new Error(`Server ${this.name} is not running`);
        }

        const requestId = ++this.messageId;
        const request = {
            jsonrpc: "2.0",
            id: requestId,
            method,
            params: params || {},
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout for ${method}`));
            }, 30000); // 30 second timeout

            this.pendingRequests.set(requestId, {
                resolve: (value) => {
                    clearTimeout(timeout);
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
            });

            this.process!.stdin!.write(JSON.stringify(request) + "\n");
        });
    }

    private async initialize(): Promise<void> {
        try {
            await this.sendRequest("initialize", {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {},
                },
                clientInfo: {
                    name: "POE",
                    version: "1.0.0",
                },
            });

            // Send initialized notification
            if (this.process && this.process.stdin) {
                const notification = {
                    jsonrpc: "2.0",
                    method: "notifications/initialized",
                };
                this.process.stdin.write(JSON.stringify(notification) + "\n");
            }
        } catch (error) {
            console.error(`Failed to initialize MCP server ${this.name}:`, error);
            throw error;
        }
    }

    private async loadTools(): Promise<void> {
        try {
            const result = (await this.sendRequest("tools/list")) as {
                tools: MCPToolInfo[];
            };
            this.tools = result.tools || [];
            console.log(
                `Loaded ${this.tools.length} tools from ${this.name}:`,
                this.tools.map((t) => t.name),
            );
        } catch (error) {
            console.error(`Failed to load tools from ${this.name}:`, error);
            this.tools = [];
        }
    }

    async callTool(
        name: string,
        args: Record<string, unknown>,
    ): Promise<unknown> {
        try {
            const result = await this.sendRequest("tools/call", {
                name,
                arguments: args,
            });
            return result;
        } catch (error) {
            console.error(`Failed to call tool ${name} on ${this.name}:`, error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.process) {
            this.state = 'stopped';
            return;
        }

        this.state = 'stopping';
        console.log(`Stopping MCP server: ${this.name}`);

        // Clear pending requests
        for (const [, { reject }] of this.pendingRequests.entries()) {
            reject(new Error("Server stopped"));
        }
        this.pendingRequests.clear();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.process) {
                    console.log(`Force killing MCP server: ${this.name}`);
                    this.process.kill("SIGKILL");
                }
                this.state = 'stopped';
                resolve();
            }, 5000);

            this.process!.once("exit", () => {
                clearTimeout(timeout);
                this.process = null;
                this.state = 'stopped';
                resolve();
            });

            this.process!.kill("SIGTERM");
        });
    }

    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    getPid(): number | undefined {
        return this.process?.pid;
    }

    getStatus(): MCPServerStatus {
        return {
            name: this.name,
            state: this.state,
            running: this.isRunning(),
            pid: this.getPid(),
            error: this.errorMessage,
            tools: this.tools,
            startedAt: this.startedAt?.toISOString(),
        };
    }

    getState(): MCPServerState {
        return this.state;
    }
}

class MCPManager {
    private servers: Map<string, MCPServer> = new Map();
    private starting: Set<string> = new Set();

    async startServer(name: string, config: MCPServerConfig): Promise<void> {
        const existingServer = this.servers.get(name);
        if (existingServer?.isRunning()) {
            throw new Error(`Server ${name} is already running`);
        }

        // Check if already in the process of starting
        if (this.starting.has(name)) {
            console.log(
                `Server ${name} is already being started, ignoring duplicate request`,
            );
            return;
        }

        this.starting.add(name);

        const server = new MCPServer(name, config);
        this.servers.set(name, server);

        try {
            await server.start();
        } catch (error) {
            this.servers.delete(name);
            throw error;
        } finally {
            this.starting.delete(name);
        }
    }

    async stopServer(name: string): Promise<void> {
        const server = this.servers.get(name);
        if (!server) {
            throw new Error(`Server ${name} not found`);
        }

        await server.stop();
        this.servers.delete(name);
    }

    async restartServer(name: string, config: MCPServerConfig): Promise<void> {
        const server = this.servers.get(name);
        if (server) {
            await server.stop();
        }
        await this.startServer(name, config);
    }

    async callTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<unknown> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`Server ${serverName} not found`);
        }

        if (!server.isRunning()) {
            throw new Error(`Server ${serverName} is not running`);
        }

        return await server.callTool(toolName, args);
    }

    getServerStatus(name: string): MCPServerStatus | null {
        const server = this.servers.get(name);
        return server ? server.getStatus() : null;
    }

    getAllServersStatus(): MCPServerStatus[] {
        return Array.from(this.servers.values()).map((server) =>
            server.getStatus(),
        );
    }

    async stopAll(): Promise<void> {
        const stopPromises = Array.from(this.servers.values()).map((server) =>
            server.stop(),
        );
        await Promise.all(stopPromises);
        this.servers.clear();
    }

    async reconcileServers(newConfig: Record<string, MCPServerConfig>): Promise<void> {
        console.log('Reconciling MCP servers with new config');

        const newServerNames = new Set(Object.keys(newConfig));
        const currentServerNames = new Set(this.servers.keys());

        // Stop servers that are no longer in the config
        const serversToStop = Array.from(currentServerNames).filter(
            name => !newServerNames.has(name)
        );

        console.log(`Stopping removed servers: ${serversToStop.join(', ') || 'none'}`);
        for (const name of serversToStop) {
            try {
                await this.stopServer(name);
                console.log(`Stopped server: ${name}`);
            } catch (error) {
                console.error(`Failed to stop server ${name}:`, error);
            }
        }

        // Start new servers that are in config but not running
        const serversToStart = Array.from(newServerNames).filter(
            name => !currentServerNames.has(name)
        );

        console.log(`Starting new servers: ${serversToStart.join(', ') || 'none'}`);
        for (const name of serversToStart) {
            try {
                await this.startServer(name, newConfig[name]);
                console.log(`Started server: ${name}`);
            } catch (error) {
                console.error(`Failed to start server ${name}:`, error);
            }
        }

        // Restart servers that exist but have different configs
        const serversToCheck = Array.from(newServerNames).filter(
            name => currentServerNames.has(name)
        );

        for (const name of serversToCheck) {
            const server = this.servers.get(name);
            const newConf = newConfig[name];

            // Simple check: compare command, args, and projectPath
            // If they differ, restart the server
            if (server) {
                const oldConfig = (server as any).config; // Access private config
                const configChanged =
                    oldConfig.command !== newConf.command ||
                    JSON.stringify(oldConfig.args) !== JSON.stringify(newConf.args) ||
                    oldConfig.projectPath !== newConf.projectPath;

                if (configChanged) {
                    console.log(`Config changed for server ${name}, restarting...`);
                    try {
                        await this.restartServer(name, newConf);
                        console.log(`Restarted server: ${name}`);
                    } catch (error) {
                        console.error(`Failed to restart server ${name}:`, error);
                    }
                }
            }
        }

        console.log('Server reconciliation complete');
    }
}

export const mcpManager = new MCPManager();

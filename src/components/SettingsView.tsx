import { Box, Typography, Tabs, Tab, IconButton, Button } from "@mui/material";
import { X, Save } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { PromptManager } from "./PromptManager";
import yaml from "js-yaml";
import type { MCPServersConfig } from "../types/mcp";

// Configure Monaco to load workers from local bundle
self.MonacoEnvironment = {
        getWorker(_: unknown, _label: string) {
                // Use the same worker for YAML as for other languages
                // Monaco will handle syntax highlighting based on the language identifier
                return new editorWorker();
        },
};

// Configure Monaco to load from local node_modules
loader.config({ monaco });

interface SettingsViewProps {
        onClose: () => void;
        initialTab?: number;
}

interface TabPanelProps {
        children?: React.ReactNode;
        index: number;
        value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
        return (
                <Box
                        role="tabpanel"
                        hidden={value !== index}
                        sx={{
                                flexGrow: 1,
                                display: value === index ? "flex" : "none",
                                flexDirection: "column",
                                overflow: "hidden",
                        }}
                >
                        {value === index && children}
                </Box>
        );
}

// Default templates in YAML format
const DEFAULT_PROVIDERS = yaml.dump(
        {
                providers: [
                        {
                                id: "ollama-local",
                                name: "Ollama",
                                type: "ollama",
                                baseURL: "http://localhost:11434",
                                apiKey: null,
                                models: [
                                        {
                                                id: "gpt-oss:20b",
                                                name: "gpt-oss:20b",
                                                type: "chat",
                                                contextLength: 1,
                                                embeddingDimension: null,
                                                supportsTools: true,
                                        },
                                ],
                                config: {
                                        timeout: 30000,
                                        retryAttempts: 3,
                                        embeddingEndpoint: "/api/embed",
                                        chatEndpoint: "/api/chat",
                                },
                                enabled: true,
                        },
                        {
                                id: "lmstudio-local",
                                name: "LM Studio",
                                type: "lmstudio",
                                baseURL: "http://localhost:1234",
                                apiKey: null,
                                models: [
                                        {
                                                id: "openai/gpt-oss-20b",
                                                name: "openai/gpt-oss-20b",
                                                type: "chat",
                                                contextLength: 4096,
                                                embeddingDimension: null,
                                                supportsTools: true,
                                        },
                                ],
                                config: {
                                        timeout: 30000,
                                        retryAttempts: 3,
                                        embeddingEndpoint: "/v1/embeddings",
                                        chatEndpoint: "/v1/chat/completions",
                                },
                                enabled: true,
                        },
                ],
        },
        { indent: 2, lineWidth: -1 },
);

const DEFAULT_MCP = yaml.dump(
        {
                mcpServers: {},
                toolSettings: {},
        },
        { indent: 2, lineWidth: -1 },
);

export function SettingsView({ onClose, initialTab = 0 }: SettingsViewProps) {
        const [activeTab, setActiveTab] = useState(initialTab);
        const [providersYaml, setProvidersYaml] = useState(DEFAULT_PROVIDERS);
        const [mcpYaml, setMcpYaml] = useState(DEFAULT_MCP);
        const [originalProvidersYaml, setOriginalProvidersYaml] =
                useState(DEFAULT_PROVIDERS);
        const [originalMcpYaml, setOriginalMcpYaml] = useState(DEFAULT_MCP);
        const [loading, setLoading] = useState(true);

        // Refs to store the current editor values to avoid state staleness
        const providersYamlRef = useRef(DEFAULT_PROVIDERS);
        const mcpYamlRef = useRef(DEFAULT_MCP);

        const hasUnsavedChanges =
                providersYaml !== originalProvidersYaml || mcpYaml !== originalMcpYaml;

        // Load configs only once on mount
        useEffect(() => {
                loadConfigs();
        }, []);

        // Keyboard shortcut for Ctrl/Cmd+S
        useEffect(() => {
                const handleKeyDown = (e: KeyboardEvent) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                                e.preventDefault();
                                if (hasUnsavedChanges) {
                                        handleSave();
                                }
                        }
                };

                window.addEventListener("keydown", handleKeyDown);
                return () => window.removeEventListener("keydown", handleKeyDown);
        }, [hasUnsavedChanges]);

        const loadConfigs = async () => {
                setLoading(true);

                // Initialize defaults if files don't exist (backend handles .json -> .yaml conversion)
                await window.electronAPI.configInitDefaults(
                        "providers.json",
                        DEFAULT_PROVIDERS,
                );
                await window.electronAPI.configInitDefaults("mcp.json", DEFAULT_MCP);

                // Read configs (backend returns YAML now)
                const providersResult =
                        await window.electronAPI.configRead("providers.json");
                const mcpResult = await window.electronAPI.configRead("mcp.json");

                if (providersResult.success && providersResult.content) {
                        setProvidersYaml(providersResult.content);
                        providersYamlRef.current = providersResult.content;
                        setOriginalProvidersYaml(providersResult.content);
                }

                if (mcpResult.success && mcpResult.content) {
                        setMcpYaml(mcpResult.content);
                        mcpYamlRef.current = mcpResult.content;
                        setOriginalMcpYaml(mcpResult.content);
                }

                setLoading(false);
        };

        const handleSave = async () => {
                try {
                        // Use refs to get the most current values from editors
                        const currentProvidersYaml = providersYamlRef.current;
                        const currentMcpYaml = mcpYamlRef.current;

                        // Validate and format providers YAML
                        let formattedProvidersYaml = currentProvidersYaml;
                        if (currentProvidersYaml !== originalProvidersYaml) {
                                try {
                                        const parsed = yaml.load(currentProvidersYaml);
                                        formattedProvidersYaml = yaml.dump(parsed, { indent: 2, lineWidth: -1 });
                                } catch (e) {
                                        alert(
                                                `Invalid YAML in Providers config: ${e instanceof Error ? e.message : "Parse error"}`,
                                        );
                                        return;
                                }
                        }

                        // Validate and format MCP YAML
                        let formattedMcpYaml = currentMcpYaml;
                        if (currentMcpYaml !== originalMcpYaml) {
                                try {
                                        const parsed = yaml.load(currentMcpYaml);
                                        formattedMcpYaml = yaml.dump(parsed, { indent: 2, lineWidth: -1 });
                                } catch (e) {
                                        alert(
                                                `Invalid YAML in MCP config: ${e instanceof Error ? e.message : "Parse error"}`,
                                        );
                                        return;
                                }
                        }

                        // Save providers.yaml (backend handles .json -> .yaml conversion)
                        if (formattedProvidersYaml !== originalProvidersYaml) {
                                const providersResult = await window.electronAPI.configWrite(
                                        "providers.json",
                                        formattedProvidersYaml,
                                );
                                if (!providersResult.success) {
                                        alert(`Failed to save providers config: ${providersResult.error}`);
                                        return;
                                }
                                // Update state and refs only after successful save
                                setProvidersYaml(formattedProvidersYaml);
                                providersYamlRef.current = formattedProvidersYaml;
                                setOriginalProvidersYaml(formattedProvidersYaml);
                        }

                        // Save mcp.yaml (backend handles .json -> .yaml conversion)
                        if (formattedMcpYaml !== originalMcpYaml) {
                                const mcpResult = await window.electronAPI.configWrite(
                                        "mcp.json",
                                        formattedMcpYaml,
                                );
                                if (!mcpResult.success) {
                                        alert(`Failed to save MCP config: ${mcpResult.error}`);
                                        return;
                                }
                                // Update state and refs only after successful save
                                setMcpYaml(formattedMcpYaml);
                                mcpYamlRef.current = formattedMcpYaml;
                                setOriginalMcpYaml(formattedMcpYaml);

                                // Trigger MCP server reconciliation to stop/start servers based on new config
                                try {
                                        const mcpConfig = yaml.load(formattedMcpYaml) as MCPServersConfig;
                                        if (mcpConfig.mcpServers && window.electronAPI.mcpReconcileServers) {
                                                const reconcileResult =
                                                        await window.electronAPI.mcpReconcileServers(
                                                                mcpConfig.mcpServers,
                                                        );
                                                if (!reconcileResult.success) {
                                                        console.error(
                                                                "Failed to reconcile MCP servers:",
                                                                reconcileResult.error,
                                                        );
                                                        alert(
                                                                `Warning: Config saved but failed to update running servers: ${reconcileResult.error}`,
                                                        );
                                                }
                                        }
                                } catch (error) {
                                        console.error("Failed to reconcile MCP servers:", error);
                                        alert(
                                                `Warning: Config saved but failed to update running servers: ${error}`,
                                        );
                                }
                        }
                } catch (error) {
                        alert(`Error saving configs: ${error}`);
                }
        };

        const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
                setActiveTab(newValue);
        };

        return (
                <Box
                        sx={{
                                display: "flex",
                                flexDirection: "column",
                                height: "100%",
                                backgroundColor: "#1e1e2e",
                        }}
                >
                        {/* Header with close button and save button */}
                        <Box
                                sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        p: 2,
                                        borderBottom: "1px solid rgba(205, 214, 244, 0.1)",
                                        flexShrink: 0,
                                }}
                        >
                                <Typography variant="h5" sx={{ color: "#cdd6f4" }}>
                                        Settings
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                        <Button
                                                variant="contained"
                                                onClick={handleSave}
                                                disabled={!hasUnsavedChanges}
                                                startIcon={<Save size={16} />}
                                                sx={{
                                                        backgroundColor: hasUnsavedChanges
                                                                ? "#f9e2af"
                                                                : "rgba(205, 214, 244, 0.1)",
                                                        color: hasUnsavedChanges ? "#1e1e2e" : "rgba(205, 214, 244, 0.5)",
                                                        "&:hover": {
                                                                backgroundColor: hasUnsavedChanges
                                                                        ? "#f5d87f"
                                                                        : "rgba(205, 214, 244, 0.15)",
                                                        },
                                                        "&:disabled": {
                                                                backgroundColor: "rgba(205, 214, 244, 0.05)",
                                                                color: "rgba(205, 214, 244, 0.3)",
                                                        },
                                                }}
                                        >
                                                Save
                                        </Button>
                                        <IconButton
                                                onClick={onClose}
                                                sx={{
                                                        color: "#cdd6f4",
                                                        "&:hover": {
                                                                backgroundColor: "rgba(205, 214, 244, 0.1)",
                                                        },
                                                }}
                                        >
                                                <X size={20} />
                                        </IconButton>
                                </Box>
                        </Box>

                        {/* Tabs */}
                        <Tabs
                                value={activeTab}
                                onChange={handleTabChange}
                                sx={{
                                        borderBottom: "1px solid rgba(205, 214, 244, 0.1)",
                                        flexShrink: 0,
                                        "& .MuiTab-root": {
                                                color: "rgba(205, 214, 244, 0.6)",
                                                "&.Mui-selected": {
                                                        color: "#89b4fa",
                                                },
                                        },
                                        "& .MuiTabs-indicator": {
                                                backgroundColor: "#89b4fa",
                                        },
                                }}
                        >
                                <Tab label="Providers" />
                                <Tab label="MCP Servers" />
                                <Tab label="Prompts" />
                        </Tabs>

                        {/* Tab Panels */}
                        {loading ? (
                                <Box
                                        sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexGrow: 1,
                                        }}
                                >
                                        <Typography sx={{ color: "rgba(205, 214, 244, 0.6)" }}>
                                                Loading configurations...
                                        </Typography>
                                </Box>
                        ) : (
                                <>
                                        <TabPanel value={activeTab} index={0}>
                                                <Editor
                                                        height="100%"
                                                        defaultLanguage="yaml"
                                                        value={providersYaml}
                                                        onChange={(value) => {
                                                                const newValue = value || "";
                                                                setProvidersYaml(newValue);
                                                                providersYamlRef.current = newValue;
                                                        }}
                                                        theme="vs-dark"
                                                        options={{
                                                                minimap: { enabled: false },
                                                                fontSize: 13,
                                                                lineNumbers: "on",
                                                                scrollBeyondLastLine: false,
                                                                wordWrap: "on",
                                                                wrappingIndent: "indent",
                                                                automaticLayout: true,
                                                        }}
                                                />
                                        </TabPanel>

                                        <TabPanel value={activeTab} index={1}>
                                                <Editor
                                                        height="100%"
                                                        defaultLanguage="yaml"
                                                        value={mcpYaml}
                                                        onChange={(value) => {
                                                                const newValue = value || "";
                                                                setMcpYaml(newValue);
                                                                mcpYamlRef.current = newValue;
                                                        }}
                                                        theme="vs-dark"
                                                        options={{
                                                                minimap: { enabled: false },
                                                                fontSize: 13,
                                                                lineNumbers: "on",
                                                                scrollBeyondLastLine: false,
                                                                wordWrap: "on",
                                                                wrappingIndent: "indent",
                                                                automaticLayout: true,
                                                        }}
                                                />
                                        </TabPanel>

                                        <TabPanel value={activeTab} index={2}>
                                                <PromptManager />
                                        </TabPanel>
                                </>
                        )}
                </Box>
        );
}

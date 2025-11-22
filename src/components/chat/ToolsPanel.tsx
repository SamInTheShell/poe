import { Box, Typography, IconButton, Checkbox, Select, MenuItem, Collapse, Chip, Tooltip } from '@mui/material';
import { ChevronDown, ChevronRight, RefreshCw, Power, PowerOff } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import type { MCPServersConfig, MCPServerStatus, ToolPermission } from '../../types/mcp';
import { toolRegistry } from '../../tools';
import { toolConfigManager, type ToolConfig } from '../../tools/ToolConfigManager';
import { mcpToolsManager } from '../../tools/MCPToolsManager';
import { EnvironmentVariablesSection } from './EnvironmentVariablesSection';
import yaml from 'js-yaml';

interface ToolsPanelProps {
  collapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  onStartingStateChange?: (hasStarting: boolean) => void;
  onOpenSettings?: (tab?: string | number) => void;
  workingDirectory: string;
}

export function ToolsPanel({ collapsed, onToggleCollapse, onStartingStateChange, onOpenSettings, workingDirectory }: ToolsPanelProps) {
  const [mcpConfig, setMcpConfig] = useState<MCPServersConfig | null>(null);
  const [serversStatus, setServersStatus] = useState<MCPServerStatus[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [restarting, setRestarting] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState<Record<string, boolean>>({});
  const [toolConfigs, setToolConfigs] = useState<Map<string, ToolConfig>>(new Map());
  const initialLoadDoneRef = useRef(false);
  const mcpConfigRef = useRef<MCPServersConfig | null>(null);

  // Load MCP configuration (backend now returns YAML)
  const loadMcpConfig = async () => {
    try {
      const result = await window.electronAPI.configRead('mcp.json');
      if (result.success && result.content) {
        const data = yaml.load(result.content) as MCPServersConfig;
        setMcpConfig(data);
        mcpConfigRef.current = data;
      } else {
        const emptyConfig = { mcpServers: {}, toolSettings: {} };
        setMcpConfig(emptyConfig);
        mcpConfigRef.current = emptyConfig;
      }
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      const emptyConfig = { mcpServers: {}, toolSettings: {} };
      setMcpConfig(emptyConfig);
      mcpConfigRef.current = emptyConfig;
    }
  };

  // Load server status
  const loadServersStatus = async () => {
    try {
      const status = await window.electronAPI.mcpGetAllServersStatus();
      setServersStatus(status);

      // On initial load only, check if configured servers aren't running yet
      // They were likely just auto-started by MCPToolsManager
      if (!initialLoadDoneRef.current && mcpConfigRef.current) {
        const configuredServers = Object.keys(mcpConfigRef.current.mcpServers);
        const runningServers = new Set(status.filter(s => s.running).map(s => s.name));

        // Mark configured servers that aren't running yet as "starting"
        setStarting(prev => {
          const next = { ...prev };
          configuredServers.forEach(name => {
            if (!runningServers.has(name)) {
              next[name] = true;
            }
          });
          return next;
        });

        initialLoadDoneRef.current = true;
      }

      // Clear starting state for servers that are now running
      const runningServers = status.filter(s => s.running).map(s => s.name);
      if (runningServers.length > 0) {
        setStarting(prev => {
          const next = { ...prev };
          let changed = false;
          runningServers.forEach(name => {
            if (next[name]) {
              next[name] = false;
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }
    } catch (error) {
      console.error('Failed to load servers status:', error);
    }
  };

  // Load tool configs
  const loadToolConfigs = () => {
    const configs = toolConfigManager.getAllConfigs();
    setToolConfigs(configs);
  };

  // Toggle tool enabled state
  const toggleToolEnabled = (toolName: string) => {
    const config = toolConfigManager.getConfig(toolName);
    toolConfigManager.setConfig(toolName, { ...config, enabled: !config.enabled });
    loadToolConfigs();
  };

  // Change tool permission
  const changeToolPermission = (toolName: string, permission: ToolPermission) => {
    const config = toolConfigManager.getConfig(toolName);
    toolConfigManager.setConfig(toolName, { ...config, permission });
    loadToolConfigs();
  };

  // Get tool config
  const getToolConfig = (toolName: string): ToolConfig => {
    return toolConfigs.get(toolName) || {
      enabled: true,
      permission: 'allow',
      isBuiltIn: !toolName.includes('__'),
    };
  };

  // Get built-in tools
  const getBuiltInTools = () => {
    return toolRegistry.getAllTools()
      .filter(tool => !tool.definition.function.name.includes('__'))
      .map(tool => ({
        name: tool.definition.function.name,
        description: tool.definition.function.description,
      }));
  };

  // Start a server
  const startServer = async (name: string) => {
    if (!mcpConfig) return;
    const serverConfig = mcpConfig.mcpServers[name];
    if (!serverConfig) return;

    // Check if already running to prevent duplicate starts
    const status = serversStatus.find(s => s.name === name);
    if (status?.running) {
      console.log(`Server ${name} is already running, skipping start`);
      return;
    }

    // Check if already starting
    if (starting[name]) {
      console.log(`Server ${name} is already being started, skipping`);
      return;
    }

    setStarting(prev => ({ ...prev, [name]: true }));
    try {
      await window.electronAPI.mcpStartServer(name, serverConfig);
      // Wait a bit for server to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadServersStatus();
      loadToolConfigs(); // Refresh tool configs after server starts
    } catch (error) {
      console.error('Failed to start server:', error);
    } finally {
      setStarting(prev => ({ ...prev, [name]: false }));
    }
  };

  // Stop a server
  const stopServer = async (name: string) => {
    try {
      await window.electronAPI.mcpStopServer(name);
      await loadServersStatus();
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  // Restart a server
  const restartServer = async (name: string) => {
    if (!mcpConfig) return;
    const serverConfig = mcpConfig.mcpServers[name];
    if (!serverConfig) return;

    setRestarting(prev => ({ ...prev, [name]: true }));
    try {
      await window.electronAPI.mcpRestartServer(name, serverConfig);
      await loadServersStatus();
    } catch (error) {
      console.error('Failed to restart server:', error);
    } finally {
      setRestarting(prev => ({ ...prev, [name]: false }));
    }
  };

  // Restart a server using MCPToolsManager with environment overrides
  const restartServerWithOverrides = async (serverName: string) => {
    setRestarting(prev => ({ ...prev, [serverName]: true }));
    try {
      await mcpToolsManager.restartServerWithOverrides(serverName);
      await loadServersStatus();
    } catch (error) {
      console.error('Failed to restart server with overrides:', error);
    } finally {
      setRestarting(prev => ({ ...prev, [serverName]: false }));
    }
  };

  useEffect(() => {
    const init = async () => {
      // Load config first
      await loadMcpConfig();
      // Then load status (this will detect starting servers)
      await loadServersStatus();
      loadToolConfigs();
    };

    init();

    // Poll server status every 2 seconds (more frequent for better UX)
    const interval = setInterval(loadServersStatus, 2000);

    // Listen for tool config changes
    const unsubscribe = toolConfigManager.addListener(loadToolConfigs);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Initialize MCP tools manager with project path when workingDirectory changes
  useEffect(() => {
    if (workingDirectory) {
      mcpToolsManager.initialize(workingDirectory);
    }
  }, [workingDirectory]);

  // Notify parent when any server is starting
  useEffect(() => {
    const hasStarting = Object.values(starting).some(isStarting => isStarting);
    onStartingStateChange?.(hasStarting);
  }, [starting, onStartingStateChange]);

  const toggleSectionExpanded = (sectionName: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  };

  const builtInTools = getBuiltInTools();
  const hasMcpServers = mcpConfig && Object.keys(mcpConfig.mcpServers).length > 0;
  const hasTools = builtInTools.length > 0 || hasMcpServers;

  if (!hasTools) {
    return null; // Don't show panel if no tools available
  }

  return (
    <>
      {/* Panel */}
      {!collapsed && (
        <Box sx={{
          width: '280px',
          minWidth: '280px',
          maxWidth: '280px',
          flexShrink: 0,
          flexGrow: 0,
          flexBasis: '280px',
          height: '100%',
          backgroundColor: '#181825',
          borderLeft: '1px solid rgba(205, 214, 244, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <Box sx={{
            p: 1.5,
            borderBottom: '1px solid rgba(205, 214, 244, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ color: '#cdd6f4', fontWeight: 500, fontSize: '13px' }}>
                Tools
              </Typography>
              {onOpenSettings && (
                <Typography
                  component="a"
                  onClick={() => onOpenSettings('mcp')}
                  sx={{
                    color: '#89b4fa',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  [Configure]
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              onClick={() => onToggleCollapse(true)}
              sx={{ color: '#89b4fa' }}
            >
              <ChevronRight size={18} />
            </IconButton>
          </Box>

          {/* Tools list */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1 }}>
            {/* Built-in Tools Section */}
            {builtInTools.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box
                  onClick={() => toggleSectionExpanded('built-in')}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    backgroundColor: '#1e1e2e',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    '&:hover': {
                      backgroundColor: '#313244',
                    },
                  }}
                >
                  {expandedSections.has('built-in') ? (
                    <ChevronDown size={14} color="#89b4fa" />
                  ) : (
                    <ChevronRight size={14} color="#89b4fa" />
                  )}
                  <Typography variant="caption" sx={{ color: '#89b4fa', fontWeight: 500, fontSize: '11px' }}>
                    Built-in Tools
                  </Typography>
                </Box>

                <Collapse in={expandedSections.has('built-in')}>
                  <Box sx={{ pl: 1, pt: 0.5 }}>
                    {builtInTools.map((tool) => {
                      const toolConfig = getToolConfig(tool.name);

                      return (
                        <Box
                          key={tool.name}
                          sx={{
                            p: 0.5,
                            mb: 0.5,
                            borderRadius: 0.5,
                            backgroundColor: '#313244',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <Tooltip title={tool.description}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: '#cdd6f4',
                                fontSize: '10px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              {tool.name}
                            </Typography>
                          </Tooltip>
                          <Select
                            value={toolConfig.permission}
                            onChange={(e) => changeToolPermission(tool.name, e.target.value as ToolPermission)}
                            disabled={!toolConfig.enabled}
                            size="small"
                            sx={{
                              fontSize: '10px',
                              height: 20,
                              minWidth: 60,
                              color: '#cdd6f4',
                              '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: 'rgba(205, 214, 244, 0.2)',
                              },
                              '& .MuiSelect-icon': {
                                color: '#cdd6f4',
                                fontSize: '14px',
                              },
                              '& .MuiSelect-select': {
                                py: 0,
                                px: 0.5,
                              },
                            }}
                            MenuProps={{
                              PaperProps: {
                                sx: {
                                  backgroundColor: '#313244',
                                  color: '#cdd6f4',
                                },
                              },
                            }}
                          >
                            <MenuItem value="allow" sx={{ fontSize: '10px', py: 0.5 }}>Allow</MenuItem>
                            <MenuItem value="ask" sx={{ fontSize: '10px', py: 0.5 }}>Ask</MenuItem>
                          </Select>
                          <Checkbox
                            checked={toolConfig.enabled}
                            onChange={() => toggleToolEnabled(tool.name)}
                            size="small"
                            sx={{
                              p: 0,
                              color: '#89b4fa',
                              '&.Mui-checked': { color: '#89b4fa' },
                              '& .MuiSvgIcon-root': { fontSize: 14 },
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                </Collapse>
              </Box>
            )}

            {/* MCP Servers Section */}
            {mcpConfig && Object.entries(mcpConfig.mcpServers).map(([serverName]) => {
              const status = serversStatus.find(s => s.name === serverName);
              const isExpanded = expandedSections.has(serverName);
              const isRestarting = restarting[serverName];
              const isStarting = starting[serverName];

              return (
                <Box key={serverName} sx={{ mb: 1 }}>
                  {/* Server header */}
                  <Box
                    onClick={() => toggleSectionExpanded(serverName)}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      backgroundColor: '#1e1e2e',
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: '#313244',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isExpanded ? (
                          <ChevronDown size={14} color="#89b4fa" />
                        ) : (
                          <ChevronRight size={14} color="#89b4fa" />
                        )}
                        <Typography variant="caption" sx={{ color: '#cdd6f4', fontWeight: 500, fontSize: '11px' }}>
                          {serverName}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {status?.running && (
                          <Tooltip title="Restart">
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                restartServer(serverName);
                              }}
                              disabled={isRestarting}
                              size="small"
                              sx={{ width: 20, height: 20, color: '#89b4fa', p: 0 }}
                            >
                              <RefreshCw size={12} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={status?.running ? 'Stop' : 'Start'}>
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              if (status?.running) {
                                stopServer(serverName);
                              } else {
                                startServer(serverName);
                              }
                            }}
                            disabled={isStarting}
                            size="small"
                            sx={{
                              width: 20,
                              height: 20,
                              color: status?.running ? '#f38ba8' : '#a6e3a1',
                              p: 0,
                            }}
                          >
                            {status?.running ? <PowerOff size={12} /> : <Power size={12} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                    <Chip
                      label={isStarting ? 'Starting' : (status?.running ? 'Running' : 'Stopped')}
                      size="small"
                      sx={{
                        height: 16,
                        fontSize: '9px',
                        backgroundColor: isStarting
                          ? 'rgba(249, 226, 175, 0.2)'
                          : (status?.running ? 'rgba(166, 227, 161, 0.2)' : 'rgba(243, 139, 168, 0.2)'),
                        color: isStarting
                          ? '#f9e2af'
                          : (status?.running ? '#a6e3a1' : '#f38ba8'),
                      }}
                    />
                  </Box>

                  {/* Tools list */}
                  <Collapse in={isExpanded}>
                    <Box sx={{ pl: 1, pt: 0.5 }}>
                      {/* Environment Variables Section */}
                      {mcpConfig && mcpConfig.mcpServers[serverName] && (
                        <EnvironmentVariablesSection
                          serverName={serverName}
                          serverConfig={mcpConfig.mcpServers[serverName]}
                          isRunning={status?.running || false}
                          isRestarting={isRestarting}
                          onUpdate={() => {
                            // Optionally refresh server status or tools after env var changes
                            loadServersStatus();
                          }}
                          onRestartServer={restartServerWithOverrides}
                        />
                      )}

                      {status?.tools && status.tools.length > 0 ? (
                        status.tools.map((tool) => {
                          const fullName = `${serverName}__${tool.name}`;
                          const toolConfig = getToolConfig(fullName);

                          return (
                            <Box
                              key={tool.name}
                              sx={{
                                p: 0.5,
                                mb: 0.5,
                                borderRadius: 0.5,
                                backgroundColor: '#313244',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                              }}
                            >
                              <Tooltip title={tool.description}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: '#cdd6f4',
                                    fontSize: '10px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  {tool.name}
                                </Typography>
                              </Tooltip>
                              <Select
                                value={toolConfig.permission}
                                onChange={(e) => changeToolPermission(fullName, e.target.value as ToolPermission)}
                                disabled={!toolConfig.enabled}
                                size="small"
                                sx={{
                                  fontSize: '10px',
                                  height: 20,
                                  minWidth: 60,
                                  color: '#cdd6f4',
                                  '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: 'rgba(205, 214, 244, 0.2)',
                                  },
                                  '& .MuiSelect-icon': {
                                    color: '#cdd6f4',
                                    fontSize: '14px',
                                  },
                                  '& .MuiSelect-select': {
                                    py: 0,
                                    px: 0.5,
                                  },
                                }}
                                MenuProps={{
                                  PaperProps: {
                                    sx: {
                                      backgroundColor: '#313244',
                                      color: '#cdd6f4',
                                    },
                                  },
                                }}
                              >
                                <MenuItem value="allow" sx={{ fontSize: '10px', py: 0.5 }}>Allow</MenuItem>
                                <MenuItem value="ask" sx={{ fontSize: '10px', py: 0.5 }}>Ask</MenuItem>
                              </Select>
                              <Checkbox
                                checked={toolConfig.enabled}
                                onChange={() => toggleToolEnabled(fullName)}
                                size="small"
                                sx={{
                                  p: 0,
                                  color: '#89b4fa',
                                  '&.Mui-checked': { color: '#89b4fa' },
                                  '& .MuiSvgIcon-root': { fontSize: 14 },
                                }}
                              />
                            </Box>
                          );
                        })
                      ) : (
                        <Typography variant="caption" sx={{ color: 'rgba(205, 214, 244, 0.5)', fontSize: '10px', pl: 1 }}>
                          No tools
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </>
  );
}

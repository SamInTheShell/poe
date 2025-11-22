import { Box, Typography, TextField, IconButton, Tooltip } from '@mui/material';
import { X, Plus, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { mcpToolsManager } from '../../tools/MCPToolsManager';

interface EnvironmentVariablesSectionProps {
    serverName: string;
    serverConfig: {
        command: string;
        args: string[];
        env?: Record<string, string>;
    };
    isRunning?: boolean;
    isRestarting?: boolean;
    onUpdate?: () => void;
    onRestartServer?: (serverName: string) => void;
}

export function EnvironmentVariablesSection({
    serverName,
    serverConfig,
    isRunning = false,
    isRestarting = false,
    onUpdate,
    onRestartServer
}: EnvironmentVariablesSectionProps) {
    const [envVars, setEnvVars] = useState<Record<string, string>>({});
    const [projectOverrides, setProjectOverrides] = useState<Record<string, string>>({});
    const [newKey, setNewKey] = useState('');
    const [hasChanges, setHasChanges] = useState(false); // Simple: did user make ANY change?

    // Load environment variables
    useEffect(() => {
        const loadEnvVars = () => {
            // Get global env vars from server config
            const globalEnv = serverConfig.env || {};
            setEnvVars(globalEnv);

            // Get project-specific overrides
            const overrides = mcpToolsManager.getProjectEnvOverrides(serverName);
            setProjectOverrides(overrides);
        };

        loadEnvVars();
        // Reset changes flag when component loads/server changes
        setHasChanges(false);
    }, [serverName, serverConfig]);

    // Reset changes flag when server finishes restarting
    useEffect(() => {
        if (!isRestarting && isRunning) {
            setHasChanges(false);
        }
    }, [isRestarting, isRunning]);

    // Handle environment variable value change
    const handleEnvVarChange = async (key: string, value: string) => {
        const globalValue = envVars[key];

        if (value === globalValue) {
            // Value matches global, remove override
            await mcpToolsManager.removeProjectEnvOverride(serverName, key);
            setProjectOverrides(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        } else {
            // Value differs from global, set override
            await mcpToolsManager.setProjectEnvOverride(serverName, key, value);
            setProjectOverrides(prev => ({ ...prev, [key]: value }));
        }

        // User made a change, show the button!
        setHasChanges(true);
        onUpdate?.();
    };

    // Handle adding new environment variable
    const handleAddEnvVar = async () => {
        if (!newKey.trim() || envVars[newKey] !== undefined) return;

        await mcpToolsManager.setProjectEnvOverride(serverName, newKey, '');
        setProjectOverrides(prev => ({ ...prev, [newKey]: '' }));
        setNewKey('');

        // User added a variable, show the button!
        setHasChanges(true);
        onUpdate?.();
    };

    // Handle removing environment variable override
    const handleRemoveEnvVar = async (key: string) => {
        await mcpToolsManager.removeProjectEnvOverride(serverName, key);
        setProjectOverrides(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        // User removed a variable, show the button!
        setHasChanges(true);
        onUpdate?.();
    };

    // Handle restart server
    const handleRestartServer = () => {
        // SIMPLE: User clicked restart, hide the button!
        setHasChanges(false);
        onRestartServer?.(serverName);
    };    // Get all environment variables (global + project overrides)
    const allEnvVars = { ...envVars, ...projectOverrides };
    const envVarKeys = Object.keys(allEnvVars).sort();

    return (
        <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: '#f9e2af',
                        fontWeight: 500,
                        fontSize: '10px',
                        pl: 0.5
                    }}
                >
                    Environment Variables
                </Typography>

                {/* Restart hint when server is running and user made changes */}
                {isRunning && hasChanges && (
                    <Tooltip title="Restart server to apply environment changes">
                        <IconButton
                            onClick={handleRestartServer}
                            size="small"
                            sx={{
                                width: 16,
                                height: 16,
                                p: 0,
                                color: '#f9e2af',
                                '&:hover': { color: '#fab387' },
                            }}
                        >
                            <RefreshCw size={10} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Existing environment variables */}
            {envVarKeys.map((key) => {
                const globalValue = envVars[key] || '';
                const currentValue = projectOverrides[key] !== undefined
                    ? projectOverrides[key]
                    : globalValue;
                const isOverridden = projectOverrides[key] !== undefined;
                const isCustom = envVars[key] === undefined;

                return (
                    <Box
                        key={key}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            mb: 0.5,
                            p: 0.5,
                            borderRadius: 0.5,
                            backgroundColor: isOverridden ? 'rgba(249, 226, 175, 0.1)' : '#313244',
                            border: isOverridden ? '1px solid rgba(249, 226, 175, 0.3)' : 'none',
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                color: isCustom ? '#a6e3a1' : '#cdd6f4',
                                fontSize: '9px',
                                fontWeight: 500,
                                minWidth: 60,
                                maxWidth: 60,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {key}
                        </Typography>

                        <TextField
                            value={currentValue}
                            onChange={(e) => handleEnvVarChange(key, e.target.value)}
                            placeholder={globalValue || 'Enter value...'}
                            size="small"
                            sx={{
                                flex: 1,
                                '& .MuiInputBase-root': {
                                    height: 20,
                                    fontSize: '9px',
                                    color: '#cdd6f4',
                                    backgroundColor: 'rgba(30, 30, 46, 0.8)',
                                },
                                '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: 'rgba(205, 214, 244, 0.2)',
                                },
                                '& .MuiInputBase-input': {
                                    py: 0,
                                    px: 0.5,
                                    '&::placeholder': {
                                        color: 'rgba(205, 214, 244, 0.5)',
                                        opacity: 1,
                                    },
                                },
                            }}
                        />

                        {isCustom && (
                            <Tooltip title="Remove custom variable">
                                <IconButton
                                    onClick={() => handleRemoveEnvVar(key)}
                                    size="small"
                                    sx={{
                                        width: 16,
                                        height: 16,
                                        p: 0,
                                        color: '#f38ba8',
                                        '&:hover': { color: '#eba0ac' },
                                    }}
                                >
                                    <X size={10} />
                                </IconButton>
                            </Tooltip>
                        )}

                        {isOverridden && !isCustom && (
                            <Tooltip title="Reset to global value">
                                <IconButton
                                    onClick={() => handleEnvVarChange(key, globalValue)}
                                    size="small"
                                    sx={{
                                        width: 16,
                                        height: 16,
                                        p: 0,
                                        color: '#f9e2af',
                                        '&:hover': { color: '#f9e2af' },
                                    }}
                                >
                                    <X size={10} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            })}

            {/* Add new environment variable */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TextField
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Add variable..."
                    size="small"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleAddEnvVar();
                        }
                    }}
                    sx={{
                        flex: 1,
                        '& .MuiInputBase-root': {
                            height: 20,
                            fontSize: '9px',
                            color: '#cdd6f4',
                            backgroundColor: '#1e1e2e',
                        },
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgba(205, 214, 244, 0.2)',
                            borderStyle: 'dashed',
                        },
                        '& .MuiInputBase-input': {
                            py: 0,
                            px: 0.5,
                            '&::placeholder': {
                                color: 'rgba(205, 214, 244, 0.4)',
                                opacity: 1,
                            },
                        },
                    }}
                />
                <Tooltip title="Add environment variable">
                    <IconButton
                        onClick={handleAddEnvVar}
                        disabled={!newKey.trim() || envVars[newKey] !== undefined}
                        size="small"
                        sx={{
                            width: 16,
                            height: 16,
                            p: 0,
                            color: '#a6e3a1',
                            '&:hover': { color: '#a6e3a1' },
                            '&.Mui-disabled': { color: 'rgba(205, 214, 244, 0.3)' },
                        }}
                    >
                        <Plus size={10} />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
}

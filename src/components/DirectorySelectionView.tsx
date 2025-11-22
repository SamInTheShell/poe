import {
    Box,
    Typography,
    Button,
    IconButton,
    Checkbox,
    FormControlLabel,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import { FolderOpen, Settings, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface DirectorySelectionViewProps {
    onDirectorySelected: (path: string, loadHistory: boolean) => void;
    onOpenSettings: (tab?: string | number) => void;
}

interface RecentProject {
    path: string;
    lastAccessed: string;
}

export function DirectorySelectionView({
    onDirectorySelected,
    onOpenSettings,
}: DirectorySelectionViewProps) {
    const [error, setError] = useState<string | null>(null);
    const [loadHistory, setLoadHistory] = useState(true);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [homeDir, setHomeDir] = useState<string>("");
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

    // Load recent projects and preferences on mount
    useEffect(() => {
        const loadData = async () => {
            // Load home directory
            const home = await window.electronAPI.getHomeDir();
            setHomeDir(home);

            // Load recent projects
            const result = await window.electronAPI.recentProjectsGet();
            if (result.success) {
                setRecentProjects(result.projects);
            }

            // Load load history preference
            const prefResult = await window.electronAPI.preferencesGet("loadHistory");
            if (prefResult.success && prefResult.value !== null) {
                setLoadHistory(prefResult.value as boolean);
            }
        };

        loadData();
    }, []);

    const handleBrowse = async () => {
        const selectedPath = await window.electronAPI.selectDirectory();
        if (selectedPath) {
            setError(null);
            // Immediately start with the selected directory
            await handleStartWithPath(selectedPath);
        }
    };

    const handleRecentProjectClick = async (projectPath: string) => {
        setError(null);
        // Immediately start with the recent project
        await handleStartWithPath(projectPath);
    };

    const handleStartWithPath = async (pathToUse: string) => {
        // Expand ~ to home directory if present
        const expandedPath = await window.electronAPI.expandPath(pathToUse);

        // Validate the directory
        const validation = await window.electronAPI.validateDirectory(expandedPath);

        if (!validation.valid) {
            setError(validation.error || "Invalid directory");
            return;
        }

        // Change the working directory
        const changeResult =
            await window.electronAPI.changeWorkingDirectory(expandedPath);

        if (!changeResult.success) {
            setError(changeResult.error || "Failed to change working directory");
            return;
        }

        // Add to recent projects
        await window.electronAPI.recentProjectsAdd(expandedPath);

        // Save load history preference
        await window.electronAPI.preferencesSet("loadHistory", loadHistory);

        // Directory is valid and working directory changed, proceed
        setError(null);
        onDirectorySelected(expandedPath, loadHistory);
    };

    const handleClearHistoryClick = () => {
        setClearConfirmOpen(true);
    };

    const handleClearHistoryConfirm = async () => {
        const result = await window.electronAPI.recentProjectsClear();
        if (result.success) {
            setRecentProjects([]);
        }
        setClearConfirmOpen(false);
    };

    const handleClearHistoryCancel = () => {
        setClearConfirmOpen(false);
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                backgroundColor: "#1e1e2e",
                position: "relative",
            }}
        >
            {/* Settings icon in top right */}
            <IconButton
                onClick={() => onOpenSettings()}
                sx={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    color: "#cdd6f4",
                    "&:hover": {
                        backgroundColor: "rgba(205, 214, 244, 0.1)",
                    },
                }}
            >
                <Settings size={20} />
            </IconButton>

            {/* Main content - split into top and bottom sections */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    height: "100%",
                    width: "100%",
                    maxWidth: 600,
                    px: 4,
                    py: 4,
                }}
            >
                {/* Top section - header and recent projects */}
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        minHeight: 0,
                        overflow: "hidden",
                    }}
                >
                    <Typography variant="h3" sx={{ color: "#cdd6f4", flexShrink: 0 }}>
                        POE
                    </Typography>

                    <Typography
                        variant="body1"
                        sx={{ color: "rgba(205, 214, 244, 0.8)", flexShrink: 0 }}
                    >
                        Select a working directory to get started
                    </Typography>

                    {/* Recent Projects - scrollable */}
                    {recentProjects.length > 0 && (
                        <Box
                            sx={{
                                width: "100%",
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 1,
                                    flexShrink: 0,
                                }}
                            >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Clock size={16} color="#89b4fa" />
                                    <Typography
                                        variant="body2"
                                        sx={{ color: "#89b4fa", fontWeight: 500 }}
                                    >
                                        Recent Projects
                                    </Typography>
                                </Box>
                                <Typography
                                    component="a"
                                    onClick={handleClearHistoryClick}
                                    sx={{
                                        color: "rgba(205, 214, 244, 0.4)",
                                        fontSize: "0.75rem",
                                        cursor: "pointer",
                                        textDecoration: "none",
                                        "&:hover": {
                                            color: "rgba(205, 214, 244, 0.7)",
                                            textDecoration: "underline",
                                        },
                                    }}
                                >
                                    Clear History
                                </Typography>
                            </Box>
                            <List
                                sx={{
                                    bgcolor: "rgba(30, 30, 46, 0.6)",
                                    borderRadius: 1,
                                    border: "1px solid rgba(205, 214, 244, 0.1)",
                                    overflow: "auto",
                                    flexGrow: 1,
                                    minHeight: 0,
                                }}
                            >
                                {recentProjects.map((project) => {
                                    const displayPath =
                                        homeDir && project.path.startsWith(homeDir)
                                            ? project.path.replace(homeDir, "~")
                                            : project.path;

                                    return (
                                        <ListItem key={project.path} disablePadding>
                                            <ListItemButton
                                                onClick={() => handleRecentProjectClick(project.path)}
                                                sx={{
                                                    py: 0.5,
                                                    px: 2,
                                                    "&:hover": {
                                                        backgroundColor: "rgba(137, 180, 250, 0.1)",
                                                    },
                                                }}
                                            >
                                                <ListItemText
                                                    primary={displayPath}
                                                    secondary={new Date(
                                                        project.lastAccessed,
                                                    ).toLocaleString()}
                                                    primaryTypographyProps={{
                                                        sx: {
                                                            color: "#cdd6f4",
                                                            fontSize: "0.9rem",
                                                            fontFamily: "monospace",
                                                        },
                                                    }}
                                                    secondaryTypographyProps={{
                                                        sx: {
                                                            color: "rgba(205, 214, 244, 0.5)",
                                                            fontSize: "0.75rem",
                                                        },
                                                    }}
                                                    sx={{ my: 0 }}
                                                />
                                            </ListItemButton>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        </Box>
                    )}
                </Box>

                {/* Bottom section - browse button */}
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        flexShrink: 0,
                        width: "100%",
                    }}
                >
                    <Button
                        variant="contained"
                        onClick={handleBrowse}
                        sx={{
                            minWidth: 200,
                            backgroundColor: "#89b4fa",
                            color: "#1e1e2e",
                            "&:hover": {
                                backgroundColor: "#7aa2f7",
                            },
                        }}
                        startIcon={<FolderOpen size={18} />}
                    >
                        Browse
                    </Button>

                    {error && (
                        <Typography variant="caption" sx={{ color: "#f38ba8" }}>
                            {error}
                        </Typography>
                    )}

                    {/* Load history checkbox - subtle and below Browse button */}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={loadHistory}
                                onChange={(e) => setLoadHistory(e.target.checked)}
                                size="small"
                                sx={{
                                    color: "rgba(205, 214, 244, 0.2)",
                                    padding: 0.5,
                                    "&.Mui-checked": {
                                        color: "rgba(137, 180, 250, 0.6)",
                                    },
                                }}
                            />
                        }
                        label="Load last session history if available"
                        sx={{
                            color: "rgba(205, 214, 244, 0.5)",
                            "& .MuiFormControlLabel-label": {
                                fontSize: "0.75rem",
                            },
                        }}
                    />
                </Box>
            </Box>

            {/* Clear History Confirmation Dialog */}
            <Dialog
                open={clearConfirmOpen}
                onClose={handleClearHistoryCancel}
                PaperProps={{
                    sx: {
                        backgroundColor: "#313244",
                        color: "#cdd6f4",
                    },
                }}
            >
                <DialogTitle sx={{ color: "#cdd6f4" }}>
                    Clear Recent Projects History?
                </DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ color: "rgba(205, 214, 244, 0.8)" }}>
                        This will remove all recent projects from the list. This action
                        cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={handleClearHistoryCancel}
                        sx={{
                            color: "rgba(205, 214, 244, 0.7)",
                            "&:hover": {
                                backgroundColor: "rgba(205, 214, 244, 0.1)",
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleClearHistoryConfirm}
                        sx={{
                            color: "#f38ba8",
                            "&:hover": {
                                backgroundColor: "rgba(243, 139, 168, 0.1)",
                            },
                        }}
                        autoFocus
                    >
                        Clear
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

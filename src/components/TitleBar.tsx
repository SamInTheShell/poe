import { Box, Typography, IconButton } from "@mui/material";
import { Minimize, Maximize2, X } from "lucide-react";

export function TitleBar() {
        const handleMinimize = () => {
                console.log(
                        "Minimize clicked, electronAPI available:",
                        !!window.electronAPI,
                );
                if (window.electronAPI) {
                        window.electronAPI.minimizeWindow().catch(console.error);
                } else {
                        console.error("electronAPI not available");
                }
        };

        const handleMaximize = () => {
                console.log(
                        "Maximize clicked, electronAPI available:",
                        !!window.electronAPI,
                );
                if (window.electronAPI) {
                        window.electronAPI.maximizeWindow().catch(console.error);
                } else {
                        console.error("electronAPI not available");
                }
        };

        const handleClose = () => {
                console.log("Close clicked, electronAPI available:", !!window.electronAPI);
                if (window.electronAPI) {
                        window.electronAPI.closeWindow().catch(console.error);
                } else {
                        console.error("electronAPI not available");
                }
        };

        return (
                <Box
                        sx={{
                                height: 40,
                                minHeight: 40,
                                flexShrink: 0,
                                background:
                                        "linear-gradient(135deg, #16191f 0%, #1a1d24 50%, #16191f 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingLeft: 2,
                                paddingRight: 1,
                                WebkitAppRegion: "drag",
                                color: "#cdd6f4",
                                borderBottom: "1px solid rgba(205, 214, 244, 0.1)",
                        }}
                >
                        <Typography variant="h6" sx={{ fontSize: "14px", fontWeight: 500 }}>
                                POE
                        </Typography>

                        <Box sx={{ WebkitAppRegion: "no-drag", display: "flex" }}>
                                <IconButton
                                        size="small"
                                        onClick={handleMinimize}
                                        sx={{
                                                color: "#cdd6f4",
                                                "&:hover": { backgroundColor: "rgba(205, 214, 244, 0.1)" },
                                        }}
                                >
                                        <Minimize size={14} />
                                </IconButton>
                                <IconButton
                                        size="small"
                                        onClick={handleMaximize}
                                        sx={{
                                                color: "#cdd6f4",
                                                "&:hover": { backgroundColor: "rgba(205, 214, 244, 0.1)" },
                                        }}
                                >
                                        <Maximize2 size={14} />
                                </IconButton>
                                <IconButton
                                        size="small"
                                        onClick={handleClose}
                                        sx={{
                                                color: "#cdd6f4",
                                                "&:hover": { backgroundColor: "rgba(255, 99, 99, 0.3)" },
                                        }}
                                >
                                        <X size={14} />
                                </IconButton>
                        </Box>
                </Box>
        );
}

import { useState } from "react";
import { ThemeProvider, createTheme, CssBaseline, Box } from "@mui/material";
import { TitleBar } from "./components/TitleBar";
import { DirectorySelectionView } from "./components/DirectorySelectionView";
import { ProjectView } from "./components/ProjectView";
import { SettingsView } from "./components/SettingsView";
import "./App.css";

const theme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: "#cdd6f4",
		},
		background: {
			default: "#1e1e2e",
			paper: "#1e1e2e",
		},
		text: {
			primary: "#cdd6f4",
			secondary: "rgba(205, 214, 244, 0.8)",
		},
	},
	typography: {
		fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
	},
});

type ViewType = 'directory-selection' | 'project' | 'settings';

function App() {
	const [currentView, setCurrentView] = useState<ViewType>('directory-selection');
	const [previousView, setPreviousView] = useState<ViewType>('directory-selection');
	const [workingDirectory, setWorkingDirectory] = useState<string>('');
	const [loadHistory, setLoadHistory] = useState<boolean>(true);
	const [focusTrigger, setFocusTrigger] = useState(0);
	const [settingsTab, setSettingsTab] = useState<number>(0);

	const handleDirectorySelected = (path: string, shouldLoadHistory: boolean) => {
		setWorkingDirectory(path);
		setLoadHistory(shouldLoadHistory);
		setCurrentView('project');
		setFocusTrigger(prev => prev + 1);
	};

	const handleOpenSettings = (tab?: string | number) => {
		setPreviousView(currentView);
		setCurrentView('settings');

		// Map tab name to index
		if (typeof tab === 'string') {
			const tabMap: Record<string, number> = {
				'providers': 0,
				'mcp': 1,
				'prompts': 2,
			};
			setSettingsTab(tabMap[tab] ?? 0);
		} else if (typeof tab === 'number') {
			setSettingsTab(tab);
		} else {
			setSettingsTab(0);
		}
	};

	const handleCloseSettings = () => {
		setCurrentView(previousView);
		// Trigger focus when returning to project view
		if (previousView === 'project') {
			setFocusTrigger(prev => prev + 1);
		}
	};

	const renderView = () => {
		switch (currentView) {
			case 'directory-selection':
				return (
					<DirectorySelectionView
						onDirectorySelected={handleDirectorySelected}
						onOpenSettings={handleOpenSettings}
					/>
				);
			case 'project':
				return (
					<ProjectView
						workingDirectory={workingDirectory}
						loadHistory={loadHistory}
						onOpenSettings={handleOpenSettings}
						focusTrigger={focusTrigger}
					/>
				);
			case 'settings':
				return <SettingsView onClose={handleCloseSettings} initialTab={settingsTab} />;
		}
	};

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<Box
				sx={{
					height: "100vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<TitleBar />
				<Box sx={{ flexGrow: 1, overflow: "hidden" }}>
					{renderView()}
				</Box>
			</Box>
		</ThemeProvider>
	);
}

export default App;

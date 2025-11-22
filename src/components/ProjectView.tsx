import ChatProvider from '../context/ChatContext';
import { ChatContainer } from './chat/ChatContainer';
import { initializeTools } from '../tools';

interface ProjectViewProps {
  workingDirectory: string;
  loadHistory: boolean;
  onOpenSettings: (tab?: string | number) => void;
  focusTrigger?: number;
}

// Initialize tools on module load
initializeTools();

export function ProjectView({ workingDirectory, loadHistory, onOpenSettings, focusTrigger }: ProjectViewProps) {
  return (
    <ChatProvider workingDirectory={workingDirectory} loadHistory={loadHistory}>
      <ChatContainer
        workingDirectory={workingDirectory}
        onOpenSettings={onOpenSettings}
        focusTrigger={focusTrigger}
      />
    </ChatProvider>
  );
}

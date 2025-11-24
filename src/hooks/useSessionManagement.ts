import { useState, useCallback } from 'react';
import type { ChatState } from '../context/ChatContext';

interface Session {
  id: string;
  lastModified: string;
  messageCount: number;
  name: string;
  isCustomName: boolean;
}

export const useSessionManagement = (
  state: ChatState,
  workingDirectory: string,
  loadSession: (sessionId: string) => Promise<void>,
  createNewSession: () => Promise<void>
) => {
  const [sessionMenuAnchor, setSessionMenuAnchor] = useState<null | HTMLElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const loadSessions = async () => {
    if (!workingDirectory) return;

    try {
      const result = await window.electronAPI.sessionList(workingDirectory);
      if (result.success) {
        setSessions(result.sessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleOpenSessionMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!state.isLoading) {
      loadSessions();
      setSessionMenuAnchor(event.currentTarget);
    }
  };

  const handleCloseSessionMenu = () => {
    setSessionMenuAnchor(null);
  };

  const handleNewSession = useCallback(async () => {
    await createNewSession();
  }, [createNewSession]);

  const handleLoadSession = async (sessionId: string) => {
    await loadSession(sessionId);
    handleCloseSessionMenu();
  };

  const handleDeleteSessionClick = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteSessionConfirm = async () => {
    if (!workingDirectory || !sessionToDelete) return;

    try {
      await window.electronAPI.sessionDelete(workingDirectory, sessionToDelete);
      await loadSessions();

      if (sessionToDelete === state.currentSessionId) {
        await createNewSession();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }

    setDeleteConfirmOpen(false);
    setSessionToDelete(null);
  };

  const handleDeleteSessionCancel = () => {
    setDeleteConfirmOpen(false);
    setSessionToDelete(null);
  };

  const handleClearAllSessionsClick = () => {
    setClearAllConfirmOpen(true);
  };

  const handleClearAllSessionsConfirm = async () => {
    if (!workingDirectory) return;

    try {
      await window.electronAPI.sessionClearAll(workingDirectory);
      setSessions([]);
      await createNewSession();
      handleCloseSessionMenu();
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }

    setClearAllConfirmOpen(false);
  };

  const handleClearAllSessionsCancel = () => {
    setClearAllConfirmOpen(false);
  };

  return {
    sessionMenuAnchor,
    sessions,
    deleteConfirmOpen,
    clearAllConfirmOpen,
    sessionToDelete,
    handleOpenSessionMenu,
    handleCloseSessionMenu,
    handleNewSession,
    handleLoadSession,
    handleDeleteSessionClick,
    handleDeleteSessionConfirm,
    handleDeleteSessionCancel,
    handleClearAllSessionsClick,
    handleClearAllSessionsConfirm,
    handleClearAllSessionsCancel,
  };
};

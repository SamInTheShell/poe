import { createContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode, Dispatch } from 'react';
import type { ChatMessage, ProviderConfig, ModelConfig, ToolCall } from '../types/chat';

// Chat state
export interface ChatState {
  messages: ChatMessage[];
  currentProvider: ProviderConfig | null;
  currentModel: ModelConfig | null;
  providers: ProviderConfig[];
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;
  currentSessionId: string;
  currentSessionName: string;
  isCustomName: boolean;
  contextUsage: {
    used: number;
    total: number;
  } | null;
}

// Chat actions
export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'DELETE_MESSAGE'; payload: string } // message ID
  | { type: 'START_STREAMING'; payload: string } // message ID
  | { type: 'APPEND_TO_STREAMING'; payload: string } // content to append
  | { type: 'END_STREAMING' }
  | { type: 'CANCEL_STREAMING' }
  | { type: 'SET_PROVIDER'; payload: ProviderConfig }
  | { type: 'SET_MODEL'; payload: ModelConfig }
  | { type: 'SET_PROVIDER_AND_MODEL'; payload: { provider: ProviderConfig; model: ModelConfig } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOAD_PROVIDERS'; payload: ProviderConfig[] }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'ADD_TOOL_CALL'; payload: { messageId: string; toolCall: ToolCall } }
  | { type: 'LOAD_MESSAGES'; payload: ChatMessage[] }
  | { type: 'SET_SESSION_ID'; payload: string }
  | { type: 'SET_SESSION_NAME'; payload: { name: string; isCustom: boolean } }
  | { type: 'NEW_SESSION'; payload: string }
  | { type: 'UPDATE_CONTEXT_USAGE'; payload: { used: number; total: number } | null };

// Initial state
const initialState: ChatState = {
  messages: [],
  currentProvider: null,
  currentModel: null,
  providers: [],
  isLoading: false,
  error: null,
  streamingMessageId: null,
  currentSessionId: 'default',
  currentSessionName: '',
  isCustomName: false,
  contextUsage: null,
};

// Helper function to generate display name from session ID
function getDisplayName(sessionId: string, customName: string, isCustom: boolean): string {
  if (isCustom && customName) {
    return customName;
  }
  if (sessionId === 'default') {
    return 'Default Session';
  }
  // Return first 8 chars of UUID
  return `Session ${sessionId.substring(0, 8)}`;
}

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        error: null,
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };

    case 'DELETE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter(msg => msg.id !== action.payload),
      };

    case 'START_STREAMING':
      return {
        ...state,
        streamingMessageId: action.payload,
        isLoading: true,
      };

    case 'APPEND_TO_STREAMING':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === state.streamingMessageId
            ? { ...msg, content: msg.content + action.payload }
            : msg
        ),
      };

    case 'END_STREAMING': {
      // Remove the streaming message if it's completely empty (no content, no tool calls)
      const streamingMessage = state.messages.find(m => m.id === state.streamingMessageId);
      const shouldRemoveEmptyMessage = streamingMessage && 
        !streamingMessage.content && 
        (!streamingMessage.tool_calls || streamingMessage.tool_calls.length === 0);

      return {
        ...state,
        messages: shouldRemoveEmptyMessage 
          ? state.messages.filter(m => m.id !== state.streamingMessageId)
          : state.messages,
        streamingMessageId: null,
        isLoading: false,
      };
    }

    case 'CANCEL_STREAMING': {
      // Remove the streaming message if it's completely empty (no content, no tool calls)
      const streamingMessage = state.messages.find(m => m.id === state.streamingMessageId);
      const shouldRemoveEmptyMessage = streamingMessage && 
        !streamingMessage.content && 
        (!streamingMessage.tool_calls || streamingMessage.tool_calls.length === 0);

      return {
        ...state,
        messages: shouldRemoveEmptyMessage 
          ? state.messages.filter(m => m.id !== state.streamingMessageId)
          : state.messages,
        streamingMessageId: null,
        isLoading: false,
        error: null,
      };
    }

    case 'SET_PROVIDER': {
      // When provider changes, select first chat model if available
      const firstChatModel = action.payload.models.find(m => m.type === 'chat');
      return {
        ...state,
        currentProvider: action.payload,
        currentModel: firstChatModel || action.payload.models[0] || null,
      };
    }

    case 'SET_MODEL':
      return {
        ...state,
        currentModel: action.payload,
      };

    case 'SET_PROVIDER_AND_MODEL':
      return {
        ...state,
        currentProvider: action.payload.provider,
        currentModel: action.payload.model,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case 'LOAD_PROVIDERS': {
      // Auto-select first enabled provider with a chat model
      const defaultProvider = action.payload.find(p =>
        p.enabled && p.models.some(m => m.type === 'chat')
      );
      const defaultModel = defaultProvider?.models.find(m => m.type === 'chat');

      return {
        ...state,
        providers: action.payload,
        currentProvider: defaultProvider || null,
        currentModel: defaultModel || null,
      };
    }

    case 'CLEAR_CONVERSATION':
      return {
        ...state,
        messages: [],
        streamingMessageId: null,
        error: null,
      };

    case 'ADD_TOOL_CALL':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? {
                ...msg,
                tool_calls: [
                  ...(msg.tool_calls || []).filter(tc => tc.id !== action.payload.toolCall.id),
                  action.payload.toolCall
                ]
              }
            : msg
        ),
      };

    case 'LOAD_MESSAGES':
      return {
        ...state,
        messages: action.payload,
      };

    case 'SET_SESSION_ID':
      return {
        ...state,
        currentSessionId: action.payload,
      };

    case 'SET_SESSION_NAME':
      return {
        ...state,
        currentSessionName: action.payload.name,
        isCustomName: action.payload.isCustom,
      };

    case 'NEW_SESSION': {
      const sessionId = action.payload;
      const displayName = getDisplayName(sessionId, '', false);
      return {
        ...state,
        messages: [],
        currentSessionId: sessionId,
        currentSessionName: displayName,
        isCustomName: false,
        streamingMessageId: null,
        error: null,
        contextUsage: null,
      };
    }

    case 'UPDATE_CONTEXT_USAGE':
      return {
        ...state,
        contextUsage: action.payload,
      };

    default:
      return state;
  }
}

// Context
const ChatContext = createContext<{
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
  workingDirectory: string;
  loadSession: (sessionId: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  updateSessionName: (name: string) => void;
} | undefined>(undefined);

export interface ChatProviderProps {
  children: ReactNode;
  workingDirectory?: string;
  loadHistory?: boolean;
}

// Provider component - default export for fast refresh
function ChatProvider({ 
  children, 
  workingDirectory, 
  loadHistory 
}: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const hasLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  // Function to load a specific session
  const loadSessionById = async (sessionId: string) => {
    if (!workingDirectory) return;

    try {
      const result = await window.electronAPI.sessionLoad(workingDirectory, sessionId);
      if (result.success && result.messages && Array.isArray(result.messages)) {
        console.log('Loaded session:', sessionId, result.messages.length, 'messages', 'name:', result.name, 'isCustom:', result.isCustomName);
        dispatch({ type: 'LOAD_MESSAGES', payload: result.messages as ChatMessage[] });
        dispatch({ type: 'SET_SESSION_ID', payload: sessionId });

        const displayName = getDisplayName(sessionId, result.name || '', result.isCustomName || false);
        dispatch({ type: 'SET_SESSION_NAME', payload: { name: displayName, isCustom: result.isCustomName || false } });

        // Restore provider and model from session if available
        if (result.providerId && result.modelId) {
          const provider = state.providers.find(p => p.id === result.providerId);
          const model = provider?.models.find(m => m.id === result.modelId);
          if (provider && model) {
            console.log('Restoring provider and model:', provider.id, model.id);
            dispatch({ type: 'SET_PROVIDER_AND_MODEL', payload: { provider, model } });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  // Function to update session name
  const updateSessionName = (name: string) => {
    if (!name.trim()) {
      // User cleared the field - revert to auto-generated name
      const displayName = getDisplayName(state.currentSessionId, '', false);
      dispatch({ type: 'SET_SESSION_NAME', payload: { name: displayName, isCustom: false } });
    } else {
      // User is typing a custom name
      dispatch({ type: 'SET_SESSION_NAME', payload: { name, isCustom: true } });
    }
  };

  // Function to create a new session
  const createNewSession = async () => {
    const newSessionId = crypto.randomUUID();
    dispatch({ type: 'NEW_SESSION', payload: newSessionId });

    // Save the empty session immediately so it shows up in the session list
    if (workingDirectory) {
      try {
        const displayName = getDisplayName(newSessionId, '', false);
        await window.electronAPI.sessionSave(
          workingDirectory,
          newSessionId,
          [],
          displayName,
          false,
          state.currentProvider?.id,
          state.currentModel?.id
        );
      } catch (error) {
        console.error('Failed to save new session:', error);
      }
    }
  };

  // Load session or create new session on mount
  useEffect(() => {
    if (!workingDirectory || hasLoadedRef.current) return;

    const initializeSession = async () => {
      try {
        if (loadHistory) {
          // Load the last session
          const lastSessionResult = await window.electronAPI.sessionGetLast(workingDirectory);
          const sessionId = lastSessionResult.success && lastSessionResult.sessionId ? lastSessionResult.sessionId : 'default';

          console.log('Loading last session:', sessionId);
          const result = await window.electronAPI.sessionLoad(workingDirectory, sessionId);
          if (result.success && result.messages && Array.isArray(result.messages)) {
            console.log('Loaded session history:', result.messages.length, 'messages', 'name:', result.name, 'isCustom:', result.isCustomName);
            dispatch({ type: 'LOAD_MESSAGES', payload: result.messages as ChatMessage[] });
            dispatch({ type: 'SET_SESSION_ID', payload: sessionId });

            const displayName = getDisplayName(sessionId, result.name || '', result.isCustomName || false);
            dispatch({ type: 'SET_SESSION_NAME', payload: { name: displayName, isCustom: result.isCustomName || false } });

            // Restore provider and model from session if available
            if (result.providerId && result.modelId) {
              const provider = state.providers.find(p => p.id === result.providerId);
              const model = provider?.models.find(m => m.id === result.modelId);
              if (provider && model) {
                console.log('Restoring provider and model:', provider.id, model.id);
                dispatch({ type: 'SET_PROVIDER_AND_MODEL', payload: { provider, model } });
              }
            }
          }
        } else {
          // Create a new session
          console.log('Creating new session (loadHistory is false)');
          const newSessionId = crypto.randomUUID();
          dispatch({ type: 'NEW_SESSION', payload: newSessionId });

          // Save the empty session immediately
          const displayName = getDisplayName(newSessionId, '', false);
          await window.electronAPI.sessionSave(
            workingDirectory,
            newSessionId,
            [],
            displayName,
            false,
            state.currentProvider?.id,
            state.currentModel?.id
          );
        }
      } catch (error) {
        console.error('Failed to initialize session:', error);
      }
      hasLoadedRef.current = true;
    };

    initializeSession();
  }, [workingDirectory, loadHistory, state.providers]);

  // Auto-save session when messages change (with debounce)
  useEffect(() => {
    if (!workingDirectory || !hasLoadedRef.current) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to save after 1 second of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      window.electronAPI.sessionSave(
        workingDirectory,
        state.currentSessionId,
        state.messages,
        state.currentSessionName,
        state.isCustomName,
        state.currentProvider?.id,
        state.currentModel?.id
      ).catch(error => {
        console.error('Failed to save session:', error);
      });
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [workingDirectory, state.messages, state.currentSessionId, state.currentSessionName, state.isCustomName, state.currentProvider, state.currentModel]);

  return (
    <ChatContext.Provider value={{
      state,
      dispatch,
      workingDirectory: workingDirectory || '',
      loadSession: loadSessionById,
      createNewSession,
      updateSessionName
    }}>
      {children}
    </ChatContext.Provider>
  );
}

// Export ChatProvider as default for fast refresh
export default ChatProvider;

// Export context for useChat hook
export { ChatContext };

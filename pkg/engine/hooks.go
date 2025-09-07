package engine

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type PreMessageHook func(message string, messages []Message, ctx context.Context) (string, []Message, error)

type StreamProcessorHook func(streamCtx *StreamContext) (*StreamContext, error)

type HookRegistry struct {
	preMessageHooks     []PreMessageHook
	streamProcessorHooks []StreamProcessorHook
}

func NewHookRegistry() *HookRegistry {
	return &HookRegistry{
		preMessageHooks:     make([]PreMessageHook, 0),
		streamProcessorHooks: make([]StreamProcessorHook, 0),
	}
}

func (h *HookRegistry) AddPreMessageHook(hook PreMessageHook) {
	h.preMessageHooks = append(h.preMessageHooks, hook)
}

func (h *HookRegistry) AddStreamProcessorHook(hook StreamProcessorHook) {
	h.streamProcessorHooks = append(h.streamProcessorHooks, hook)
}

func (h *HookRegistry) ProcessPreMessage(message string, messages []Message, ctx context.Context) (string, []Message, error) {
	processedMessage := message
	processedMessages := messages

	for _, hook := range h.preMessageHooks {
		var err error
		processedMessage, processedMessages, err = hook(processedMessage, processedMessages, ctx)
		if err != nil {
			return message, messages, err
		}
	}

	return processedMessage, processedMessages, nil
}

func (h *HookRegistry) ProcessStreamChunk(streamCtx *StreamContext) (*StreamContext, error) {
	processedCtx := streamCtx

	for _, hook := range h.streamProcessorHooks {
		var err error
		processedCtx, err = hook(processedCtx)
		if err != nil {
			return streamCtx, err
		}
	}

	return processedCtx, nil
}

func TimestampHook(message string, messages []Message, ctx context.Context) (string, []Message, error) {
	timestamp := "[" + getCurrentTimestamp() + "]"
	timestamped := timestamp + "\n" + message
	return timestamped, messages, nil
}

func getCurrentTimestamp() string {
	return time.Now().Format("Monday, 2006-01-02 15:04:05")
}

func TagProcessorHook(streamCtx *StreamContext) (*StreamContext, error) {
	content := streamCtx.Chunk.Content
	
	if strings.Contains(content, "<TOOL>") {
		processedContent := strings.ReplaceAll(content, "<TOOL>", "[TOOL DETECTED]")
		streamCtx.Chunk.Content = processedContent
	}
	
	if strings.Contains(content, "{WORKFLOW}") {
		processedContent := strings.ReplaceAll(content, "{WORKFLOW}", "[WORKFLOW TRIGGER]")
		streamCtx.Chunk.Content = processedContent
	}
	
	return streamCtx, nil
}

func RAGHook(streamCtx *StreamContext) (*StreamContext, error) {
	content := streamCtx.Chunk.Content
	
	if strings.Contains(content, "<RAG:") {
		start := strings.Index(content, "<RAG:")
		end := strings.Index(content[start:], ">")
		if end != -1 {
			end += start
			ragQuery := content[start+5:end]
			
			ragResult := fmt.Sprintf("[RAG: Retrieved context for '%s']", ragQuery)
			
			processedContent := content[:start] + ragResult + content[end+1:]
			streamCtx.Chunk.Content = processedContent
		}
	}
	
	return streamCtx, nil
}
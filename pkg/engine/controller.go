package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/samintheshell/poe/pkg/prompts"
)

type ControllerMsg interface {
	controllerMsg()
}

type SendMessageMsg struct {
	Message  string
	Messages []Message
	Model    string
}

func (SendMessageMsg) controllerMsg() {}

type CancelRequestMsg struct{}

func (CancelRequestMsg) controllerMsg() {}

type ShutdownMsg struct{}

func (ShutdownMsg) controllerMsg() {}

type ViewMsg interface {
	viewMsg()
}

type ResponseMsg struct {
	Content string
}

func (ResponseMsg) viewMsg() {}

type ErrorMsg struct {
	Error string
}

func (ErrorMsg) viewMsg() {}

type RequestCancelledMsg struct{}

func (RequestCancelledMsg) viewMsg() {}

type DebugMsg struct {
	Message string
}

func (DebugMsg) viewMsg() {}

type StreamStartMsg struct{}

func (StreamStartMsg) viewMsg() {}

type StreamChunkMsg struct {
	Content    string
	IsThinking bool
}

func (StreamChunkMsg) viewMsg() {}

type StreamEndMsg struct{}

func (StreamEndMsg) viewMsg() {}

type FunctionCallMsg struct {
	Name      string
	Arguments map[string]interface{}
}

func (FunctionCallMsg) viewMsg() {}

type FunctionResultMsg struct {
	Name    string
	Content string
	IsError bool
}

func (FunctionResultMsg) viewMsg() {}

type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

type OllamaChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}


type OllamaChatResponse struct {
	Model     string  `json:"model"`
	Message   Message `json:"message"`
	Done      bool    `json:"done"`
	CreatedAt string  `json:"created_at"`
}

type Controller struct {
	toController chan ControllerMsg
	toView       chan ViewMsg
	currentReq   context.CancelFunc
	engine       *Engine
}

func NewController(toController chan ControllerMsg, toView chan ViewMsg, engine *Engine) *Controller {
	return &Controller{
		toController: toController,
		toView:       toView,
		engine:       engine,
	}
}

func (c *Controller) Run() {
	for {
		select {
		case msg := <-c.toController:
			switch m := msg.(type) {
			case SendMessageMsg:
				c.handleSendMessage(m)
			case CancelRequestMsg:
				c.handleCancelRequest()
			case ShutdownMsg:
				return
			}
		}
	}
}

func (c *Controller) handleSendMessage(msg SendMessageMsg) {
	if c.currentReq != nil {
		c.currentReq()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	c.currentReq = cancel

	if c.engine.config.Debug {
		select {
		case c.toView <- DebugMsg{Message: fmt.Sprintf("🔄 Starting request to %s", msg.Model)}:
		default:
		}
	}

	go func() {
		defer func() {
			c.currentReq = nil
		}()

		processedMessage, processedMessages, err := c.engine.hooks.ProcessPreMessage(msg.Message, msg.Messages, ctx)
		if err != nil {
			select {
			case c.toView <- ErrorMsg{Error: fmt.Sprintf("Pre-message hook error: %v", err)}:
			case <-ctx.Done():
			}
			return
		}

		if c.engine.config.Debug && processedMessage != msg.Message {
			select {
			case c.toView <- DebugMsg{Message: fmt.Sprintf("📝 Message modified by hooks: %s", processedMessage)}:
			default:
			}
		}

		var allMessages []Message

		systemPrompt := c.loadSystemPrompt()
		if systemPrompt != nil {
			hasSystemMessage := len(processedMessages) > 0 && processedMessages[0].Role == "system"
			if !hasSystemMessage {
				allMessages = append(allMessages, *systemPrompt)
			}
		}

		allMessages = append(allMessages, processedMessages...)
		allMessages = append(allMessages, Message{
			Role:    "user",
			Content: processedMessage,
		})

		requestCtx := &RequestContext{
			Messages: allMessages,
			Model:    msg.Model,
			Context:  ctx,
		}

		c.performRequest(requestCtx)
	}()
}

func (c *Controller) performRequest(reqCtx *RequestContext) {
	// Add tools if functions are registered
	var tools []Tool
	if len(c.engine.Functions().List()) > 0 {
		tools = c.buildOllamaTools()
	}

	requestBody := map[string]interface{}{
		"model":    reqCtx.Model,
		"messages": reqCtx.Messages,
		"stream":   true,
	}
	
	if len(tools) > 0 {
		requestBody["tools"] = tools
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		select {
		case c.toView <- ErrorMsg{Error: fmt.Sprintf("Failed to marshal request: %v", err)}:
		case <-reqCtx.Context.Done():
		}
		return
	}

	req, err := http.NewRequestWithContext(reqCtx.Context, "POST", "http://localhost:11434/api/chat", bytes.NewBuffer(jsonData))
	if err != nil {
		select {
		case c.toView <- ErrorMsg{Error: fmt.Sprintf("Failed to create request: %v", err)}:
		case <-reqCtx.Context.Done():
		}
		return
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		if reqCtx.Context.Err() != nil {
			select {
			case c.toView <- RequestCancelledMsg{}:
			default:
			}
			return
		}
		select {
		case c.toView <- ErrorMsg{Error: fmt.Sprintf("Failed to call Ollama API: %v", err)}:
		case <-reqCtx.Context.Done():
		}
		return
	}
	defer resp.Body.Close()

	if c.engine.config.Debug {
		select {
		case c.toView <- DebugMsg{Message: fmt.Sprintf("🔗 Connected, status: %d", resp.StatusCode)}:
		default:
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		select {
		case c.toView <- ErrorMsg{Error: fmt.Sprintf("API error %d: %s", resp.StatusCode, string(body))}:
		case <-reqCtx.Context.Done():
		}
		return
	}

	select {
	case c.toView <- StreamStartMsg{}:
	case <-reqCtx.Context.Done():
		return
	}

	c.processStreamingResponse(resp.Body, reqCtx)
}

func (c *Controller) processStreamingResponse(body io.ReadCloser, reqCtx *RequestContext) {
	decoder := json.NewDecoder(body)
	var fullContent strings.Builder
	var thinkingBuilder strings.Builder
	inThinking := false
	
	// Add a timeout to detect stuck streams
	lastChunkTime := time.Now()
	chunkTimeout := 10 * time.Second

	for {
		// Check for timeout
		if time.Since(lastChunkTime) > chunkTimeout {
			if c.engine.config.Debug {
				select {
				case c.toView <- DebugMsg{Message: "⏰ Stream timeout - forcing completion"}:
				default:
				}
			}
			break
		}
		
		var rawBytes json.RawMessage
		if err := decoder.Decode(&rawBytes); err != nil {
			if err == io.EOF {
				break
			}
			if c.engine.config.Debug {
				select {
				case c.toView <- DebugMsg{Message: fmt.Sprintf("🔍 Raw decode error: %v", err)}:
				default:
				}
			}
			select {
			case c.toView <- ErrorMsg{Error: fmt.Sprintf("Failed to parse stream: %v", err)}:
			case <-reqCtx.Context.Done():
			}
			return
		}

		if c.engine.config.Debug {
			// Always show if it contains "done":true or tool_calls
			jsonStr := string(rawBytes)
			if strings.Contains(jsonStr, `"done":true`) || strings.Contains(jsonStr, "tool_calls") {
				select {
				case c.toView <- DebugMsg{Message: fmt.Sprintf("🔍 IMPORTANT: %s", jsonStr)}:
				default:
				}
			} else {
				// Truncate routine thinking chunks  
				if len(jsonStr) > 200 {
					jsonStr = jsonStr[:200] + "..."
				}
				select {
				case c.toView <- DebugMsg{Message: fmt.Sprintf("🔍 Raw JSON: %s", jsonStr)}:
				default:
				}
			}
		}

		var streamResp OllamaChatResponse
		if err := json.Unmarshal(rawBytes, &streamResp); err != nil {
			if c.engine.config.Debug {
				select {
				case c.toView <- DebugMsg{Message: fmt.Sprintf("🔍 Unmarshal error: %v", err)}:
				default:
				}
			}
			continue
		}

		if c.engine.config.Debug {
			select {
			case c.toView <- DebugMsg{Message: fmt.Sprintf("📦 Received chunk: content='%s', done=%v", streamResp.Message.Content, streamResp.Done)}:
			default:
			}
		}

		content := streamResp.Message.Content
		thinking := streamResp.Message.Thinking
		
		// Handle tool calls when response is done
		if streamResp.Done && len(streamResp.Message.ToolCalls) > 0 {
			// Send StreamEndMsg first to preserve any thinking content
			select {
			case c.toView <- StreamEndMsg{}:
			case <-reqCtx.Context.Done():
				return
			}
			
			c.processOllamaToolCalls(streamResp.Message.ToolCalls, reqCtx)
			return
		}
		
		// For thinking models, use the thinking field if content is empty
		isThinkingChunk := false
		if content == "" && thinking != "" {
			content = thinking
			isThinkingChunk = true
		}

		// Skip empty content
		if content == "" {
			if streamResp.Done {
				break
			}
			continue
		}

		// Check for thinking patterns in content (only if not already a thinking chunk)
		if !isThinkingChunk {
			if strings.Contains(content, "Thinking...") || strings.Contains(content, "thinking...") {
				inThinking = true
				isThinkingChunk = true
			} else if strings.Contains(content, "...done thinking.") || strings.Contains(content, "done thinking") {
				if inThinking {
					isThinkingChunk = true
				}
				inThinking = false
			} else if inThinking {
				isThinkingChunk = true
			}
		}

		// Build the chunk
		chunk := StreamChunk{
			Content:    content,
			IsThinking: isThinkingChunk,
		}

		// Update content builders
		if isThinkingChunk {
			thinkingBuilder.WriteString(content)
		} else {
			fullContent.WriteString(content)
		}

		// Process through hooks
		streamCtx := &StreamContext{
			Chunk:   chunk,
			FullText: fullContent.String(),
			Context: reqCtx.Context,
			Request: reqCtx,
		}

		processedStreamCtx, err := c.engine.hooks.ProcessStreamChunk(streamCtx)
		if err != nil {
			select {
			case c.toView <- ErrorMsg{Error: fmt.Sprintf("Stream hook error: %v", err)}:
			case <-reqCtx.Context.Done():
			}
			return
		}

		// Send to view
		select {
		case c.toView <- StreamChunkMsg{Content: processedStreamCtx.Chunk.Content, IsThinking: processedStreamCtx.Chunk.IsThinking}:
		case <-reqCtx.Context.Done():
			return
		}

		// Update last chunk time when we receive data
		lastChunkTime = time.Now()

		if streamResp.Done {
			break
		}
	}

	select {
	case c.toView <- StreamEndMsg{}:
	case <-reqCtx.Context.Done():
		return
	}
}

func (c *Controller) buildOllamaTools() []Tool {
	functions := c.engine.Functions().List()
	tools := make([]Tool, len(functions))
	
	for i, fn := range functions {
		tools[i] = Tool{
			Type: "function",
			Function: ToolFunction{
				Name:        fn.Name(),
				Description: fn.Description(),
				Parameters:  fn.Parameters(),
			},
		}
	}
	
	return tools
}

func (c *Controller) processOllamaToolCalls(toolCalls []ToolCall, reqCtx *RequestContext) {
	// Execute functions and collect results
	var toolResults []Message
	
	for _, toolCall := range toolCalls {
		// Show function call info
		select {
		case c.toView <- FunctionCallMsg{
			Name:      toolCall.Function.Name,
			Arguments: toolCall.Function.Arguments,
		}:
		case <-reqCtx.Context.Done():
			return
		}

		// Convert to our FunctionCall format
		call := FunctionCall{
			Name:      toolCall.Function.Name,
			Arguments: toolCall.Function.Arguments,
		}

		result, err := c.engine.functions.Execute(reqCtx.Context, call)
		if err != nil {
			select {
			case c.toView <- FunctionResultMsg{
				Name:    call.Name,
				Content: fmt.Sprintf("Error: %v", err),
				IsError: true,
			}:
			case <-reqCtx.Context.Done():
			}
			return
		}

		// Show function result
		select {
		case c.toView <- FunctionResultMsg{
			Name:    call.Name,
			Content: result.Content,
			IsError: false,
		}:
		case <-reqCtx.Context.Done():
			return
		}

		// Add tool result message for next AI call
		toolResults = append(toolResults, Message{
			Role:    "tool",
			Content: result.Content,
		})
	}

	// Continue conversation with tool results
	c.continueWithToolResults(reqCtx, toolResults)
}

func (c *Controller) continueWithToolResults(reqCtx *RequestContext, toolResults []Message) {
	// Add tool results to conversation and continue
	newMessages := append(reqCtx.Messages, toolResults...)
	
	newReqCtx := &RequestContext{
		Messages: newMessages,
		Model:    reqCtx.Model,
		Context:  reqCtx.Context,
	}
	
	// Make another request with tool results
	c.performRequest(newReqCtx)
}

func (c *Controller) loadSystemPrompt() *Message {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		// Fallback to default system prompt if we can't get home directory
		return &Message{
			Role:    "system",
			Content: prompts.DefaultSystemPrompt,
		}
	}

	systemPath := filepath.Join(homeDir, ".poe", "SYSTEM.md")
	content, err := os.ReadFile(systemPath)
	if err != nil {
		// SYSTEM.md doesn't exist, use default system prompt
		return &Message{
			Role:    "system",
			Content: prompts.DefaultSystemPrompt,
		}
	}

	systemContent := strings.TrimSpace(string(content))
	if systemContent == "" {
		// SYSTEM.md exists but is empty, use default system prompt
		return &Message{
			Role:    "system",
			Content: prompts.DefaultSystemPrompt,
		}
	}

	// Use custom SYSTEM.md content
	return &Message{
		Role:    "system",
		Content: systemContent,
	}
}

func (c *Controller) handleCancelRequest() {
	if c.currentReq != nil {
		c.currentReq()
		c.currentReq = nil
		c.toView <- StreamEndMsg{}
	}
}


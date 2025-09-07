# Poe Engine Package

A pluggable, extensible chat engine for building AI-powered terminal applications with customizable hooks, function calling, and streaming support.

## Features

- **Pluggable Hook System**: Modify user messages before sending and process streaming responses
- **Function/Tool Registration**: Register custom functions for AI to call
- **Configurable Appearance**: Customize colors, banners, prefixes, and styling
- **Streaming Support**: Real-time response streaming with hook processing
- **Debug Mode**: Detailed logging for development and debugging

## Quick Start

```go
package main

import (
    "log"
    "github.com/samintheshell/poe/pkg/engine"
)

func main() {
    config := &engine.Config{
        Model:            "gpt-oss:20b",
        BannerText:       "My Chat App",
        BannerColorStart: "#FF6B6B",
        BannerColorEnd:   "#4ECDC4",
        UserMessageColor: "75",
        AIMessageColor:   "219",
        Debug:           false,
    }

    e := engine.New(config)

    if err := e.Run(); err != nil {
        log.Fatal(err)
    }
}
```

## Hook System

### Pre-Message Hooks

Modify user messages before they are sent to the AI:

```go
// Add timestamp to messages in debug mode
e.Hooks().AddPreMessageHook(engine.TimestampHook)

// Custom pre-message hook
e.Hooks().AddPreMessageHook(func(message string, messages []engine.Message, ctx context.Context) (string, []engine.Message, error) {
    if message == "test" {
        return "[PROCESSED] " + message, messages, nil
    }
    return message, messages, nil
})
```

### Stream Processing Hooks

Process streaming responses in real-time:

```go
// Built-in tag processor for <TAG> and {NOTATION}
e.Hooks().AddStreamProcessorHook(engine.TagProcessorHook)

// Built-in RAG hook for <RAG:query> notation
e.Hooks().AddStreamProcessorHook(engine.RAGHook)

// Custom stream processor
e.Hooks().AddStreamProcessorHook(func(streamCtx *engine.StreamContext) (*engine.StreamContext, error) {
    if strings.Contains(streamCtx.Chunk.Content, "SECRET") {
        streamCtx.Chunk.Content = "[REDACTED]"
    }
    return streamCtx, nil
})
```

## Function Registration

Register functions for AI tool calling:

```go
// Built-in time function
e.Functions().Register(engine.ExampleTimeFunction())

// Custom function
greetFunc := engine.NewSimpleFunction(
    "greet",
    "Generate a greeting message",
    map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "name": map[string]interface{}{
                "type": "string",
                "description": "Name to greet",
            },
        },
        "required": []string{"name"},
    },
    func(ctx context.Context, args map[string]interface{}) (*engine.FunctionResult, error) {
        name := args["name"].(string)
        return &engine.FunctionResult{
            Content: fmt.Sprintf("Hello, %s!", name),
        }, nil
    },
)

e.Functions().Register(greetFunc)
```

## Configuration Options

```go
type Config struct {
    Model            string  // Ollama model name
    BannerText       string  // ASCII art banner
    BannerColorStart string  // Gradient start color
    BannerColorEnd   string  // Gradient end color
    UserMessageColor string  // User message border color
    AIMessageColor   string  // AI message border color
    SpinnerColor     string  // Loading spinner color
    UserPrefix       string  // User message prefix (e.g., "👤 ")
    AIPrefix         string  // AI message prefix (e.g., "🤖 ")
    Debug           bool    // Enable debug logging
}
```

## Hook Use Cases

### Timestamp Injection
```go
e.Hooks().AddPreMessageHook(engine.TimestampHook)
```

### RAG Support
```go
e.Hooks().AddStreamProcessorHook(engine.RAGHook)
// AI response: "The answer is <RAG:user query> based on context"
// Processed: "The answer is [RAG: Retrieved context for 'user query'] based on context"
```

### Workflow Logic
```go
e.Hooks().AddStreamProcessorHook(func(streamCtx *engine.StreamContext) (*engine.StreamContext, error) {
    if strings.Contains(streamCtx.Chunk.Content, "{NEXT_AGENT}") {
        // Trigger next specialized agent
        return processNextAgent(streamCtx)
    }
    return streamCtx, nil
})
```

### Content Filtering
```go
e.Hooks().AddStreamProcessorHook(func(streamCtx *engine.StreamContext) (*engine.StreamContext, error) {
    streamCtx.Chunk.Content = strings.ReplaceAll(streamCtx.Chunk.Content, "sensitive", "[FILTERED]")
    return streamCtx, nil
})
```

## Examples

See the `example/` directory for complete examples:

- `example/main.go` - Full-featured example with all hooks and functions
- `example/simple/main.go` - Minimal setup example

## Architecture

The engine consists of several key components:

- **Engine**: Main orchestrator managing configuration and components
- **Controller**: Handles HTTP requests and business logic
- **View**: Manages UI rendering and user input using Bubble Tea
- **HookRegistry**: Manages pre-message and stream processing hooks
- **FunctionRegistry**: Manages registered functions for tool calling

The hook system allows for powerful extensibility:
- **Pre-message hooks** run before sending user messages to AI
- **Stream processing hooks** run on each chunk of the AI's streaming response
- Both hook types receive context and can modify content or inject additional processing

This architecture enables use cases like RAG systems, workflow orchestration, content filtering, and multi-agent conversations.
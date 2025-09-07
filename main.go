package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/charmbracelet/lipgloss"
	"github.com/samintheshell/poe/pkg/engine"
	"github.com/samintheshell/poe/pkg/textart"
)

func main() {
	lipgloss.SetHasDarkBackground(true)

	config := &engine.Config{
		Model:            "gpt-oss:20b",
		BannerText:       textart.Banner,
		BannerColorStart: "#00FFFF",
		BannerColorEnd:   "#FF00FF",
		UserMessageColor: "39",
		AIMessageColor:   "205",
		SpinnerColor:     "205",
		UserPrefix:       "",
		AIPrefix:         "",
		Debug:            os.Getenv("DEBUG") == "true" || os.Getenv("DEBUG") == "1",
		ShowThinking:     os.Getenv("SHOW_THINKING") == "true" || os.Getenv("SHOW_THINKING") == "1",
	}

	e := engine.New(config)

	setupHooks(e)

	setupFunctions(e)

	if err := e.Run(); err != nil {
		log.Fatal(err)
	}
}

func setupHooks(e *engine.Engine) {
	e.Hooks().AddPreMessageHook(engine.TimestampHook)

	e.Hooks().AddPreMessageHook(func(message string, messages []engine.Message, ctx context.Context) (string, []engine.Message, error) {
		if message == "test-hook" {
			return "[HOOK PROCESSED] " + message, messages, nil
		}
		return message, messages, nil
	})

	e.Hooks().AddStreamProcessorHook(engine.TagProcessorHook)
	e.Hooks().AddStreamProcessorHook(engine.RAGHook)

	e.Hooks().AddStreamProcessorHook(func(streamCtx *engine.StreamContext) (*engine.StreamContext, error) {
		if streamCtx.Chunk.Content == "SECRET" {
			streamCtx.Chunk.Content = "[REDACTED]"
		}
		return streamCtx, nil
	})
}

func setupFunctions(e *engine.Engine) {
	e.Functions().Register(engine.ExampleTimeFunction())
	e.Functions().Register(engine.ExampleCalculatorFunction())

	customFunc := engine.NewSimpleFunction(
		"greet",
		"Generate a greeting message",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"name": map[string]interface{}{
					"type":        "string",
					"description": "Name to greet",
				},
				"style": map[string]interface{}{
					"type":        "string",
					"description": "Greeting style (formal, casual, funny)",
					"default":     "casual",
				},
			},
			"required": []string{"name"},
		},
		func(ctx context.Context, args map[string]interface{}) (*engine.FunctionResult, error) {
			name, ok := args["name"].(string)
			if !ok {
				return nil, fmt.Errorf("name parameter is required")
			}

			style := "casual"
			if s, ok := args["style"].(string); ok {
				style = s
			}

			var greeting string
			switch style {
			case "formal":
				greeting = fmt.Sprintf("Good day, %s. It's a pleasure to meet you.", name)
			case "funny":
				greeting = fmt.Sprintf("Well hello there, %s! You're looking absolutely fantastic today! 🎉", name)
			default:
				greeting = fmt.Sprintf("Hey %s! Nice to meet you!", name)
			}

			return &engine.FunctionResult{
				Content: greeting,
			}, nil
		},
	)

	e.Functions().Register(customFunc)
}

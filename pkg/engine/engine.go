package engine

import (
	"context"

	tea "github.com/charmbracelet/bubbletea"
)

type Engine struct {
	config     *Config
	controller *Controller
	view       *View
	hooks      *HookRegistry
	functions  *FunctionRegistry
}

type Config struct {
	Model            string
	BannerText       string
	BannerColorStart string
	BannerColorEnd   string
	UserMessageColor string
	AIMessageColor   string
	SpinnerColor     string
	UserPrefix       string
	AIPrefix         string
	Debug            bool
	ShowThinking     bool
}

func New(config *Config) *Engine {
	if config == nil {
		config = DefaultConfig()
	}

	engine := &Engine{
		config:    config,
		hooks:     NewHookRegistry(),
		functions: NewFunctionRegistry(),
	}

	toController := make(chan ControllerMsg, 10)
	toView := make(chan ViewMsg, 10)

	engine.controller = NewController(toController, toView, engine)
	engine.view = NewView(toController, toView, engine)

	return engine
}

func (e *Engine) Run() error {
	go e.controller.Run()

	p := tea.NewProgram(e.view)
	_, err := p.Run()
	return err
}

func (e *Engine) Config() *Config {
	return e.config
}

func (e *Engine) Hooks() *HookRegistry {
	return e.hooks
}

func (e *Engine) Functions() *FunctionRegistry {
	return e.functions
}

func DefaultConfig() *Config {
	return &Config{
		Model:            "gpt-oss:20b",
		BannerText:       "", // Will be set by consumer
		BannerColorStart: "#00FFFF",
		BannerColorEnd:   "#FF00FF",
		UserMessageColor: "39",
		AIMessageColor:   "205",
		SpinnerColor:     "205",
		UserPrefix:       "",
		AIPrefix:         "",
		Debug:            false,
		ShowThinking:     false,
	}
}

type Message struct {
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	Thinking  string     `json:"thinking,omitempty"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
}

type ToolCall struct {
	Function struct {
		Name      string                 `json:"name"`
		Arguments map[string]interface{} `json:"arguments"`
	} `json:"function"`
}

type StreamChunk struct {
	Content    string
	IsThinking bool
}

type FunctionCall struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

type FunctionResult struct {
	Content string
	Error   error
}

type RequestContext struct {
	Messages []Message
	Model    string
	Context  context.Context
}

type StreamContext struct {
	Chunk    StreamChunk
	FullText string
	Context  context.Context
	Request  *RequestContext
}

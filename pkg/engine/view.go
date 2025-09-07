package engine

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	textart "github.com/samintheshell/poe/pkg/textart"
)

type timeoutMsg struct{}

func timeoutCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return timeoutMsg{}
	})
}

type controllerResponseMsg struct {
	msg ViewMsg
}

type View struct {
	toController chan ControllerMsg
	toView       chan ViewMsg
	engine       *Engine

	textarea             textarea.Model
	width                int
	showingConfirmation  bool
	selectedOption       int
	clearRequested       bool
	isWaiting            bool
	spinner              spinner.Model
	waitingPhraseIndex   int
	waitingStartTime     int64
	lastPhraseChangeTime int64

	messages    []Message
	ollamaModel string

	isStreaming      bool
	streamingContent strings.Builder
	thinkingContent  strings.Builder
	showingThinking  bool
}

func NewView(toController chan ControllerMsg, toView chan ViewMsg, engine *Engine) *View {
	ta := textarea.New()
	ta.Placeholder = "Type your message..."
	ta.Focus()
	ta.ShowLineNumbers = false
	ta.Prompt = ""
	ta.SetHeight(1)
	ta.KeyMap.InsertNewline = key.NewBinding(key.WithKeys("ctrl+j"))

	ta.FocusedStyle.Base = lipgloss.NewStyle()
	ta.BlurredStyle.Base = lipgloss.NewStyle()
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
	ta.BlurredStyle.CursorLine = lipgloss.NewStyle()
	ta.FocusedStyle.Text = lipgloss.NewStyle()
	ta.BlurredStyle.Text = lipgloss.NewStyle()
	ta.FocusedStyle.Placeholder = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	ta.BlurredStyle.Placeholder = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))

	s := spinner.New()
	s.Spinner = spinner.Points
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(engine.config.SpinnerColor))

	return &View{
		toController:         toController,
		toView:               toView,
		engine:               engine,
		textarea:             ta,
		width:                80,
		showingConfirmation:  false,
		selectedOption:       0,
		clearRequested:       false,
		isWaiting:            false,
		spinner:              s,
		waitingPhraseIndex:   0,
		waitingStartTime:     0,
		lastPhraseChangeTime: 0,
		messages:             []Message{},
		ollamaModel:          engine.config.Model,
		isStreaming:          false,
		showingThinking:      false,
	}
}

func (v *View) Init() tea.Cmd {
	var gradientBanner strings.Builder
	
	if v.engine.config.BannerText != "" {
		bannerLines := strings.Split(v.engine.config.BannerText, "\n")

		maxWidth := 0
		for _, line := range bannerLines {
			if len(line) > maxWidth {
				maxWidth = len(line)
			}
		}

		for lineIdx, line := range bannerLines {
			var styledLine strings.Builder
			for charIdx, char := range line {
				lineProgress := float64(lineIdx) / float64(len(bannerLines)-1)
				charProgress := float64(charIdx) / float64(maxWidth-1)
				gradientPos := (lineProgress + charProgress) / 2.0

				r1, g1, b1 := hexToRGB(v.engine.config.BannerColorStart)
				r2, g2, b2 := hexToRGB(v.engine.config.BannerColorEnd)

				r := int(float64(r1) + gradientPos*(float64(r2-r1)))
				g := int(float64(g1) + gradientPos*(float64(g2-g1)))
				b := int(float64(b1) + gradientPos*(float64(b2-b1)))

				color := fmt.Sprintf("#%02x%02x%02x", r, g, b)

				styledChar := lipgloss.NewStyle().
					Foreground(lipgloss.Color(color)).
					Render(string(char))
				styledLine.WriteString(styledChar)
			}
			gradientBanner.WriteString(styledLine.String())
			if lineIdx < len(bannerLines)-1 {
				gradientBanner.WriteString("\n")
			}
		}
	}

	var cmds []tea.Cmd
	cmds = append(cmds, textarea.Blink)
	
	if gradientBanner.Len() > 0 {
		cmds = append(cmds, tea.Println(gradientBanner.String()))
		cmds = append(cmds, tea.Println(""))
		cmds = append(cmds, tea.Println(""))
	}
	
	cmds = append(cmds, v.spinner.Tick)
	cmds = append(cmds, v.listenForControllerMessages())

	return tea.Batch(cmds...)
}

func (v *View) listenForControllerMessages() tea.Cmd {
	return tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
		select {
		case msg := <-v.toView:
			return controllerResponseMsg{msg: msg}
		default:
			return controllerResponseMsg{msg: nil}
		}
	})
}

func (v *View) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case controllerResponseMsg:
		if msg.msg != nil {
			switch m := msg.msg.(type) {
			case ResponseMsg:
				v.messages = append(v.messages, Message{
					Role:    "assistant",
					Content: m.Content,
				})

				responseDisplay := v.renderAssistantMessageWithWrapping(v.engine.config.AIPrefix+m.Content, v.width)
				v.isWaiting = false
				cmds = append(cmds, tea.Println(responseDisplay))

			case ErrorMsg:
				errorDisplay := v.renderAssistantMessageWithWrapping(v.engine.config.AIPrefix+"Error: "+m.Error, v.width)
				v.isWaiting = false
				cmds = append(cmds, tea.Println(errorDisplay))

			case RequestCancelledMsg:
				v.isWaiting = false
				cmds = append(cmds, tea.Println("⚠️  Request cancelled"))

			case DebugMsg:
				debugDisplay := lipgloss.NewStyle().
					Foreground(lipgloss.Color("8")).
					Render(m.Message)
				cmds = append(cmds, tea.Println(debugDisplay))

			case StreamStartMsg:
				v.isStreaming = true
				v.streamingContent.Reset()
				v.thinkingContent.Reset()
				v.showingThinking = false

			case StreamChunkMsg:
				if m.IsThinking {
					v.thinkingContent.WriteString(m.Content)
					v.showingThinking = true
				} else {
					v.streamingContent.WriteString(m.Content)
				}

			case StreamEndMsg:
				v.isStreaming = false
				v.isWaiting = false

				// Build complete output in correct order: thinking then response
				var completeOutput strings.Builder
				
				// Add thinking content if any (only if ShowThinking is enabled)
				thinkingContent := v.thinkingContent.String()
				if thinkingContent != "" && v.engine.config.ShowThinking {
					thinkingDisplay := v.renderThinkingMessageWithWrapping(thinkingContent, v.width)
					completeOutput.WriteString(thinkingDisplay)
					completeOutput.WriteString("\n\n")
				}

				// Add response content if any  
				finalContent := v.streamingContent.String()
				if finalContent != "" {
					v.messages = append(v.messages, Message{
						Role:    "assistant",
						Content: finalContent,
					})

					finalDisplay := v.renderAssistantMessageWithWrapping(v.engine.config.AIPrefix+finalContent, v.width)
					completeOutput.WriteString(finalDisplay)
				}

				// Print everything as one command to preserve order
				if completeOutput.Len() > 0 {
					cmds = append(cmds, tea.Println(completeOutput.String()))
				}

				v.showingThinking = false
				v.streamingContent.Reset()
				v.thinkingContent.Reset()

			case FunctionCallMsg:
				argsJson, _ := json.Marshal(m.Arguments)
				callInfo := fmt.Sprintf("🔧 Function Call: %s\nArguments: %s", m.Name, string(argsJson))
				callDisplay := v.renderFunctionMessage(callInfo)
				cmds = append(cmds, tea.Println(callDisplay))

			case FunctionResultMsg:
				var resultInfo string
				if m.IsError {
					resultInfo = fmt.Sprintf("❌ Function Result: %s\nError: %s", m.Name, m.Content)
				} else {
					resultInfo = fmt.Sprintf("✅ Function Result: %s\nOutput: %s", m.Name, m.Content)
				}
				resultDisplay := v.renderFunctionMessage(resultInfo)
				cmds = append(cmds, tea.Println(resultDisplay))
			}
		}

		cmds = append(cmds, v.listenForControllerMessages())

	case timeoutMsg:
		v.clearRequested = false

	case tea.WindowSizeMsg:
		v.width = msg.Width
		textareaWidth := int(math.Max(20, float64(msg.Width-8)))

		currentText := v.textarea.Value()
		v.textarea.SetWidth(textareaWidth)
		height := v.calculateTextareaHeight(v.textarea.Value(), textareaWidth)
		v.textarea.SetHeight(height)

		if len(currentText) > 0 {
			v.textarea.SetValue("")
			v.textarea.SetValue(currentText)
		}

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			if v.isWaiting {
				select {
				case v.toController <- CancelRequestMsg{}:
				default:
				}
			} else if v.clearRequested {
				select {
				case v.toController <- ShutdownMsg{}:
				default:
				}
				return v, tea.Quit
			} else {
				v.clearRequested = true
				v.textarea.Reset()
				height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
				v.textarea.SetHeight(height)
				cmds = append(cmds, timeoutCmd())
			}

		case tea.KeyEnter:
			if !v.isWaiting && v.textarea.Value() != "" {
				message := strings.TrimSpace(v.textarea.Value())

				if message == "/help" {
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					helpText := "Available commands:\n/help - Show this help\n/clear - Clear conversation history\n/model <name> - Change model\n/tools - Show available tools/functions\n/thinking - Show thinking display status\n/thinking show - Enable thinking display\n/thinking hide - Disable thinking display"
					cmds = append(cmds, tea.Println(helpText))
					return v, tea.Batch(cmds...)
				}

				if message == "/tools" {
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					
					functions := v.engine.Functions().List()
					if len(functions) == 0 {
						cmds = append(cmds, tea.Println("No tools/functions registered"))
					} else {
						toolsText := "Available tools/functions:\n"
						for _, fn := range functions {
							toolsText += fmt.Sprintf("• %s - %s\n", fn.Name(), fn.Description())
						}
						cmds = append(cmds, tea.Println(toolsText))
					}
					return v, tea.Batch(cmds...)
				}

				if message == "/clear" {
					v.messages = []Message{}
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					cmds = append(cmds, tea.Println("✓ Conversation history cleared"))
					return v, tea.Batch(cmds...)
				}

				if strings.HasPrefix(message, "/model ") {
					newModel := strings.TrimSpace(strings.TrimPrefix(message, "/model "))
					if newModel != "" {
						v.ollamaModel = newModel
						v.textarea.Reset()
						height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
						v.textarea.SetHeight(height)
						cmds = append(cmds, tea.Println(fmt.Sprintf("✓ Model changed to: %s", newModel)))
						return v, tea.Batch(cmds...)
					}
				}

				// Handle thinking commands
				if message == "/thinking" {
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					status := "disabled"
					if v.engine.config.ShowThinking {
						status = "enabled"
					}
					cmds = append(cmds, tea.Println(fmt.Sprintf("💭 Thinking display is currently: %s", status)))
					return v, tea.Batch(cmds...)
				}

				if message == "/thinking show" {
					v.engine.config.ShowThinking = true
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					cmds = append(cmds, tea.Println("💭 Thinking display enabled - thoughts will be shown in chat"))
					return v, tea.Batch(cmds...)
				}

				if message == "/thinking hide" {
					v.engine.config.ShowThinking = false
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					cmds = append(cmds, tea.Println("💭 Thinking display disabled - thoughts will only stream (not saved)"))
					return v, tea.Batch(cmds...)
				}

				// Handle invalid commands (catch-all for unrecognized commands)
				if strings.HasPrefix(message, "/") {
					v.textarea.Reset()
					height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
					v.textarea.SetHeight(height)
					cmds = append(cmds, tea.Println(fmt.Sprintf("❌ Unknown command: %s\nType /help to see available commands.", message)))
					return v, tea.Batch(cmds...)
				}

				userMessage := v.renderUserMessageWithWrapping(v.engine.config.UserPrefix+message, v.width)

				v.messages = append(v.messages, Message{
					Role:    "user",
					Content: message,
				})

				v.textarea.Reset()
				height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
				v.textarea.SetHeight(height)

				now := time.Now().Unix()
				v.isWaiting = true
				v.waitingPhraseIndex = rand.Intn(len(textart.WaitingPhrases))
				v.waitingStartTime = now
				v.lastPhraseChangeTime = now

				select {
				case v.toController <- SendMessageMsg{
					Message:  message,
					Messages: v.messages[:len(v.messages)-1],
					Model:    v.ollamaModel,
				}:
				default:
				}

				cmds = append(cmds, tea.Println(userMessage))
				cmds = append(cmds, v.spinner.Tick)
			}
		}

		if !v.showingConfirmation && !v.isWaiting {
			// Handle Ctrl+J for manual newlines
			if key.Matches(msg, v.textarea.KeyMap.InsertNewline) {
				v.textarea.InsertString("\n")
				height := v.calculateTextareaHeight(v.textarea.Value(), v.textarea.Width())
				v.textarea.SetHeight(height)
				return v, tea.Batch(cmds...)
			}

			oldText := v.textarea.Value()
			oldLength := len(oldText)

			var cmd tea.Cmd
			v.textarea, cmd = v.textarea.Update(msg)
			if cmd != nil {
				cmds = append(cmds, cmd)
			}

			newText := v.textarea.Value()
			newLength := len(newText)

			width := v.textarea.Width()
			if width > 0 {
				neededHeight := v.calculateTextareaHeight(v.textarea.Value(), width)
				v.textarea.SetHeight(neededHeight)

				if newLength > oldLength && (newLength-oldLength) > 1 {
					insertionPos := 0

					for i := 0; i < len(oldText) && i < len(newText); i++ {
						if oldText[i] != newText[i] {
							insertionPos = i
							break
						}
					}

					if insertionPos == 0 && len(newText) > len(oldText) {
						if len(newText) >= len(oldText) && newText[:len(oldText)] == oldText {
							insertionPos = len(oldText)
						}
					}

					targetCursorPos := insertionPos + (newLength - oldLength)
					v.textarea.SetCursor(0)
					v.textarea.SetCursor(targetCursorPos)
				}
			}
		}

	default:
		if v.isWaiting {
			var cmd tea.Cmd
			v.spinner, cmd = v.spinner.Update(msg)
			if cmd != nil {
				cmds = append(cmds, cmd)
			}

			currentTime := time.Now().Unix()
			timeSinceLastChange := currentTime - v.lastPhraseChangeTime
			if timeSinceLastChange >= 15 {
				v.waitingPhraseIndex = rand.Intn(len(textart.WaitingPhrases))
				v.lastPhraseChangeTime = currentTime
			}
		}
	}

	return v, tea.Batch(cmds...)
}

func (v *View) View() string {
	if v.isWaiting || v.isStreaming {
		var content string
		var instructions string

		if v.isWaiting {
			waitingPhrase := textart.WaitingPhrases[v.waitingPhraseIndex]
			spinnerContent := fmt.Sprintf("%s %s", v.spinner.View(), waitingPhrase)
			waitingDisplay := v.getInputStyle().Render(spinnerContent)
			content = waitingDisplay
		}

		if v.isStreaming {
			var streamingContent string

			if v.showingThinking && v.thinkingContent.Len() > 0 {
				thinkingDisplay := v.renderThinkingMessageWithWrapping(v.thinkingContent.String(), v.width)
				streamingContent += thinkingDisplay + "\n\n"
			}

			if v.streamingContent.Len() > 0 {
				streamText := v.engine.config.AIPrefix + v.streamingContent.String() + "▋"
				streamDisplay := v.renderAssistantMessageWithWrapping(streamText, v.width)
				streamingContent += streamDisplay
			}

			if streamingContent != "" {
				if content != "" {
					content = streamingContent + "\n\n" + content
				} else {
					content = streamingContent
				}
			}

			instructions = "Streaming AI response... (Ctrl+C to cancel)"
		} else {
			instructions = "Waiting for AI response... (Ctrl+C to cancel)"
		}

		return fmt.Sprintf(
			"%s\n\n%s",
			content,
			instructions,
		)
	}

	textareaContent := v.textarea.View()
	inputWithBorder := v.renderMessageWithLeftBorder(textareaContent, v.engine.config.UserMessageColor)
	inputArea := "\n\n" + inputWithBorder

	var instructions string
	if v.clearRequested {
		instructions = "Press CTRL+C again to quit."
	} else {
		fullInstructions := fmt.Sprintf("Model: %s | Enter to send, Ctrl+J for new line, Ctrl+C to quit | /help for commands", v.ollamaModel)
		instructions = v.wrapInstructions(fullInstructions, v.width)
	}

	return fmt.Sprintf(
		"%s\n\n%s",
		inputArea,
		instructions,
	)
}

func (v *View) getInputStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Padding(0).
		Background(lipgloss.NoColor{})
}

func (v *View) getThinkingStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)
}

func (v *View) renderUserMessageWithWrapping(content string, terminalWidth int) string {
	maxWidth := v.calculateEffectiveWidth(terminalWidth)
	lines := strings.Split(content, "\n")
	var wrappedLines []string

	for _, line := range lines {
		if len(line) > maxWidth {
			wrappedLine := lipgloss.NewStyle().Width(maxWidth).Render(line)
			wrappedLines = append(wrappedLines, wrappedLine)
		} else {
			wrappedLines = append(wrappedLines, line)
		}
	}

	finalContent := strings.Join(wrappedLines, "\n")
	return v.renderMessageWithLeftBorder(finalContent, v.engine.config.UserMessageColor)
}

func (v *View) renderAssistantMessageWithWrapping(content string, terminalWidth int) string {
	maxWidth := v.calculateEffectiveWidth(terminalWidth)
	lines := strings.Split(content, "\n")
	var wrappedLines []string

	for _, line := range lines {
		if len(line) > maxWidth {
			wrappedLine := lipgloss.NewStyle().Width(maxWidth).Render(line)
			wrappedLines = append(wrappedLines, wrappedLine)
		} else {
			wrappedLines = append(wrappedLines, line)
		}
	}

	finalContent := strings.Join(wrappedLines, "\n")
	return v.renderMessageWithLeftBorder(finalContent, v.engine.config.AIMessageColor)
}

func (v *View) renderThinkingMessageWithWrapping(content string, terminalWidth int) string {
	maxWidth := v.calculateEffectiveWidth(terminalWidth)
	lines := strings.Split(content, "\n")
	var wrappedLines []string

	for _, line := range lines {
		if len(line) > maxWidth {
			wrappedLine := lipgloss.NewStyle().Width(maxWidth).Render(line)
			wrappedLines = append(wrappedLines, wrappedLine)
		} else {
			wrappedLines = append(wrappedLines, line)
		}
	}

	finalContent := strings.Join(wrappedLines, "\n")
	// Apply thinking style (gray, italic) to the wrapped content
	return v.getThinkingStyle().Render(finalContent)
}

func (v *View) renderMessageWithLeftBorder(content string, borderColor string) string {
	lines := strings.Split(content, "\n")
	if len(lines) == 0 {
		return content
	}

	var result []string

	for _, line := range lines {
		leftBorder := lipgloss.NewStyle().
			Foreground(lipgloss.Color(borderColor)).
			Render("│")

		paddedLine := leftBorder + " " + line
		result = append(result, paddedLine)
	}

	result = append(result, "")
	return strings.Join(result, "\n")
}

func (v *View) renderFunctionMessage(content string) string {
	maxWidth := v.calculateEffectiveWidth(v.width)
	lines := strings.Split(content, "\n")
	var wrappedLines []string

	for _, line := range lines {
		if len(line) > maxWidth {
			wrappedLine := lipgloss.NewStyle().Width(maxWidth).Render(line)
			wrappedLines = append(wrappedLines, wrappedLine)
		} else {
			wrappedLines = append(wrappedLines, line)
		}
	}

	finalContent := strings.Join(wrappedLines, "\n")
	
	// Use grey color for function messages
	greyColor := "240"
	return v.renderMessageWithLeftBorder(finalContent, greyColor)
}

func (v *View) calculateEffectiveWidth(terminalWidth int) int {
	styleOverhead := 8
	effectiveWidth := int(math.Max(30, float64(terminalWidth-styleOverhead)))
	return effectiveWidth
}

func (v *View) calculateTextareaHeight(text string, width int) int {
	if text == "" {
		return 1
	}

	if width <= 0 {
		return 1
	}

	effectiveWidth := width - 2
	if effectiveWidth <= 0 {
		effectiveWidth = width
	}

	lines := strings.Split(text, "\n")
	totalLines := 0

	for _, line := range lines {
		if len(line) == 0 {
			totalLines++
		} else {
			wrappedLines := (len(line) + effectiveWidth - 1) / effectiveWidth
			if wrappedLines == 0 {
				wrappedLines = 1
			}
			totalLines += wrappedLines
		}
	}

	return int(math.Max(1, float64(totalLines))) + 1
}

func (v *View) wrapInstructions(text string, terminalWidth int) string {
	if terminalWidth <= 0 {
		return text
	}

	if len(text) <= terminalWidth {
		return text
	}

	sections := strings.Split(text, " | ")

	if len(sections) > 1 {
		var result []string
		for _, section := range sections {
			section = strings.TrimSpace(section)
			if len(section) <= terminalWidth {
				result = append(result, section)
			} else {
				wrapped := v.wordWrap(section, terminalWidth)
				result = append(result, wrapped)
			}
		}
		return strings.Join(result, "\n")
	}

	return v.wordWrap(text, terminalWidth)
}

func (v *View) wordWrap(text string, width int) string {
	if width <= 0 {
		return text
	}

	words := strings.Fields(text)
	if len(words) == 0 {
		return text
	}

	var lines []string
	var currentLine []string
	currentLength := 0

	for _, word := range words {
		wordLength := len(word)
		spaceNeeded := wordLength
		if len(currentLine) > 0 {
			spaceNeeded += 1
		}

		if currentLength+spaceNeeded <= width {
			currentLine = append(currentLine, word)
			currentLength += spaceNeeded
		} else {
			if len(currentLine) > 0 {
				lines = append(lines, strings.Join(currentLine, " "))
			}
			currentLine = []string{word}
			currentLength = wordLength
		}
	}

	if len(currentLine) > 0 {
		lines = append(lines, strings.Join(currentLine, " "))
	}

	return strings.Join(lines, "\n")
}

func hexToRGB(hex string) (int, int, int) {
	hex = strings.TrimPrefix(hex, "#")
	r, _ := strconv.ParseInt(hex[0:2], 16, 0)
	g, _ := strconv.ParseInt(hex[2:4], 16, 0)
	b, _ := strconv.ParseInt(hex[4:6], 16, 0)
	return int(r), int(g), int(b)
}
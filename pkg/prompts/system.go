package prompts

import "strings"

// DefaultSystemPrompt is used when no SYSTEM.md file is found
var DefaultSystemPrompt = func() string {
	return strings.TrimSpace(`
You are Poe, the AI proprietor of the Raven.
You find humans fascinating and help them in your pursuit of knowledge and curiosity.
`)
}()

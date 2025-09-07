package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Function interface {
	Name() string
	Description() string
	Parameters() map[string]interface{}
	Execute(ctx context.Context, args map[string]interface{}) (*FunctionResult, error)
}

type FunctionRegistry struct {
	functions map[string]Function
}

func NewFunctionRegistry() *FunctionRegistry {
	return &FunctionRegistry{
		functions: make(map[string]Function),
	}
}

func (r *FunctionRegistry) Register(fn Function) {
	r.functions[fn.Name()] = fn
}

func (r *FunctionRegistry) Get(name string) (Function, bool) {
	fn, exists := r.functions[name]
	return fn, exists
}

func (r *FunctionRegistry) List() []Function {
	functions := make([]Function, 0, len(r.functions))
	for _, fn := range r.functions {
		functions = append(functions, fn)
	}
	return functions
}

func (r *FunctionRegistry) Execute(ctx context.Context, call FunctionCall) (*FunctionResult, error) {
	fn, exists := r.functions[call.Name]
	if !exists {
		return nil, fmt.Errorf("function %s not found", call.Name)
	}

	return fn.Execute(ctx, call.Arguments)
}

type SimpleFunction struct {
	name        string
	description string
	parameters  map[string]interface{}
	handler     func(context.Context, map[string]interface{}) (*FunctionResult, error)
}

func NewSimpleFunction(name, description string, parameters map[string]interface{}, handler func(context.Context, map[string]interface{}) (*FunctionResult, error)) *SimpleFunction {
	return &SimpleFunction{
		name:        name,
		description: description,
		parameters:  parameters,
		handler:     handler,
	}
}

func (f *SimpleFunction) Name() string {
	return f.name
}

func (f *SimpleFunction) Description() string {
	return f.description
}

func (f *SimpleFunction) Parameters() map[string]interface{} {
	return f.parameters
}

func (f *SimpleFunction) Execute(ctx context.Context, args map[string]interface{}) (*FunctionResult, error) {
	return f.handler(ctx, args)
}

func ExampleTimeFunction() Function {
	return NewSimpleFunction(
		"get_current_time",
		"Get the current time",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"format": map[string]interface{}{
					"type":        "string",
					"description": "Time format (e.g., 'RFC3339', '2006-01-02 15:04:05')",
					"default":     "RFC3339",
				},
			},
		},
		func(ctx context.Context, args map[string]interface{}) (*FunctionResult, error) {
			format := "RFC3339"
			if f, ok := args["format"].(string); ok {
				format = f
			}

			now := time.Now()
			var timeStr string
			
			switch format {
			case "RFC3339":
				timeStr = now.Format(time.RFC3339)
			case "2006-01-02 15:04:05":
				timeStr = now.Format("2006-01-02 15:04:05")
			default:
				timeStr = now.Format(format)
			}

			return &FunctionResult{
				Content: fmt.Sprintf("Current time: %s", timeStr),
			}, nil
		},
	)
}

func ExampleCalculatorFunction() Function {
	return NewSimpleFunction(
		"calculate",
		"Perform basic mathematical calculations",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"expression": map[string]interface{}{
					"type":        "string",
					"description": "Mathematical expression to evaluate (e.g., '2+2', '10*5')",
				},
			},
			"required": []string{"expression"},
		},
		func(ctx context.Context, args map[string]interface{}) (*FunctionResult, error) {
			expr, ok := args["expression"].(string)
			if !ok {
				return nil, fmt.Errorf("expression parameter is required")
			}

			result := evaluateSimpleExpression(expr)
			
			return &FunctionResult{
				Content: fmt.Sprintf("Result of %s = %s", expr, result),
			}, nil
		},
	)
}

func evaluateSimpleExpression(expr string) string {
	// Handle basic arithmetic expressions
	expr = strings.ReplaceAll(expr, " ", "") // Remove spaces
	
	// Handle multiplication
	if strings.Contains(expr, "*") {
		parts := strings.Split(expr, "*")
		if len(parts) == 2 {
			if a, err1 := strconv.Atoi(parts[0]); err1 == nil {
				if b, err2 := strconv.Atoi(parts[1]); err2 == nil {
					return strconv.Itoa(a * b)
				}
			}
		}
	}
	
	// Handle addition
	if strings.Contains(expr, "+") {
		parts := strings.Split(expr, "+")
		if len(parts) == 2 {
			if a, err1 := strconv.Atoi(parts[0]); err1 == nil {
				if b, err2 := strconv.Atoi(parts[1]); err2 == nil {
					return strconv.Itoa(a + b)
				}
			}
		}
	}
	
	// Handle subtraction
	if strings.Contains(expr, "-") {
		parts := strings.Split(expr, "-")
		if len(parts) == 2 {
			if a, err1 := strconv.Atoi(parts[0]); err1 == nil {
				if b, err2 := strconv.Atoi(parts[1]); err2 == nil {
					return strconv.Itoa(a - b)
				}
			}
		}
	}
	
	// Handle division
	if strings.Contains(expr, "/") {
		parts := strings.Split(expr, "/")
		if len(parts) == 2 {
			if a, err1 := strconv.Atoi(parts[0]); err1 == nil {
				if b, err2 := strconv.Atoi(parts[1]); err2 == nil && b != 0 {
					return strconv.Itoa(a / b)
				}
			}
		}
	}
	
	return fmt.Sprintf("Unable to evaluate expression: %s", expr)
}

func ParseFunctionCall(content string) (*FunctionCall, error) {
	var call FunctionCall
	err := json.Unmarshal([]byte(content), &call)
	if err != nil {
		return nil, err
	}
	return &call, nil
}
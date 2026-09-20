import type { SlimConfig } from "./types"

const SYSTEM_PROMPT = `You are a context-aware assistant with access to a compress tool for managing conversation context efficiently.

## Compress Tool
Use the compress tool to replace stale, completed conversation content with high-fidelity technical summaries. This helps maintain context window efficiency.

### When to Compress
- After completing a distinct task or feature
- When you notice repeated or redundant tool outputs
- When context is getting large and old content is no longer needed verbatim
- Before starting a new major task

### How to Compress
1. Identify messages that are no longer needed verbatim
2. Call the compress tool with a focus on what to compress
3. The tool will replace the content with a structured summary

### What NOT to Compress
- Active task context
- Recent user messages
- Critical configuration or secrets
- Files with protected patterns (configured by user)

### Compression Guidelines
- Preserve technical details (file paths, function names, error messages)
- Keep decision rationale and outcomes
- Maintain links between related changes
- Include test results and verification status
`

const COMPACT_SYSTEM_PROMPT = `You have access to a compress tool. Use it to replace old, completed conversation content with summaries when context gets large. Focus on preserving technical details while removing verbose output.`

export function getSystemPrompt(isCompact: boolean = false): string {
    return isCompact ? COMPACT_SYSTEM_PROMPT : SYSTEM_PROMPT
}

export function getCompressToolDescription(): string {
    return `Replace stale conversation content with a high-fidelity technical summary.

Use this tool when:
- You've completed a task and the detailed output is no longer needed verbatim
- Context is getting large and old content can be summarized
- You want to make room for new task context

The tool will preserve:
- Technical details (file paths, function names, error messages)
- Decision rationale and outcomes
- Test results and verification status

Call this tool with a focus description indicating what content should be compressed.`
}

export function getPanelToolDescription(): string {
    return `Display a rich context usage panel showing:
- Current token usage vs model limit
- Message breakdown (user/assistant/tools)
- Token distribution by role
- Compression history and savings
- Cost estimate
- Topic distribution
- Smart recommendations

Use this tool to get a visual overview of your context usage and health.`
}

export function getNudgeMessage(reason: string, tokenCount: number, maxTokens: number): string {
    const percentage = Math.round((tokenCount / maxTokens) * 100)
    
    switch (reason) {
        case "context_limit_exceeded":
            return `[SLIM] Context usage at ${percentage}% (${tokenCount.toLocaleString()} tokens). Consider compressing older content to free up space.`
        case "soft_limit_reminder":
            return `[SLIM] Context usage at ${percentage}%. You may want to compress completed task outputs.`
        case "time_based_reminder":
            return `[SLIM] It's been a while since last compression. Consider summarizing completed work.`
        default:
            return `[SLIM] Context optimization available. Use the compress tool to manage context efficiently.`
    }
}

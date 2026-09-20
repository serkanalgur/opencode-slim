import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { loadConfig, createDefaultConfig, resolveTokenLimit } from "./lib/config"
import {
    loadSessionState,
    saveSessionState,
    addCompressionRecord,
    trackToolCall,
    getDuplicateToolCalls,
    getErroredToolCalls,
} from "./lib/state"
import { countTokens, shouldCompress, getMessageText, getToolResultContent } from "./lib/compress"
import { pruneMessages } from "./lib/strategies"
import { getSystemPrompt, getCompressToolDescription, getNudgeMessage } from "./lib/prompts"
import type { SlimConfig, SessionState, MessageWithParts } from "./lib/types"

// ─── State Management ───────────────────────────────────────────────────────

const sessionStates = new Map<string, SessionState>()
const sessionConfigs = new Map<string, SlimConfig>()

function getState(sessionId: string, config: SlimConfig): SessionState {
    if (!sessionStates.has(sessionId)) {
        const state = loadSessionState(sessionId, config.persistence.directory)
        sessionStates.set(sessionId, state)
    }
    return sessionStates.get(sessionId)!
}

function getConfig(sessionId: string): SlimConfig {
    return sessionConfigs.get(sessionId) || loadConfig()
}

// ─── Plugin Entry ───────────────────────────────────────────────────────────

const server: Plugin = async (ctx) => {
    // Load and create default config if needed
    createDefaultConfig()
    const globalConfig = loadConfig()

    // Expose compress tool
    const compressTool = tool({
        description: getCompressToolDescription(),
        args: {
            focus: z.string().describe("Description of what content should be compressed"),
        },
        async execute(args, context) {
            const config = getConfig(context.sessionID)
            const state = getState(context.sessionID, config)

            // Get current messages from the client
            try {
                const response = await ctx.client.session.messages({
                    path: { id: context.sessionID },
                })

                if (!response.data || response.error) {
                    return "Failed to fetch messages"
                }

                const messageList = response.data
                const messageWithParts: MessageWithParts[] = messageList.map((m) => ({
                    info: m.info,
                    parts: m.parts,
                }))

                // Count tokens before compression
                let inputTokens = 0
                for (const msg of messageWithParts) {
                    const text = getMessageText(msg) + getToolResultContent(msg)
                    inputTokens += await countTokens(text)
                }

                // Select what to compress based on focus
                const targets = messageWithParts.length > 10
                    ? [{ start: 0, end: messageWithParts.length - 5, reason: "user_requested" as const, estimatedTokens: inputTokens }]
                    : []

                if (targets.length === 0) {
                    return "Nothing to compress - context is already efficient"
                }

                // Build summary
                const compressedMessages = messageWithParts.slice(targets[0].start, targets[0].end)
                const summary = buildCompressionSummary(compressedMessages, args.focus)

                // Count output tokens
                const outputTokens = await countTokens(summary)
                const ratio = inputTokens > 0 ? 1 - outputTokens / inputTokens : 0

                // Record compression
                addCompressionRecord(
                    state,
                    {
                        timestamp: Date.now(),
                        inputTokens,
                        outputTokens,
                        ratio,
                        messageCount: compressedMessages.length,
                        success: true,
                    },
                    config.adaptive.learningRate,
                )

                saveSessionState(state, config.persistence.directory)

                return {
                    title: `Compressed ${compressedMessages.length} messages`,
                    output: summary,
                    metadata: {
                        inputTokens,
                        outputTokens,
                        ratio: Math.round(ratio * 100) + "%",
                        focus: args.focus,
                    },
                }
            } catch (error) {
                return `Error compressing: ${error instanceof Error ? error.message : "Unknown error"}`
            }
        },
    })

    // Return hooks
    return {
        config: async (opencodeConfig) => {
            // Add compress tool permission
            if (!opencodeConfig.permission) {
                opencodeConfig.permission = {} as any
            }
            ;(opencodeConfig.permission as any).compress = globalConfig.compress.permission
        },

        tool: {
            compress: compressTool,
        },

        "experimental.chat.system.transform": async (input, output) => {
            const config = getConfig(input.sessionID || "")
            if (!config.enabled || !config.compress.enabled) {
                return
            }

            const state = getState(input.sessionID || "", config)
            
            // Track model context limit
            if (input.model?.limit?.context) {
                state.modelContextLimit = input.model.limit.context
            }

            // Add system prompt
            const systemPrompt = getSystemPrompt()
            if (output.system.length > 0) {
                output.system[output.system.length - 1] += "\n\n" + systemPrompt
            } else {
                output.system.push(systemPrompt)
            }
        },

        "experimental.chat.messages.transform": async (input, output) => {
            const config = getConfig("")
            if (!config.enabled) {
                return
            }

            // Get session ID from first message if available
            const sessionId = output.messages[0]?.info.sessionID || ""
            const state = getState(sessionId, config)

            // Apply pruning strategies
            const prunedMessages = pruneMessages(
                output.messages as any,
                config,
                output.messages.length,
            )

            // Replace messages
            output.messages.length = 0
            output.messages.push(...(prunedMessages as any))

            // Check if compression nudge is needed
            let totalTokens = 0
            for (const msg of output.messages) {
                const text = getMessageText(msg as any) + getToolResultContent(msg as any)
                totalTokens += await countTokens(text)
            }

            state.currentTokenCount = totalTokens

            const maxTokens = resolveTokenLimit(config.compress.maxContextLimit, state.modelContextLimit)
            const minTokens = resolveTokenLimit(config.compress.minContextLimit, state.modelContextLimit)

            const shouldComp = shouldCompress(
                totalTokens,
                maxTokens,
                minTokens,
                state.lastCompressionTime,
                config.compress.nudgeFrequency,
                output.messages.length,
            )

            if (shouldComp.compress && !state.manualMode) {
                // Inject nudge as a system message
                const nudgeMessage = getNudgeMessage(shouldComp.reason, totalTokens, maxTokens)
                output.messages.push({
                    info: {
                        role: "assistant",
                        sessionID: sessionId,
                    } as any,
                    parts: [{ type: "text", text: nudgeMessage }],
                } as any)
            }

            saveSessionState(state, config.persistence.directory)
        },

        event: async (input) => {
            const event = input.event
            if (event.type === "session.created") {
                const sessionId = (event as any).properties?.sessionID || ""
                const config = getConfig(sessionId)
                sessionConfigs.set(sessionId, config)
                getState(sessionId, config)
            }
        },

        dispose: async () => {
            // Save all states on dispose
            for (const [sessionId, state] of sessionStates.entries()) {
                const config = getConfig(sessionId)
                saveSessionState(state, config.persistence.directory)
            }
        },
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCompressionSummary(
    messages: MessageWithParts[],
    focus: string,
): string {
    const lines: string[] = []
    lines.push(`## Compression Summary`)
    lines.push(`Focus: ${focus}`)
    lines.push(`Messages compressed: ${messages.length}`)
    lines.push("")

    // Extract key information
    const toolCalls: string[] = []
    const errors: string[] = []
    const decisions: string[] = []

    for (const msg of messages) {
        for (const part of msg.parts) {
            if (part.type === "tool") {
                const toolPart = part as any
                toolCalls.push(`${toolPart.tool}: ${JSON.stringify(toolPart.state?.input || {}).slice(0, 100)}`)
                if (toolPart.state?.status === "error") {
                    errors.push(toolPart.state.error?.slice(0, 200) || "Unknown error")
                }
            }
            if (part.type === "text") {
                const text = (part as any).text
                if (text.includes("decided") || text.includes("chose") || text.includes("implemented")) {
                    decisions.push(text.slice(0, 200))
                }
            }
        }
    }

    if (toolCalls.length > 0) {
        lines.push("### Tool Calls")
        toolCalls.slice(0, 10).forEach((tc) => lines.push(`- ${tc}`))
        lines.push("")
    }

    if (errors.length > 0) {
        lines.push("### Errors Encountered")
        errors.slice(0, 5).forEach((e) => lines.push(`- ${e}`))
        lines.push("")
    }

    if (decisions.length > 0) {
        lines.push("### Key Decisions")
        decisions.slice(0, 5).forEach((d) => lines.push(`- ${d}`))
        lines.push("")
    }

    return lines.join("\n")
}

export default { id: "opencode-slim", server }

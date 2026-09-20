import type { MessageWithParts, SlimConfig } from "./types"
import { getToolName, getToolArgs, getToolResultContent, getMessageText, isToolPart } from "./compress"

// ─── Deduplication ──────────────────────────────────────────────────────────

function hashArgs(args: unknown): string {
    if (!args || typeof args !== "object") return String(args)
    return JSON.stringify(args, Object.keys(args as object).sort())
}

export function findDuplicateToolCalls(
    messages: MessageWithParts[],
    protectedTools: string[],
): number[] {
    const seen = new Map<string, number[]>()
    const indicesToRemove: number[] = []

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const toolName = getToolName(msg)
        
        if (!toolName || protectedTools.includes(toolName)) {
            continue
        }

        const args = getToolArgs(msg)
        const argsHash = hashArgs(args)
        const key = `${toolName}:${argsHash}`

        if (!seen.has(key)) {
            seen.set(key, [])
        }
        seen.get(key)!.push(i)
    }

    // Keep only the last occurrence of each duplicate
    for (const indices of seen.values()) {
        if (indices.length > 1) {
            indicesToRemove.push(...indices.slice(0, -1))
        }
    }

    return indicesToRemove.sort((a, b) => b - a)
}

// ─── Error Purging ──────────────────────────────────────────────────────────

export function findErroredToolCalls(
    messages: MessageWithParts[],
    currentTurn: number,
    turnsThreshold: number,
    protectedTools: string[],
): number[] {
    const indicesToRemove: number[] = []

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const toolName = getToolName(msg)
        
        if (!toolName || protectedTools.includes(toolName)) {
            continue
        }

        // Check if this is a tool part with an error
        for (const part of msg.parts) {
            if (isToolPart(part) && part.state.status === "error") {
                const messagesAfter = messages.length - i - 1
                if (messagesAfter >= turnsThreshold) {
                    indicesToRemove.push(i)
                }
                break
            }
        }
    }

    return indicesToRemove.sort((a, b) => b - a)
}

// ─── Message Pruning ────────────────────────────────────────────────────────

export function pruneMessages(
    messages: MessageWithParts[],
    config: SlimConfig,
    currentTurn: number,
): MessageWithParts[] {
    const result = [...messages]

    // Apply deduplication
    if (config.strategies.deduplication.enabled) {
        const duplicates = findDuplicateToolCalls(
            result,
            config.strategies.deduplication.protectedTools,
        )
        for (const idx of duplicates) {
            result.splice(idx, 1)
        }
    }

    // Apply error purging
    if (config.strategies.purgeErrors.enabled) {
        const errored = findErroredToolCalls(
            result,
            currentTurn,
            config.strategies.purgeErrors.turns,
            config.strategies.purgeErrors.protectedTools,
        )
        for (const idx of errored) {
            result.splice(idx, 1)
        }
    }

    return result
}

// ─── Compression Target Selection ───────────────────────────────────────────

export interface CompressionTarget {
    start: number
    end: number
    reason: string
    estimatedTokens: number
}

export function selectCompressionTargets(
    messages: MessageWithParts[],
    minTokens: number,
    protectedTools: string[],
): CompressionTarget[] {
    const targets: CompressionTarget[] = []
    let consecutiveToolCalls = 0
    let startIdx = -1
    let tokenAccumulator = 0

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const toolName = getToolName(msg)
        const text = getMessageText(msg) + getToolResultContent(msg)
        const estimatedTokens = Math.ceil(text.length / 4)

        if (toolName && !protectedTools.includes(toolName)) {
            if (startIdx === -1) {
                startIdx = i
            }
            consecutiveToolCalls++
            tokenAccumulator += estimatedTokens
        } else {
            if (consecutiveToolCalls >= 3 && tokenAccumulator >= minTokens) {
                targets.push({
                    start: startIdx,
                    end: i,
                    reason: "consecutive_tool_calls",
                    estimatedTokens: tokenAccumulator,
                })
            }
            consecutiveToolCalls = 0
            startIdx = -1
            tokenAccumulator = 0
        }
    }

    // Handle remaining
    if (consecutiveToolCalls >= 3 && tokenAccumulator >= minTokens) {
        targets.push({
            start: startIdx,
            end: messages.length,
            reason: "consecutive_tool_calls",
            estimatedTokens: tokenAccumulator,
        })
    }

    return targets
}

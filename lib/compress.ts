import type { Part, ToolPart, ToolState } from "@opencode-ai/sdk"
import type { MessageWithParts, CostProfile } from "./types"

// ─── Token Counting ─────────────────────────────────────────────────────────

let tokenizer: any = null

async function getTokenizer() {
    if (!tokenizer) {
        try {
            const mod = await import("@anthropic-ai/tokenizer")
            tokenizer = mod
        } catch {
            tokenizer = { encode: (text: string) => ({ length: Math.ceil(text.length / 4) }) }
        }
    }
    return tokenizer
}

export async function countTokens(text: string): Promise<number> {
    const tok = await getTokenizer()
    try {
        return tok.encode(text).length
    } catch {
        return Math.ceil(text.length / 4)
    }
}

// ─── Message Analysis ───────────────────────────────────────────────────────

export function isToolPart(part: Part): part is ToolPart {
    return part.type === "tool"
}

export function getToolParts(message: MessageWithParts): ToolPart[] {
    return message.parts.filter(isToolPart)
}

export function getToolName(message: MessageWithParts): string | null {
    for (const part of message.parts) {
        if (isToolPart(part)) {
            return part.tool
        }
    }
    return null
}

export function getToolArgs(message: MessageWithParts): unknown | null {
    for (const part of message.parts) {
        if (isToolPart(part)) {
            return part.state.status === "pending" || part.state.status === "running"
                ? part.state.input
                : part.state.status === "completed"
                  ? part.state.input
                  : part.state.status === "error"
                    ? part.state.input
                    : null
        }
    }
    return null
}

export function getToolResultContent(message: MessageWithParts): string {
    for (const part of message.parts) {
        if (isToolPart(part) && part.state.status === "completed") {
            return part.state.output
        }
    }
    return ""
}

export function getToolError(message: MessageWithParts): string | null {
    for (const part of message.parts) {
        if (isToolPart(part) && part.state.status === "error") {
            return part.state.error
        }
    }
    return null
}

export function getMessageText(message: MessageWithParts): string {
    const texts: string[] = []
    for (const part of message.parts) {
        if (part.type === "text") {
            texts.push(part.text)
        }
    }
    return texts.join("\n")
}

// ─── Semantic Grouping ──────────────────────────────────────────────────────

interface SemanticGroup {
    topic: string
    messages: MessageWithParts[]
    score: number
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
    "authentication": ["auth", "login", "password", "token", "session", "jwt", "oauth"],
    "database": ["database", "db", "sql", "query", "migration", "schema", "table"],
    "api": ["api", "endpoint", "route", "request", "response", "http", "rest", "graphql"],
    "testing": ["test", "spec", "assert", "expect", "describe", "it(", "jest", "vitest"],
    "configuration": ["config", "settings", "env", "environment", "variable"],
    "deployment": ["deploy", "docker", "kubernetes", "ci", "cd", "pipeline"],
    "ui": ["ui", "component", "render", "display", "style", "css", "layout"],
    "error": ["error", "exception", "catch", "throw", "debug", "fix", "bug"],
    "performance": ["performance", "optimize", "cache", "speed", "slow", "fast"],
    "security": ["security", "encrypt", "decrypt", "hash", "sanitize", "xss", "csrf"],
}

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    return [...new Set(words)]
}

function calculateTopicScore(keywords: string[], topic: string): number {
    const topicWords = TOPIC_KEYWORDS[topic] || []
    let score = 0
    for (const word of keywords) {
        if (topicWords.includes(word)) {
            score++
        }
    }
    return score / Math.max(topicWords.length, 1)
}

export function groupMessagesByTopic(messages: MessageWithParts[]): SemanticGroup[] {
    const groups: Map<string, MessageWithParts[]> = new Map()

    for (const msg of messages) {
        const text = getMessageText(msg) + " " + getToolResultContent(msg)
        const keywords = extractKeywords(text)

        let bestTopic = "general"
        let bestScore = 0

        for (const topic of Object.keys(TOPIC_KEYWORDS)) {
            const score = calculateTopicScore(keywords, topic)
            if (score > bestScore) {
                bestScore = score
                bestTopic = topic
            }
        }

        if (!groups.has(bestTopic)) {
            groups.set(bestTopic, [])
        }
        groups.get(bestTopic)!.push(msg)
    }

    return Array.from(groups.entries()).map(([topic, msgs]) => ({
        topic,
        messages: msgs,
        score: msgs.length / messages.length,
    }))
}

// ─── Compression Helpers ────────────────────────────────────────────────────

export function calculateCompressionRatio(inputTokens: number, outputTokens: number): number {
    if (inputTokens === 0) return 0
    return 1 - outputTokens / inputTokens
}

export function shouldCompress(
    currentTokens: number,
    maxTokens: number,
    minTokens: number,
    lastCompressionTime: number,
    nudgeFrequency: number,
    messageCount: number,
): { compress: boolean; reason: string } {
    if (currentTokens > maxTokens) {
        return { compress: true, reason: "context_limit_exceeded" }
    }

    if (currentTokens > minTokens && messageCount % nudgeFrequency === 0) {
        return { compress: true, reason: "soft_limit_reminder" }
    }

    const timeSinceLastCompression = Date.now() - lastCompressionTime
    if (timeSinceLastCompression > 30 * 60 * 1000 && currentTokens > minTokens * 0.8) {
        return { compress: true, reason: "time_based_reminder" }
    }

    return { compress: false, reason: "none" }
}

// ─── Cost Calculation ───────────────────────────────────────────────────────

export function calculateCost(
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    profile: CostProfile,
): number {
    const inputCost = (inputTokens / 1000) * profile.inputPricePer1k
    const outputCost = (outputTokens / 1000) * profile.outputPricePer1k
    const cacheCost = (cacheReadTokens / 1000) * profile.cacheReadPricePer1k
    return inputCost + outputCost + cacheCost
}

export function estimateSavings(
    messages: MessageWithParts[],
    profile: CostProfile,
): { tokensSaved: number; costSaved: number } {
    let totalTokens = 0
    for (const msg of messages) {
        const text = getMessageText(msg) + getToolResultContent(msg)
        totalTokens += Math.ceil(text.length / 4)
    }

    const costSaved = calculateCost(totalTokens, 0, 0, profile)
    return { tokensSaved: totalTokens, costSaved }
}

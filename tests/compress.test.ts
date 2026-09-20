import { describe, it } from "node:test"
import assert from "node:assert"
import { pruneMessages, findDuplicateToolCalls, findErroredToolCalls } from "../lib/strategies"
import { shouldCompress, calculateCompressionRatio } from "../lib/compress"
import type { MessageWithParts, SlimConfig } from "../lib/types"
import type { Part, ToolPart, ToolState } from "@opencode-ai/sdk"

const defaultConfig: SlimConfig = {
    enabled: true,
    debug: false,
    compress: {
        enabled: true,
        permission: "allow",
        maxContextLimit: "80%",
        minContextLimit: "40%",
        nudgeFrequency: 5,
        protectUserMessages: false,
        protectedTools: ["task", "skill"],
    },
    strategies: {
        deduplication: {
            enabled: true,
            protectedTools: [],
        },
        purgeErrors: {
            enabled: true,
            turns: 4,
            protectedTools: [],
        },
    },
    adaptive: {
        enabled: true,
        learningRate: 0.1,
        minCompressionRatio: 0.3,
    },
    costAware: {
        enabled: true,
        cacheBoostFactor: 0.5,
    },
    persistence: {
        enabled: false,
        directory: "/tmp/slim-test",
    },
}

function createToolPart(toolName: string, args: unknown, state?: Partial<ToolState>): ToolPart {
    return {
        id: `part-${Date.now()}-${Math.random()}`,
        sessionID: "test",
        messageID: "test",
        type: "tool",
        callID: `call-${Date.now()}-${Math.random()}`,
        tool: toolName,
        state: state || { status: "completed", input: args, output: "OK", title: toolName, metadata: {}, time: { start: 0, end: 1 } },
    }
}

function createToolMessage(toolName: string, args: unknown, result?: string, error?: string): MessageWithParts {
    const state: ToolState = error
        ? { status: "error", input: args, error, time: { start: 0, end: 1 } }
        : { status: "completed", input: args, output: result || "OK", title: toolName, metadata: {}, time: { start: 0, end: 1 } }

    return {
        info: { role: "assistant", sessionID: "test" } as any,
        parts: [createToolPart(toolName, args, state)],
    }
}

function createTextMessage(text: string): MessageWithParts {
    return {
        info: { role: "user", sessionID: "test" } as any,
        parts: [{ type: "text", text } as Part],
    }
}

describe("Deduplication", () => {
    it("should find duplicate tool calls", () => {
        const messages = [
            createToolMessage("read", { path: "/test.ts" }),
            createToolMessage("write", { path: "/test.ts", content: "hello" }),
            createToolMessage("read", { path: "/test.ts" }), // duplicate
        ]

        const duplicates = findDuplicateToolCalls(messages, [])
        assert.deepStrictEqual(duplicates, [0]) // First occurrence marked for removal
    })

    it("should respect protected tools", () => {
        const messages = [
            createToolMessage("task", { prompt: "test" }),
            createToolMessage("task", { prompt: "test" }), // protected, not marked
        ]

        const duplicates = findDuplicateToolCalls(messages, ["task"])
        assert.deepStrictEqual(duplicates, [])
    })
})

describe("Error Purging", () => {
    it("should find errored tool calls after threshold", () => {
        const messages = [
            createToolMessage("read", { path: "/test.ts" }, undefined, "File not found"),
            createTextMessage("some text"),
            createTextMessage("more text"),
            createTextMessage("even more"),
            createTextMessage("and more"),
            createTextMessage("and more"),
            createTextMessage("and more"),
            createTextMessage("and more"),
        ]

        const errored = findErroredToolCalls(messages, 8, 4, [])
        assert.deepStrictEqual(errored, [0])
    })
})

describe("Compression Decision", () => {
    it("should compress when context limit exceeded", () => {
        const result = shouldCompress(150000, 100000, 50000, Date.now(), 5, 10)
        assert.strictEqual(result.compress, true)
        assert.strictEqual(result.reason, "context_limit_exceeded")
    })

    it("should compress on soft limit reminder", () => {
        const result = shouldCompress(60000, 100000, 50000, Date.now(), 5, 10)
        assert.strictEqual(result.compress, true)
        assert.strictEqual(result.reason, "soft_limit_reminder")
    })

    it("should not compress when below thresholds", () => {
        const result = shouldCompress(30000, 100000, 50000, Date.now(), 5, 10)
        assert.strictEqual(result.compress, false)
    })
})

describe("Compression Ratio", () => {
    it("should calculate ratio correctly", () => {
        const ratio = calculateCompressionRatio(1000, 200)
        assert.strictEqual(ratio, 0.8) // 80% reduction
    })

    it("should handle zero input", () => {
        const ratio = calculateCompressionRatio(0, 0)
        assert.strictEqual(ratio, 0)
    })
})

describe("Message Pruning", () => {
    it("should apply deduplication", () => {
        const messages = [
            createToolMessage("read", { path: "/test.ts" }),
            createToolMessage("write", { path: "/test.ts", content: "hello" }),
            createToolMessage("read", { path: "/test.ts" }), // duplicate
        ]

        const pruned = pruneMessages(messages, defaultConfig, 3)
        assert.strictEqual(pruned.length, 2)
    })
})

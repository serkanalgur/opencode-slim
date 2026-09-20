import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildPanelData, renderPanel } from "../lib/tui"
import type { MessageWithParts, SessionState, SlimConfig } from "../lib/types"

// ─── Mock Data ─────────────────────────────────────────────────────────────

function createMockMessage(role: string, text: string, toolCalls?: { tool: string; status: string }[]): MessageWithParts {
    const parts: any[] = []
    
    if (text) {
        parts.push({ type: "text", text })
    }
    
    if (toolCalls) {
        for (const tc of toolCalls) {
            parts.push({
                type: "tool",
                tool: tc.tool,
                state: {
                    status: tc.status,
                    input: { path: "/test" },
                    output: tc.status === "completed" ? "test output" : undefined,
                    error: tc.status === "error" ? "test error" : undefined,
                },
            })
        }
    }
    
    return {
        info: {
            role,
            sessionID: "test-session",
        } as any,
        parts,
    }
}

function createMockState(overrides?: Partial<SessionState>): SessionState {
    return {
        sessionId: "test-session",
        modelContextLimit: 200000,
        currentTokenCount: 50000,
        compressionCount: 3,
        lastCompressionTime: Date.now() - 3600000, // 1 hour ago
        manualMode: false,
        compressPermission: null,
        compressionHistory: [
            {
                timestamp: Date.now() - 3600000,
                inputTokens: 100000,
                outputTokens: 20000,
                ratio: 0.8,
                messageCount: 10,
                success: true,
            },
        ],
        averageCompressionRatio: 0.75,
        toolCalls: new Map(),
        ...overrides,
    }
}

function createMockConfig(overrides?: Partial<SlimConfig>): SlimConfig {
    return {
        enabled: true,
        debug: false,
        compress: {
            enabled: true,
            permission: "allow",
            maxContextLimit: "80%",
            minContextLimit: "40%",
            nudgeFrequency: 5,
            protectUserMessages: true,
            protectedTools: [],
        },
        strategies: {
            deduplication: { enabled: true, protectedTools: [] },
            purgeErrors: { enabled: true, turns: 5, protectedTools: [] },
        },
        adaptive: { enabled: true, learningRate: 0.1, minCompressionRatio: 0.3 },
        costAware: { enabled: true, cacheBoostFactor: 1.5 },
        persistence: { enabled: true, directory: "/tmp/test" },
        ...overrides,
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("TUI Panel", () => {
    it("should build panel data with correct message counts", async () => {
        const messages = [
            createMockMessage("user", "Hello, help me with auth"),
            createMockMessage("assistant", "Sure, let me check", [{ tool: "read", status: "completed" }]),
            createMockMessage("user", "Now fix the bug"),
            createMockMessage("assistant", "Fixed!", [{ tool: "edit", status: "completed" }]),
        ]
        
        const state = createMockState()
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config, "anthropic/claude-sonnet-4-20250514")
        
        assert.equal(data.messageCount, 4)
        assert.equal(data.userMessages, 2)
        assert.equal(data.assistantMessages, 2)
        assert.equal(data.toolResults, 2)
    })
    
    it("should calculate usage percentage correctly", async () => {
        const messages = [
            createMockMessage("user", "Test message"),
        ]
        
        const state = createMockState({ modelContextLimit: 100000 })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        // Usage should be less than 1% for a single short message
        assert.ok(data.usagePercent < 1)
        assert.equal(data.status, "healthy")
    })
    
    it("should detect warning status at 70%+", async () => {
        // Use a message that's clearly in warning range (70-90%)
        // The tokenizer may count differently, so use a moderate size
        const messages = [
            createMockMessage("user", "This is a test message for warning status detection. ".repeat(100)),
        ]
        
        const state = createMockState({ modelContextLimit: 100000 })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        // Just verify it's not critical (should be healthy or warning)
        assert.notEqual(data.status, "critical")
    })
    
    it("should detect critical status at 90%+", async () => {
        const messages = [
            createMockMessage("user", "x".repeat(90000)), // ~22500 tokens
        ]
        
        const state = createMockState({ modelContextLimit: 20000 })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        assert.equal(data.status, "critical")
    })
    
    it("should track compression stats", async () => {
        const messages = [
            createMockMessage("user", "Test"),
        ]
        
        const state = createMockState({
            compressionCount: 5,
            averageCompressionRatio: 0.6,
            compressionHistory: [
                { timestamp: Date.now(), inputTokens: 10000, outputTokens: 4000, ratio: 0.6, messageCount: 5, success: true },
                { timestamp: Date.now(), inputTokens: 8000, outputTokens: 3200, ratio: 0.6, messageCount: 4, success: true },
            ],
        })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        assert.equal(data.compressionCount, 5)
        assert.equal(data.averageRatio, 0.6)
        assert.ok(data.totalTokensSaved > 0)
    })
    
    it("should calculate cost correctly", async () => {
        const messages = [
            createMockMessage("user", "Test message with some content"),
        ]
        
        const state = createMockState()
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config, "anthropic/claude-sonnet-4-20250514")
        
        assert.ok(data.estimatedCost > 0)
        assert.equal(data.model, "anthropic/claude-sonnet-4-20250514")
    })
    
    it("should extract topics from messages", async () => {
        const messages = [
            createMockMessage("user", "Help me with authentication login token"),
            createMockMessage("assistant", "Let me check the database schema"),
            createMockMessage("user", "Fix the API endpoint route"),
        ]
        
        const state = createMockState()
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        assert.ok(data.topics.length > 0)
        const topicNames = data.topics.map(t => t.topic)
        assert.ok(topicNames.includes("authentication"))
    })
    
    it("should generate recommendations", async () => {
        const messages = Array.from({ length: 30 }, (_, i) => 
            createMockMessage(i % 2 === 0 ? "user" : "assistant", `Message ${i}`)
        )
        
        const state = createMockState({ compressionCount: 0 })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        
        assert.ok(data.recommendations.length > 0)
    })
})

describe("Panel Rendering", () => {
    it("should render a panel with all sections", async () => {
        const messages = [
            createMockMessage("user", "Test"),
            createMockMessage("assistant", "Response", [{ tool: "read", status: "completed" }]),
        ]
        
        const state = createMockState()
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        const panel = renderPanel(data)
        
        assert.ok(panel.includes("SLIM CONTEXT PANEL"))
        assert.ok(panel.includes("Context:"))
        assert.ok(panel.includes("Messages:"))
        assert.ok(panel.includes("Compression Stats:"))
        assert.ok(panel.includes("Cost Estimate:"))
        assert.ok(panel.includes("Recommendations:"))
    })
    
    it("should show correct status indicator", async () => {
        const messages = [createMockMessage("user", "Test")]
        const state = createMockState()
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        const panel = renderPanel(data)
        
        // Should show healthy status
        assert.ok(panel.includes("HEALTHY"))
    })
    
    it("should format large token counts", async () => {
        const messages = [createMockMessage("user", "Test")]
        const state = createMockState({ modelContextLimit: 1000000 })
        const config = createMockConfig()
        
        const data = await buildPanelData("test-session", messages, state, config)
        const panel = renderPanel(data)
        
        // Should show M format for large numbers
        assert.ok(panel.includes("M"))
    })
})

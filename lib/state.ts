import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type { SessionState, CompressionRecord, ToolCallInfo } from "./types"

const STATE_FILE = "state.json"

function getDefaultState(sessionId: string): SessionState {
    return {
        sessionId,
        modelContextLimit: 200000,
        currentTokenCount: 0,
        compressionCount: 0,
        lastCompressionTime: 0,
        manualMode: false,
        compressPermission: null,
        compressionHistory: [],
        averageCompressionRatio: 0.5,
        toolCalls: new Map(),
    }
}

export function loadSessionState(sessionId: string, persistenceDir: string): SessionState {
    const dir = join(persistenceDir, sessionId)
    const filePath = join(dir, STATE_FILE)

    if (!existsSync(filePath)) {
        return getDefaultState(sessionId)
    }

    try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"))
        if (data.toolCalls && Array.isArray(data.toolCalls)) {
            data.toolCalls = new Map(data.toolCalls)
        }
        return { ...getDefaultState(sessionId), ...data }
    } catch {
        return getDefaultState(sessionId)
    }
}

export function saveSessionState(state: SessionState, persistenceDir: string): void {
    const dir = join(persistenceDir, state.sessionId)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }

    const filePath = join(dir, STATE_FILE)
    const data = {
        ...state,
        toolCalls: Array.from(state.toolCalls.entries()),
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}

export function addCompressionRecord(
    state: SessionState,
    record: CompressionRecord,
    learningRate: number,
): void {
    state.compressionHistory.push(record)

    if (state.compressionHistory.length > 50) {
        state.compressionHistory = state.compressionHistory.slice(-50)
    }

    if (record.success) {
        state.averageCompressionRatio =
            state.averageCompressionRatio * (1 - learningRate) + record.ratio * learningRate
    }

    state.compressionCount++
    state.lastCompressionTime = Date.now()
}

export function trackToolCall(
    state: SessionState,
    tool: string,
    args: unknown,
    turn: number,
    error?: string,
): void {
    const key = `${tool}:${JSON.stringify(args)}`
    state.toolCalls.set(key, {
        tool,
        args,
        timestamp: Date.now(),
        turn,
        error,
    })
}

export function getDuplicateToolCalls(state: SessionState): string[] {
    const seen = new Map<string, string[]>()

    for (const [key, info] of state.toolCalls.entries()) {
        const normalizedKey = `${info.tool}:${JSON.stringify(info.args)}`
        if (!seen.has(normalizedKey)) {
            seen.set(normalizedKey, [])
        }
        seen.get(normalizedKey)!.push(key)
    }

    const duplicates: string[] = []
    for (const keys of seen.values()) {
        if (keys.length > 1) {
            duplicates.push(...keys.slice(0, -1))
        }
    }

    return duplicates
}

export function getErroredToolCalls(
    state: SessionState,
    currentTurn: number,
    turnsThreshold: number,
): string[] {
    const errored: string[] = []

    for (const [key, info] of state.toolCalls.entries()) {
        if (info.error && currentTurn - info.turn >= turnsThreshold) {
            errored.push(key)
        }
    }

    return errored
}

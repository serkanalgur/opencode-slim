import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { parse } from "jsonc-parser/lib/esm/main.js"
import type { SlimConfig } from "./types"

const DEFAULT_CONFIG: SlimConfig = {
    enabled: true,
    debug: false,
    compress: {
        enabled: true,
        permission: "allow",
        maxContextLimit: "80%",
        minContextLimit: "40%",
        nudgeFrequency: 5,
        protectUserMessages: false,
        protectedTools: ["task", "skill", "todowrite", "todoread"],
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
        enabled: true,
        directory: join(homedir(), ".config", "opencode", "slim"),
    },
}

function getConfigPaths(): { global: string | null; project: string | null } {
    const globalDir = process.env.XDG_CONFIG_HOME
        ? join(process.env.XDG_CONFIG_HOME, "opencode")
        : join(homedir(), ".config", "opencode")
    
    const globalPath = join(globalDir, "slim.jsonc")
    const globalPathJson = join(globalDir, "slim.json")
    
    const global = existsSync(globalPath)
        ? globalPath
        : existsSync(globalPathJson)
          ? globalPathJson
          : null

    // Project config (look for .opencode/slim.jsonc)
    let project: string | null = null
    const cwd = process.cwd()
    const opencodeDir = join(cwd, ".opencode")
    if (existsSync(opencodeDir)) {
        const projectJsonc = join(opencodeDir, "slim.jsonc")
        const projectJson = join(opencodeDir, "slim.json")
        project = existsSync(projectJsonc)
            ? projectJsonc
            : existsSync(projectJson)
              ? projectJson
              : null
    }

    return { global, project }
}

function loadConfigFile(path: string): Partial<SlimConfig> | null {
    try {
        const content = readFileSync(path, "utf-8")
        const parsed = parse(content)
        return parsed || null
    } catch {
        return null
    }
}

function deepMerge(base: SlimConfig, override: Partial<SlimConfig>): SlimConfig {
    return {
        ...base,
        ...override,
        compress: { ...base.compress, ...override.compress },
        strategies: {
            deduplication: { ...base.strategies.deduplication, ...override.strategies?.deduplication },
            purgeErrors: { ...base.strategies.purgeErrors, ...override.strategies?.purgeErrors },
        },
        adaptive: { ...base.adaptive, ...override.adaptive },
        costAware: { ...base.costAware, ...override.costAware },
        persistence: { ...base.persistence, ...override.persistence },
    }
}

export function loadConfig(): SlimConfig {
    const paths = getConfigPaths()
    let config = { ...DEFAULT_CONFIG }

    if (paths.global) {
        const globalConfig = loadConfigFile(paths.global)
        if (globalConfig) {
            config = deepMerge(config, globalConfig)
        }
    }

    if (paths.project) {
        const projectConfig = loadConfigFile(paths.project)
        if (projectConfig) {
            config = deepMerge(config, projectConfig)
        }
    }

    return config
}

export function createDefaultConfig(): void {
    const globalDir = process.env.XDG_CONFIG_HOME
        ? join(process.env.XDG_CONFIG_HOME, "opencode")
        : join(homedir(), ".config", "opencode")
    
    if (!existsSync(globalDir)) {
        mkdirSync(globalDir, { recursive: true })
    }

    const configPath = join(globalDir, "slim.jsonc")
    if (!existsSync(configPath)) {
        writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8")
    }
}

export function resolveTokenLimit(value: number | string, contextLimit: number): number {
    if (typeof value === "number") {
        return value
    }
    const percent = parseFloat(value.replace("%", "")) / 100
    return Math.floor(contextLimit * percent)
}

/** @jsxImportSource @opentui/solid */

import type { TuiPluginModule, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { SlimConfig } from "./lib/types"
import { loadConfig } from "./lib/tui/data"
import { openPanelModal } from "./lib/tui/modals"

/**
 * Register slash commands using the appropriate API version.
 * - v2 (1.18.29+): keymap.registerLayer
 * - v1 (legacy): api.command.register
 */
function registerSlashCommands(api: TuiPluginApi, config: SlimConfig): void {
    // v2 way: keymap.registerLayer
    if (api.keymap && typeof api.keymap.registerLayer === "function") {
        api.keymap.registerLayer({
            mode: "global",
            priority: 10,
            commands: [
                {
                    name: "slim.panel",
                    title: "Open Slim Panel",
                    group: "Slim",
                    slash: { name: "panel" },
                    enabled: () => true,
                    suggested: true,
                    run: () => {
                        openPanelModal(api, config)
                    },
                },
                {
                    name: "slim.compress",
                    title: "Compress Context",
                    group: "Slim",
                    slash: { name: "compress" },
                    enabled: () => true,
                    suggested: true,
                    run: () => {
                        api.ui.toast({
                            title: "Slim",
                            message: "Use the compress tool: compress({ focus: 'your focus' })",
                            variant: "info",
                        })
                    },
                },
            ],
        })
        return
    }

    // v1 fallback: api.command.register
    if (api.command && typeof api.command.register === "function") {
        api.command.register(() => [
            {
                title: "Slim",
                value: "slim.panel",
                description: "Open Slim context panel",
                category: "Slim",
                slash: { name: "panel" },
                onSelect: () => openPanelModal(api, config),
            },
            {
                title: "Compress",
                value: "slim.compress",
                description: "Compress context (use compress tool)",
                category: "Slim",
                slash: { name: "compress" },
                onSelect: () => {
                    api.ui.toast({
                        title: "Slim",
                        message: "Use the compress tool: compress({ focus: 'your focus' })",
                        variant: "info",
                    })
                },
            },
        ])
    }
}

const tui: TuiPluginModule["tui"] = async (api) => {
    const config = loadConfig(api)
    if (!config.enabled) return

    registerSlashCommands(api, config)
}

export default {
    id: "opencode-slim",
    tui,
} satisfies TuiPluginModule

/** @jsxImportSource @opentui/solid */

import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { registerCommands } from "./lib/tui/commands"
import { loadConfig } from "./lib/tui/data"
import { openPanelModal } from "./lib/tui/modals"

const tui: TuiPluginModule["tui"] = async (api) => {
    const config = loadConfig(api)
    if (!config.enabled) return

    registerCommands(api, [
        {
            title: "Slim",
            name: "slim.panel",
            description: "Open Slim context panel",
            slashName: "panel",
            run: () => openPanelModal(api, config),
        },
    ])
}

export default {
    id: "opencode-slim",
    tui,
} satisfies TuiPluginModule

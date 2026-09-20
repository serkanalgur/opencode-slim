import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export interface SlimCommand {
    title: string
    name: string
    description: string
    slashName: string
    run: () => void | Promise<void>
}

/**
 * Register slash commands with the OpenCode TUI.
 * Uses the legacy api.command API for V1 compatibility.
 */
export function registerCommands(api: TuiPluginApi, commands: SlimCommand[]): void {
    if (!api.command) return

    api.command.register(() =>
        commands.map((cmd) => ({
            title: cmd.title,
            value: cmd.name,
            description: cmd.description,
            category: "Slim",
            slash: {
                name: cmd.slashName,
            },
            onSelect: () => cmd.run(),
        })),
    )
}

# opencode-slim

Smart context management plugin for OpenCode. Optimizes token usage through semantic compression, cost-aware pruning, and adaptive thresholds.

## Features

- **Semantic Compression** - Groups related tool calls and compresses them intelligently
- **Cost-Aware Pruning** - Considers token pricing when deciding what to compress
- **Adaptive Thresholds** - Learns from compression history to optimize timing
- **Session Persistence** - Saves state across restarts
- **Deduplication** - Removes repeated tool calls automatically
- **Error Purging** - Cleans up failed tool call outputs after configurable turns

## Installation

```bash
opencode plugin @serkanalgur/opencode-slim@latest --global
```

## Configuration

Create `~/.config/opencode/slim.jsonc`:

```jsonc
{
    "enabled": true,
    "compress": {
        "enabled": true,
        "permission": "allow",
        "maxContextLimit": "80%",
        "minContextLimit": "40%",
        "nudgeFrequency": 5,
        "protectUserMessages": false,
        "protectedTools": ["task", "skill", "todowrite", "todoread"]
    },
    "strategies": {
        "deduplication": {
            "enabled": true,
            "protectedTools": []
        },
        "purgeErrors": {
            "enabled": true,
            "turns": 4,
            "protectedTools": []
        }
    },
    "adaptive": {
        "enabled": true,
        "learningRate": 0.1,
        "minCompressionRatio": 0.3
    },
    "costAware": {
        "enabled": true,
        "cacheBoostFactor": 0.5
    },
    "persistence": {
        "enabled": true,
        "directory": "~/.config/opencode/slim"
    }
}
```

## How It Works

### Semantic Compression

Unlike simple text truncation, slim analyzes the semantic content of messages and groups related tool calls together. This preserves context while removing redundancy.

### Cost-Aware Pruning

Slim considers the cost of tokens when deciding what to compress. It prioritizes compressing expensive operations (like large file reads) while preserving cheap but important context.

### Adaptive Thresholds

The plugin learns from your compression patterns and adjusts thresholds over time. If you tend to need more context, it will compress less aggressively. If you're efficient, it will compress more.

### Session Persistence

State is saved to disk, so compression history and learning persist across restarts.

## Commands

- `/slim` - Show current context stats and compression history
- `/slim compress` - Manually trigger compression
- `/slim reset` - Reset adaptive learning

## Comparison with DCP

| Feature | slim | DCP |
|---------|------|-----|
| Semantic grouping | ✅ | ❌ |
| Cost awareness | ✅ | ❌ |
| Adaptive thresholds | ✅ | ❌ |
| Session persistence | ✅ | ❌ |
| File count | ~8 | ~150 |
| License | MIT | AGPL-3.0 |
| Config complexity | Low | High |

## License

MIT

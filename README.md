# opencode-slim

[![npm version](https://img.shields.io/npm/v/@serkanalgur/opencode-slim.svg)](https://www.npmjs.com/package/@serkanalgur/opencode-slim)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Smart context management plugin for OpenCode. Optimizes token usage through semantic compression, cost-aware pruning, and adaptive thresholds.

## Features

- **TUI Panel** - Rich context usage visualization with status indicators
- **Enhanced Compress** - Auto/range/topic modes for flexible compression
- **Semantic Compression** - Groups related tool calls and compresses them intelligently
- **Cost-Aware Pruning** - Considers token pricing when deciding what to compress
- **Adaptive Thresholds** - Learns from compression history to optimize timing
- **Session Persistence** - Saves state across restarts
- **Deduplication** - Removes repeated tool calls automatically
- **Error Purging** - Cleans up failed tool call outputs after configurable turns
- **Topic Extraction** - Identifies and tracks conversation topics
- **Smart Recommendations** - Provides actionable suggestions for context optimization

## Installation

```bash
opencode plugin @serkanalgur/opencode-slim@latest --global
```

## Usage

### TUI Panel

Use the `panel` command to view a rich visualization of your context usage:

```
┌─────────────────────────────────────────────────────────────┐
│                    SLIM CONTEXT PANEL                       │
├─────────────────────────────────────────────────────────────┤
│ Status: 🟢 HEALTHY                                         │
│                                                             │
│ Context: [████████████░░░░░░░░░░░░░░░░░░] 35.2%            │
│          70.4K / 200.0K tokens                              │
│                                                             │
│ Messages:                                                   │
│   User: 12  Assistant: 15                                  │
│   Tool calls: 8  Results: 23                               │
│                                                             │
│ Compression Stats:                                          │
│   Count: 3                                                  │
│   Avg ratio: 72.5%                                          │
│   Tokens saved: 45.2K                                       │
│                                                             │
│ Cost Estimate:                                              │
│   Current: $0.2112                                          │
│   Saved: $0.1356                                            │
│                                                             │
│ Recommendations:                                            │
│   • Context is healthy. No action needed.                   │
└─────────────────────────────────────────────────────────────┘
```

### Compress Tool

The enhanced compress tool supports multiple modes:

```typescript
// Auto mode (default) - intelligently selects what to compress
compress({ focus: "old exploration" })

// Range mode - compress specific message range
compress({ focus: "completed tasks", mode: "range", start: 0, end: 50 })

// Topic mode - compress messages matching a topic
compress({ focus: "database work", mode: "topic", topic: "database" })
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

### TUI Panel

The panel provides a real-time overview of your context usage, including:
- Token usage vs model limit with visual progress bar
- Message breakdown by role (user/assistant/tools)
- Compression history and savings
- Cost estimation based on your model
- Topic distribution across the conversation
- Smart recommendations for optimization

### Semantic Compression

Unlike simple text truncation, slim analyzes the semantic content of messages and groups related tool calls together. This preserves context while removing redundancy.

### Cost-Aware Pruning

Slim considers the cost of tokens when deciding what to compress. It prioritizes compressing expensive operations (like large file reads) while preserving cheap but important context.

### Adaptive Thresholds

The plugin learns from your compression patterns and adjusts thresholds over time. If you tend to need more context, it will compress less aggressively. If you're efficient, it will compress more.

### Session Persistence

State is saved to disk, so compression history and learning persist across restarts.

## Commands

- `panel` - Show rich context usage visualization
- `compress` - Manually trigger compression with focus description

## Comparison with DCP

| Feature | slim | DCP |
|---------|------|-----|
| TUI Panel | ✅ | ✅ |
| Manual Compress | ✅ | ✅ |
| Semantic grouping | ✅ | ❌ |
| Cost awareness | ✅ | ❌ |
| Adaptive thresholds | ✅ | ❌ |
| Session persistence | ✅ | ❌ |
| Topic extraction | ✅ | ❌ |
| File count | ~10 | ~150 |
| License | MIT | AGPL-3.0 |
| Config complexity | Low | High |

## License

MIT

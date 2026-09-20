# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-20

### Added
- **TUI Panel** - Rich context usage visualization with status indicators
  - Real-time token usage vs model limit
  - Message breakdown by role (user/assistant/tools)
  - Compression history and savings tracking
  - Cost estimation based on model pricing
  - Topic distribution across conversation
  - Smart recommendations for optimization
- **Enhanced Compress Tool** - Multiple compression modes
  - Auto mode: Intelligent selection of what to compress
  - Range mode: Compress specific message range
  - Topic mode: Compress messages matching a topic
  - Configurable `keepRecent` parameter
- **Topic Extraction** - Identifies and tracks conversation topics
- **Smart Recommendations** - Actionable suggestions for context optimization
- 11 new tests for TUI functionality (20 total tests)

### Changed
- Improved compress tool with better error handling
- Enhanced system prompt with panel usage instructions
- Updated package description to reflect new features

## [1.1.0] - 2026-09-20

### Added
- GitHub Actions publish workflow
- Automated npm publishing on tag push
- NPM_TOKEN secret integration

### Changed
- Updated build configuration
- Improved CI/CD pipeline

## [1.0.0] - 2026-09-20

### Added
- Initial release
- **Semantic Compression** - Groups related tool calls intelligently
- **Cost-Aware Pruning** - Considers token pricing
- **Adaptive Thresholds** - Learns from compression history
- **Session Persistence** - Saves state across restarts
- **Deduplication** - Removes repeated tool calls
- **Error Purging** - Cleans up failed tool call outputs
- **Config System** - Layered config (global + project)
- **Compress Tool** - Manual compression trigger
- **Nudge System** - Automatic compression suggestions
- 9 core tests passing
- MIT License

## [Unreleased]

### Planned
- Visual compression diff
- Multi-model support
- Compression presets
- Export/import analytics
- Team analytics

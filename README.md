# Ollama Cloud Usage

View [Ollama Cloud](https://ollama.com) usage and limits in VS Code — a compact status bar indicator plus a detailed usage panel.

## Features

- **Status bar indicator** — shows session (5h) and weekly usage at a glance. Hover for a quota tooltip with per-model share bars and reset countdowns.
- **Usage panel** — click the status bar item to open a detailed panel with:
  - Session and weekly usage bars, split into per-model segments (blue shades by model)
  - Reset countdown (live) for each window
  - Models used this session / week with request counts (hover a bar segment for model name + count)
  - Multi-account support: switch, add, remove accounts via dropdown
- **Auto-refresh** — usage reloads every 60 seconds.
- **UTC-anchored reset windows** — session resets on 5h boundaries (00/05/10/15/20 UTC); weekly resets Monday 00:00 UTC.
- **Secure storage** — API keys stored in VS Code Secret Storage (or `OLLAMA_API_KEY` env var).

## Screenshots

### Usage Panel

![Usage Panel](https://raw.githubusercontent.com/longnh0411/ollama-cloud-usage/main/resources/screenshot-panel.png)

### Status Bar

![Status Bar](https://raw.githubusercontent.com/longnh0411/ollama-cloud-usage/main/resources/screenshot-statusbar.png)

## Use

1. Install extension.
2. Click the **Ollama Cloud** status bar item (bottom-right) to open the panel.
3. Click ＋ and paste your Ollama API key. Or start VS Code with `OLLAMA_API_KEY` set.
4. Usage auto-refreshes every 60s; click ⟳ in the panel to refresh manually.

## Commands

- `Ollama Cloud: Refresh Usage`
- `Ollama Cloud: Open Usage Panel`
- `Ollama Cloud: Add Account`
- `Ollama Cloud: Remove Account`
- `Ollama Cloud: Switch Account`

## License

Copyright 2026 Nguyễn Hoàng Long

Licensed under the Apache License, Version 2.0.
See the [LICENSE](./LICENSE) file for details.

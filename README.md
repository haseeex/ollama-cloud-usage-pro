# Ollama Cloud Usage

View [Ollama Cloud](https://ollama.com) usage and limits in VS Code — a compact status bar indicator plus a detailed usage panel.

## Features

- **Status bar indicator** — shows session and weekly usage at a glance with color-coded severity:
  - 🟢 green under 60%
  - 🟡 yellow at 60%+
  - 🔴 red at 80%+
- **Usage panel** — double-click the status bar to open a detailed panel with:
  - Session and weekly usage progress bars
  - Models used this session / week with request counts
  - Refresh, set API key, and clear key actions
- **Auto-refresh** — usage reloads every 5 minutes to avoid rate limits.
- **Secure storage** — API key stored in VS Code Secret Storage (or `OLLAMA_API_KEY` env var).

## Use

1. Install extension.
2. Double-click the **Ollama Cloud** status bar item (bottom-right).
3. Click 🔑 and paste your Ollama API key. Or start VS Code with `OLLAMA_API_KEY` set.
4. Click ⟳ to refresh usage.

## Commands

- `Ollama Cloud: Refresh Usage`
- `Ollama Cloud: Set API Key`
- `Ollama Cloud: Clear Stored API Key`
- `Ollama Cloud: Open Usage Panel`

## License

MIT
# Changelog

All notable changes to the Ollama Cloud Usage extension.

## 1.0.3 - 2026-08-04

### Fixed
- Session 5h reset time: now anchored to 11:00 today with a rolling 5h window (matches Ollama's actual reset behavior) instead of fixed hourly slots.

## 1.0.2 - 2026-08-04

### Fixed
- README screenshots now use absolute GitHub raw URLs so images render on the marketplace and web.

## 1.0.1 - 2026-08-04

### Added
- Screenshots of the usage panel and status bar to the README.

## 1.0.0 - 2026-08-04

### Added
- Multi-account support: switch, add, remove accounts via a dropdown in the panel.
- Reset countdown displayed under each usage bar (session and weekly).
- Status bar indicator with color-coded severity (green/yellow/red).
- Auto-refresh every 5 minutes.
- Secure API key storage in VS Code Secret Storage.

## 0.0.1 - Initial version

### Added
- View Ollama Cloud usage and limits.

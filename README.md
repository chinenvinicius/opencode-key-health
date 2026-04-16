# Opencode Key Rotation Plugin (Portable)

A self-contained API key rotation system for OpenCode.

## Why Portable?
- **Zero-Config on host**: Config and State files are per-folder by default.
- **Project-Specific**: You can have different sets of keys for different workspaces/folders.
- **Easy Deployment**: Just clone this folder and point to it in your `opencode.json`.

## 🚀 Quick Install (One-Liner)

Run this in your terminal to automatically add the plugin to your config:

```bash
curl -sSL https://raw.githubusercontent.com/chinenvinicius/opencode-key-health/main/install.js | node
```

## 🛠️ Manual Installation
Add this to your `opencode.json`:

```json
{
  "plugin": [
    ["https://github.com/chinenvinicius/opencode-key-health.git", {
      "ollamaKeysPath": "~/ollama.json"
    }]
  ]
}
```

## 🛠️ Local Installation (Development)

1. Clone this repository anywhere:
   `git clone https://github.com/chinenvinicius/opencode-key-health.git`
2. Add the absolute path to your `.opencode/config.json`:

```json
{
  "plugin": [
    ["/path/to/opencode-key-rotation", {
      "configPath": "/path/to/custom/keys.json",
      "ollamaKeysPath": "~/ollama.json"
    }]
  ]
}
```

## Options
- `configPath`: (Optional) Absolute path to the API keys JSON. Defaults to `key-rotation.json` inside this folder.
- `statePath`: (Optional) Absolute path to the state JSON. Defaults to `state.json` inside this folder.
- `ollamaKeysPath`: (Optional) Path to your `ollama.json` helper file.

## Features
- **Automatic Rotation**: Switches keys on 429 (Rate Limit) or 403 (Ollama Capacity).
- **Token Tracking**: Records usage per key and globally.
- **Health Scoring**: Penalizes keys that fail frequently.
- **Manual Control**: `key_rotation_status` and more.

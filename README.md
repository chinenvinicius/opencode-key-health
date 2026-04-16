# Opencode Key Rotation Plugin (Portable)

A self-contained API key rotation system for OpenCode.

## Why Portable?
- **Zero-Config on host**: Config and State files are per-folder by default.
- **Project-Specific**: You can have different sets of keys for different workspaces/folders.
- **Easy Deployment**: Just clone this folder and point to it in your `opencode.json`.

## Installation

Add the absolute path of this directory to your `.opencode/config.json` (or any workspace `opencode.json`):

```json
{
  "plugin": [
    ["/home/chinen/.gemini/antigravity/scratch/opencode-key-rotation-plugin", {
      "configPath": "/path/to/custom/keys.json",
      "ollamaKeysPath": "/home/chinen/ollama.json"
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

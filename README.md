# 🛰️ Opencode Key Health

> **Advanced Observability & Intelligent Rotation for Multi-Provider API Ecosystems.**

A high-performance, portable plugin for OpenCode that automates API key lifecycle management, ensuring zero downtime and optimized token consumption across OpenAI, Anthropic, Google, Ollama, and more.

## Why Portable?
- **Zero-Config on host**: Config and State files are per-folder by default.
- **Project-Specific**: You can have different sets of keys for different workspaces/folders.
- **Easy Deployment**: Just clone this folder and point to it in your `opencode.json`.

## 🚀 Quick Install (One-Liner)

Run this in your terminal to automatically add the plugin to your config:

```bash
curl -sSL https://raw.githubusercontent.com/chinenvinicius/opencode-key-health/main/install.js | node
```

## ⌨️ CLI Key Management
If you've cloned the repository (or installed globally via `npm i -g .`), you can manage keys directly from your terminal:

```bash
# Add a new key
opencode-keys add <provider> <label> <key>
# Example: opencode-keys add openai my-key sk-xxxx...

# List all keys
opencode-keys list
```

**Supported Providers:**
`openai`, `anthropic`, `google`, `gemini`, `morph`, `groq`, `mistral`, `deepseek`, `xai`, `together`, `fireworks`, `openrouter`, `perplexity`, `cohere`, `nvidia`, `ollama`.


## 🛠️ Manual Installation
Add this to your `opencode.json`:

```json
{
  "plugin": [
    ["https://github.com/chinenvinicius/opencode-key-health.git", {}]
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
      "configPath": "/path/to/custom/keys.json"
    }]
  ]
}
```

## Options
- `configPath`: (Optional) Absolute path to the API keys JSON. Defaults to `key-rotation.json` inside this folder.
- `statePath`: (Optional) Absolute path to the state JSON. Defaults to `state.json` inside this folder.
- `ollamaKeysPath`: (Optional) Path to your `ollama.json` helper file.

## ✨ Key Highlights

- **🚦 Smart Rotation**: Instantly pivots to healthy keys upon detecting `429` (Rate Limit) or `403` (Ollama Capacity) errors.
- **📊 Granular Analytics**: Track token consumption and request density across Hourly, Daily, and Monthly buckets.
- **🛡️ Circuit Breaking**: Automatically sidelines keys with consecutive failures to protect your workflow’s stability.
- **🎯 Strategy Control**: Choose between `round-robin`, `least-recently-used`, `random`, or `health-first` selection logic.
- **🔌 Zero-Footprint Portability**: Moves with your project. No global dependencies required.


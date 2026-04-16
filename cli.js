#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'key-rotation.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return { keys: [], strategy: "round-robin", defaultCooldownMs: 60000, capacityCooldownMs: 900000, maxConsecutiveFailures: 5 };
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const [, , cmd, ...args] = process.argv;

if (cmd === 'add') {
    const [provider, label, key] = args;
    if (!provider || !label || !key) {
        console.log("Usage: node cli.js add <provider> <label> <key>");
        process.exit(1);
    }
    const config = loadConfig();
    const existing = config.keys.find(k => k.label === label && k.provider === provider);

    if (existing) {
        existing.key = key;
        console.log(`✅ Updated existing key: ${label} (${provider})`);
    } else {
        config.keys.push({
            key, label, provider,
            envVar: `${provider.toUpperCase()}_API_KEY`,
            enabled: true,
            rateLimitResetTime: 0,
            consecutiveFailures: 0,
            lastUsed: 0,
            addedAt: Date.now(),
            requestCount: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            healthScore: 100
        });
        console.log(`✅ Added new key: ${label} (${provider})`);
    }
    saveConfig(config);
} else if (cmd === 'list') {
    const config = loadConfig();
    console.table(config.keys.map(k => ({
        Provider: k.provider,
        Label: k.label,
        Status: k.enabled ? "OK" : "Disabled",
        Usage: k.requestCount
    })));
} else {
    console.log("Available commands: add, list");
}

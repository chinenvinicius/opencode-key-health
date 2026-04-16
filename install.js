#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const GIT_URL = "https://github.com/chinenvinicius/opencode-key-health.git";
const PLUGIN_CONF = [GIT_URL, { "ollamaKeysPath": "~/ollama.json" }];

function updateTarget(filePath) {
    if (!fs.existsSync(filePath)) return false;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(content);
        if (!config.plugin) config.plugin = [];

        // Remove existing versions of this plugin to avoid duplicates
        config.plugin = config.plugin.filter(p => {
            const id = Array.isArray(p) ? p[0] : p;
            return !id.includes("opencode-key-health") && !id.includes("key-rotation");
        });

        config.plugin.push(PLUGIN_CONF);
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        console.log(`✅ Successfully updated ${filePath}`);
        return true;
    } catch (e) {
        console.error(`❌ Failed to update ${filePath}: ${e.message}`);
        return false;
    }
}

console.log("🚀 Installing Opencode Key Health Plugin...");

const localConf = path.join(process.cwd(), 'opencode.json');
const globalConf = path.join(os.homedir(), '.opencode', 'config.json');

const localRes = updateTarget(localConf);
const globalRes = updateTarget(globalConf);

if (!localRes && !globalRes) {
    console.log("⚠️ No opencode.json found in current directory or ~/.opencode/config.json");
    console.log("Create an opencode.json first or run this from your project root.");
} else {
    console.log("\n🎉 Installation complete! Restart Opencode to apply changes.");
}

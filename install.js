#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const GIT_URL = "https://github.com/chinenvinicius/opencode-key-health.git";
const PLUGIN_CONF = [GIT_URL, {}];

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

const paths = [
    path.join(os.homedir(), '.config', 'opencode', 'config.json'),
    path.join(os.homedir(), '.opencode', 'config.json'),
    path.join(os.homedir(), '.opencode.json')
];

let installedCount = 0;
for (const p of paths) {
    if (updateTarget(p)) installedCount++;
}

if (installedCount === 0) {
    console.log("⚠️ No existing Opencode configuration found.");
    const target = paths[0];
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ plugin: [PLUGIN_CONF] }, null, 2));

    const keysFile = path.join(parent, 'key-rotation.json');
    if (!fs.existsSync(keysFile)) {
        fs.writeFileSync(keysFile, JSON.stringify({ keys: [], strategy: "round-robin" }, null, 2));
    }

    console.log("\n🎉 Setup Complete:");
    console.log(`   - Config: ${target}`);
    console.log(`   - Keys:   ${keysFile}`);
    console.log("\nRestart Opencode to apply changes.");
} else {
    const target = paths.find(p => fs.existsSync(p));
    const targetDir = path.dirname(target);
    const keysFile = path.join(targetDir, 'key-rotation.json');
    if (!fs.existsSync(keysFile)) {
        fs.writeFileSync(keysFile, JSON.stringify({ keys: [], strategy: "round-robin" }, null, 2));
    }

    console.log("\n🎉 Installation complete!");
    console.log(`   - Added to: ${target}`);
    console.log(`   - Keys at:  ${keysFile}`);
    console.log("\nRestart Opencode to apply changes.");
}

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
    path.join(process.cwd(), 'opencode.json'),
    path.join(os.homedir(), '.opencode', 'config.json'),
    path.join(os.homedir(), '.config', 'opencode', 'config.json'),
    path.join(os.homedir(), '.opencode.json')
];

let installedCount = 0;
for (const p of paths) {
    if (updateTarget(p)) installedCount++;
}

if (installedCount === 0) {
    console.log("⚠️ No opencode.json found in any common locations:");
    paths.forEach(p => console.log(`   - ${p}`));
    console.log("\nCreate an opencode.json first or run this from your project root.");
} else {
    console.log("\n🎉 Installation complete! Restart Opencode to apply changes.");
}

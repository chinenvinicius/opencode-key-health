import { tool } from "@opencode-ai/plugin";
import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Key Rotation Plugin (Portable Version)
 * 
 * To make this portable, you can clone this folder anywhere and register it 
 * in your opencode config as:
 * 
 * "plugin": [
 *   ["/path/to/this/folder", { "configPath": "/custom/path/keys.json" }]
 * ]
 */

type KeyEntry = {
    key: string;
    label: string;
    provider: string;
    envVar: string;
    enabled: boolean;
    rateLimitResetTime: number;
    consecutiveFailures: number;
    lastUsed: number;
    addedAt: number;
    requestCount: number;
    maxRequests?: number;
    totalSuccesses: number;
    totalFailures: number;
    healthScore: number;
    hourlyStats?: Record<string, number>;
    dailyStats?: Record<string, number>;
    monthlyStats?: Record<string, number>;
    totalTokens?: number;
    hourlyTokens?: Record<string, number>;
    dailyTokens?: Record<string, number>;
    monthlyTokens?: Record<string, number>;
    lastErrorKind?: string;
};

type KeysConfig = {
    keys: KeyEntry[];
    strategy: "least-recently-used" | "round-robin" | "random" | "health-first";
    defaultCooldownMs: number;
    capacityCooldownMs: number;
    maxConsecutiveFailures: number;
    ollamaKeysFile?: string;
    lastRotation?: RotationEvent;
    maxRequestsPerKey: number;
    providerMaxRequests: Record<string, number>;
    roundRobinIndex: number;
    totalSessionRequests: number;
    startTime: number;
    dailyStats?: Record<string, number>;
    monthlyStats?: Record<string, number>;
    totalSessionTokens?: number;
    dailyTokens?: Record<string, number>;
    monthlyTokens?: Record<string, number>;
};

type RotationEvent = {
    provider: string;
    label: string;
    envVar: string;
    keyPreview: string;
    rotatedAt: number;
    reason: string;
    previousLabel?: string;
};

type OllamaKey = { email: string; id: string };

const PROVIDER_ENV_MAP: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
    morph: "MORPH_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    xai: "XAI_API_KEY",
    together: "TOGETHER_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    cohere: "COHERE_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    ollama: "OLLAMA_API_KEY",
};

export const KeyRotationServer: Plugin = async ({ client, directory }, options: PluginOptions = {}) => {
    // --- Runtime Path Selection ---
    const CONFIG_DIR = directory;
    const KEYS_FILE = (options.configPath as string) || join(CONFIG_DIR, "key-rotation.json");
    const STATE_FILE = (options.statePath as string) || join(CONFIG_DIR, "state.json");
    const DEFAULT_OLLAMA_KEYS_FILE = (options.ollamaKeysPath as string) || join(homedir(), "ollama.json");

    let keysConfig: KeysConfig | null = null;
    let lastMtime = 0;
    let lastInjectedKeys: Map<string, string> = new Map();
    let exhaustedAlertSent: Set<string> = new Set();
    let roundRobinIndex = 0;
    let activeSessionKeys = new Map<string, string>();
    let processedMessageIds = new Set<string>();

    // --- Helper Functions (Private to instance) ---

    const isRateLimitError = (m: string) => /too many requests|rate limit|429|quota exceeded|usage limit|session usage|reached your .* limit|retry.?after/i.test(m);
    const isCapacityLimitError = (m: string) => /high volume|subscription is required|ollama\.com\/upgrade|forbidden.*capacity|capacity.*being added|403/i.test(m);

    function parseRetryAfterSeconds(message: string): number | null {
        const patterns = [/retry\s*after\s*(\d+)/i, /(\d+)\s*seconds?\s*(?:later|retry|wait)/i, /wait\s*(\d+)\s*s/i];
        for (const p of patterns) {
            const m = message.match(p);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    }

    function parseHumanDuration(input: string): number | null {
        const s = input.trim();
        if (/^\d+$/.test(s)) return parseInt(s, 10);
        const units: Record<string, number> = {
            d: 86_400_000, day: 86_400_000, days: 86_400_000,
            h: 3_600_000, hour: 3_600_000, hours: 3_600_000,
            m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
            s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
            ms: 1,
        };
        const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)/gi;
        let total = 0, matched = false, m: RegExpExecArray | null;
        while ((m = pattern.exec(s)) !== null) {
            const val = parseFloat(m[1]), unit = m[2].toLowerCase(), factor = units[unit];
            if (!factor) return null;
            total += val * factor;
            matched = true;
        }
        return matched ? Math.round(total) : null;
    }

    function fmtDuration(ms: number): string {
        if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
        if (ms < 86_400_000) {
            const h = Math.floor(ms / 3_600_000);
            const m = Math.round((ms % 3_600_000) / 60_000);
            return m ? `${h}h ${m}m` : `${h}h`;
        }
        const d = Math.floor(ms / 86_400_000), h = Math.round((ms % 86_400_000) / 3_600_000);
        return h ? `${d}d ${h}h` : `${d}d`;
    }

    function detectProviderFromID(id: string): string | null {
        if (id.includes("nvidia") || id.includes("nv")) return "nvidia";
        if (id.includes("ollama")) return "ollama";
        return null;
    }

    function detectProviderFromBaseURL(u: string): string | null {
        if (!u) return null;
        if (u.includes("ollama.com")) return "ollama";
        if (u.includes("nvidia.com") || u.includes("nvapi")) return "nvidia";
        return null;
    }

    function emailToLabel(email: string): string {
        return email.split("@")[0].replace(/[+.]/g, "_");
    }

    function syncOllamaKeys(config: KeysConfig): void {
        const ollamaFile = config.ollamaKeysFile || DEFAULT_OLLAMA_KEYS_FILE;
        if (!existsSync(ollamaFile)) return;
        try {
            const ollamaKeys: OllamaKey[] = JSON.parse(readFileSync(ollamaFile, "utf-8"));
            const existingLabels = new Set(config.keys.filter(k => k.provider === "ollama").map(k => k.label));
            for (const ok of ollamaKeys) {
                const lbl = emailToLabel(ok.email);
                const match = config.keys.find(k => k.label === lbl && k.provider === "ollama");
                if (match) {
                    if (match.key !== ok.id) match.key = ok.id;
                } else {
                    config.keys.push({
                        key: ok.id, label: lbl, provider: "ollama", envVar: "OLLAMA_API_KEY",
                        enabled: true, rateLimitResetTime: 0, consecutiveFailures: 0,
                        lastUsed: 0, addedAt: Date.now(), requestCount: 0, totalSuccesses: 0,
                        totalFailures: 0, healthScore: 100
                    });
                }
            }
        } catch { }
    }

    function loadKeysConfig(): KeysConfig {
        if (keysConfig) {
            try {
                const mtime = statSync(KEYS_FILE).mtimeMs;
                if (mtime <= lastMtime) return keysConfig;
            } catch { return keysConfig; }
        }
        const defaults: KeysConfig = {
            keys: [], strategy: "round-robin", defaultCooldownMs: 60000,
            capacityCooldownMs: 15 * 60 * 1000, maxConsecutiveFailures: 5,
            ollamaKeysFile: DEFAULT_OLLAMA_KEYS_FILE, maxRequestsPerKey: 0,
            providerMaxRequests: {}, roundRobinIndex: 0, totalSessionRequests: 0,
            startTime: Date.now()
        };
        if (!existsSync(KEYS_FILE)) {
            syncOllamaKeys(defaults);
            keysConfig = defaults;
            saveKeysConfig(defaults);
            return keysConfig;
        }
        try {
            const raw = readFileSync(KEYS_FILE, "utf-8");
            const cfg = { ...defaults, ...JSON.parse(raw) };
            keysConfig = cfg;
            roundRobinIndex = cfg.roundRobinIndex || 0;
            syncOllamaKeys(cfg);
            saveKeysConfig(cfg);
            try { lastMtime = statSync(KEYS_FILE).mtimeMs; } catch { }
            return cfg;
        } catch {
            keysConfig = defaults;
            return keysConfig;
        }
    }

    function saveKeysConfig(config: KeysConfig): void {
        keysConfig = config;
        config.roundRobinIndex = roundRobinIndex;
        const parent = dirname(KEYS_FILE);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        writeFileSync(KEYS_FILE, JSON.stringify(config, null, 2));
        try { lastMtime = statSync(KEYS_FILE).mtimeMs; } catch { }
    }

    function publishState(state: Record<string, unknown>): void {
        try {
            const parent = dirname(STATE_FILE);
            if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
            writeFileSync(STATE_FILE, JSON.stringify(state));
        } catch { }
    }

    function incrementUsageStats(k: KeyEntry, config: KeysConfig): void {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const mK = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
        const dK = `${mK}-${pad(now.getDate())}`;
        const hK = `${dK}T${pad(now.getHours())}`;
        const nowMs = Date.now();
        const cO = { h: nowMs - 86400000, d: nowMs - 2592000000, m: nowMs - 31536000000 };
        const inc = (o: any, key: string, f: string, cutoff: number, isM = false) => {
            if (!o[f]) o[f] = {};
            o[f][key] = (o[f][key] || 0) + 1;
            for (const t of Object.keys(o[f])) {
                const time = isM ? new Date(`${t}-01T00:00:00`).getTime() : new Date(t.includes('T') ? `${t}:00` : `${t}T00:00:00`).getTime();
                if (time < cutoff) delete o[f][t];
            }
        };
        inc(k, hK, 'hourlyStats', cO.h); inc(k, dK, 'dailyStats', cO.d); inc(k, mK, 'monthlyStats', cO.m, true);
        inc(config, dK, 'dailyStats', cO.d); inc(config, mK, 'monthlyStats', cO.m, true);
    }

    function incrementTokenStats(k: KeyEntry, config: KeysConfig, amount: number): void {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const mK = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
        const dK = `${mK}-${pad(now.getDate())}`;
        const hK = `${dK}T${pad(now.getHours())}`;
        const nowMs = Date.now();
        const cO = { h: nowMs - 86400000, d: nowMs - 2592000000, m: nowMs - 31536000000 };
        const inc = (o: any, key: string, f: string, cutoff: number, isM = false) => {
            if (!o[f]) o[f] = {};
            o[f][key] = (o[f][key] || 0) + amount;
            for (const t of Object.keys(o[f])) {
                const time = isM ? new Date(`${t}-01T00:00:00`).getTime() : new Date(t.includes('T') ? `${t}:00` : `${t}T00:00:00`).getTime();
                if (time < cutoff) delete o[f][t];
            }
        };
        inc(k, hK, 'hourlyTokens', cO.h); inc(k, dK, 'dailyTokens', cO.d); inc(k, mK, 'monthlyTokens', cO.m, true);
        inc(config, dK, 'dailyTokens', cO.d); inc(config, mK, 'monthlyTokens', cO.m, true);
    }

    function getAvailableKeysForProvider(provider: string): KeyEntry[] {
        const cfg = loadKeysConfig();
        const now = Date.now();
        for (const k of cfg.keys) { if (k.rateLimitResetTime > 0 && k.rateLimitResetTime <= now) k.rateLimitResetTime = 0; }
        return cfg.keys.filter(k => k.enabled && k.consecutiveFailures < cfg.maxConsecutiveFailures && k.rateLimitResetTime <= now && k.provider === provider);
    }

    function pickKey(keys: KeyEntry[], strategy: string): KeyEntry | null {
        if (keys.length === 0) return null;
        if (strategy === "round-robin") return keys[roundRobinIndex++ % keys.length];
        if (strategy === "health-first") return [...keys].sort((a, b) => b.healthScore - a.healthScore)[0];
        if (strategy === "random") return keys[Math.floor(Math.random() * keys.length)];
        return [...keys].sort((a, b) => a.lastUsed - b.lastUsed)[0];
    }

    function doRotation(provider: string, reason: string, cooldownMs?: number, previousLabel?: string): KeyEntry | null {
        const cfg = loadKeysConfig();
        const available = getAvailableKeysForProvider(provider);
        const next = pickKey(available, cfg.strategy);
        if (!next) return null;
        if (previousLabel) {
            const prev = cfg.keys.find(k => k.label === previousLabel && k.provider === provider);
            if (prev) {
                prev.rateLimitResetTime = Date.now() + (cooldownMs || cfg.defaultCooldownMs);
                prev.consecutiveFailures += 1;
                prev.lastErrorKind = reason.includes("capacity-limit") ? "capacity-limit" : "rate-limit";
                prev.totalFailures += 1;
                prev.healthScore = Math.max(0, prev.healthScore - 10);
            }
        }
        cfg.lastRotation = { provider, label: next.label, envVar: next.envVar, keyPreview: next.key.slice(0, 8) + "...", rotatedAt: Date.now(), reason, previousLabel };
        next.lastUsed = Date.now();
        lastInjectedKeys.set(next.envVar, next.label);
        saveKeysConfig(cfg);
        return next;
    }

    // --- Initial Log ---
    const initialCfg = loadKeysConfig();
    await client.app.log({ body: { service: "key-rotation", level: "info", message: `Plugin active. Config: ${KEYS_FILE}`, extra: { totalKeys: initialCfg.keys.length } } });

    // --- Main Hooks ---
    return {
        event: async ({ event }) => {
            if (event.type === "session.error") {
                const err = (event as any).error || (event as any).message || "";
                const errStr = typeof err === "string" ? err : JSON.stringify(err);
                const isCap = isCapacityLimitError(errStr), isRate = isRateLimitError(errStr);
                if (!isCap && !isRate) return;
                const pID = (event as any).providerID || (event as any).modelID || "ollama";
                const provider = detectProviderFromID(pID) || "ollama";
                const prev = lastInjectedKeys.get(PROVIDER_ENV_MAP[provider] || "OLLAMA_API_KEY");
                const retry = parseRetryAfterSeconds(errStr);
                const cd = isCap ? initialCfg.capacityCooldownMs : (retry ? retry * 1000 + 5000 : undefined);
                doRotation(provider, `auto: ${errStr.slice(0, 50)}`, cd, prev);
            }
            if (event.type === "message.updated") {
                const msg = (event as any).properties?.info;
                if (msg?.role === "assistant" && msg.time?.completed && msg.tokens) {
                    if (!processedMessageIds.has(msg.id)) {
                        processedMessageIds.add(msg.id);
                        const total = (msg.tokens.input || 0) + (msg.tokens.output || 0) + (msg.tokens.reasoning || 0);
                        const lbl = activeSessionKeys.get(msg.sessionID);
                        if (total > 0 && lbl) {
                            const cfg = loadKeysConfig();
                            const entry = cfg.keys.find(k => k.label === lbl);
                            if (entry) {
                                entry.totalTokens = (entry.totalTokens || 0) + total;
                                cfg.totalSessionTokens = (cfg.totalSessionTokens || 0) + total;
                                incrementTokenStats(entry, cfg, total);
                                saveKeysConfig(cfg);
                            }
                        }
                    }
                }
            }
        },
        "chat.params": async (input, output) => {
            const cfg = loadKeysConfig();
            const pID = (input.model as any)?.providerID || "";
            const bURL = (input as any).provider?.options?.baseURL || "";
            const provider = detectProviderFromID(pID) || detectProviderFromBaseURL(bURL);
            if (!provider) return;
            const available = getAvailableKeysForProvider(provider);
            const chosen = pickKey(available, cfg.strategy);
            if (!chosen) return;
            activeSessionKeys.set(input.sessionID, chosen.label);
            output.options["apiKey"] = chosen.key;
            chosen.requestCount++;
            cfg.totalSessionRequests++;
            incrementUsageStats(chosen, cfg);
            chosen.totalSuccesses++;
            chosen.lastUsed = Date.now();
            saveKeysConfig(cfg);
        },
        "chat.headers": async (input, output) => {
            const cfg = loadKeysConfig();
            const provider = detectProviderFromID(input.model?.providerID || "") || "ollama";
            const available = getAvailableKeysForProvider(provider);
            const chosen = pickKey(available, cfg.strategy);
            if (chosen) {
                activeSessionKeys.set(input.sessionID, chosen.label);
                output.headers["Authorization"] = `Bearer ${chosen.key}`;
            }
        },
        // Tools
        tool: {
            key_rotation_status: tool({
                description: "Status of keys and usage",
                args: {},
                async execute() {
                    const cfg = loadKeysConfig();
                    let res = `## Key Rotation (Portable)\nConfig: ${KEYS_FILE}\nStrategy: ${cfg.strategy}\n\n`;
                    for (const k of cfg.keys) {
                        res += `- [${k.provider}] ${k.label}: ${k.enabled ? "OK" : "DISABLED"} | tokens: ${k.totalTokens || 0} | reqs: ${k.requestCount}\n`;
                    }
                    return res;
                }
            })
        }
    };
};

export default KeyRotationServer;

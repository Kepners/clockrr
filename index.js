#!/usr/bin/env node

const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const express = require('express')

// =============================================================================
// CONFIGURATION DEFAULTS
// =============================================================================
const DEFAULTS = {
    timeFormat: '24h',        // '24h' or '12h'
    flashDurationSec: 10,     // seconds clock is visible
    repeatIntervalSec: 60,    // seconds between flashes
    mode: 'flash'             // 'flash', 'always-on', 'subliminal'
}

// =============================================================================
// MANIFEST
// =============================================================================
const manifest = {
    id: 'com.kepners.flashclock',
    version: '1.0.0',
    name: '🕒 Flash Clock (Top Right)',
    description: 'Digital clock overlay via subtitles - flashes current time briefly, then disappears. Perfect for checking time when pausing.',
    logo: 'https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico',
    background: '#524948',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    },
    config: [
        {
            key: 'timeFormat',
            type: 'select',
            title: 'Time Format',
            options: ['24h', '12h'],
            default: '24h'
        },
        {
            key: 'flashDurationSec',
            type: 'select',
            title: 'Flash Duration (seconds)',
            options: ['3', '5', '10', '15', '30', '60'],
            default: '10'
        },
        {
            key: 'repeatIntervalSec',
            type: 'select',
            title: 'Repeat Interval (seconds)',
            options: ['10', '20', '30', '60', '120', '300'],
            default: '60'
        },
        {
            key: 'mode',
            type: 'select',
            title: 'Display Mode',
            options: ['flash', 'always-on', 'subliminal'],
            default: 'flash'
        }
    ]
}

const builder = new addonBuilder(manifest)

// =============================================================================
// SIMPLE CACHE
// =============================================================================
const cache = new Map()
const CACHE_TTL_MS = 30000 // 30 seconds

function getCacheKey(config) {
    return JSON.stringify(config)
}

function getCachedVTT(config) {
    const key = getCacheKey(config)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.vtt
    }
    return null
}

function setCachedVTT(config, vtt) {
    const key = getCacheKey(config)
    cache.set(key, { vtt, timestamp: Date.now() })

    // Clean old entries
    if (cache.size > 100) {
        const now = Date.now()
        for (const [k, v] of cache.entries()) {
            if (now - v.timestamp > CACHE_TTL_MS) {
                cache.delete(k)
            }
        }
    }
}

// =============================================================================
// TIME FORMATTING
// =============================================================================
function formatTime(date, format) {
    const hours = date.getHours()
    const minutes = date.getMinutes()

    if (format === '12h') {
        const h12 = hours % 12 || 12
        const ampm = hours < 12 ? 'AM' : 'PM'
        return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function formatVTTTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const ms = Math.floor((totalSeconds % 1) * 1000)

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

// =============================================================================
// WEBVTT GENERATION
// =============================================================================
function generateWebVTT(config, baseTime) {
    const {
        timeFormat = DEFAULTS.timeFormat,
        flashDurationSec = DEFAULTS.flashDurationSec,
        repeatIntervalSec = DEFAULTS.repeatIntervalSec,
        mode = DEFAULTS.mode
    } = config

    const flashDuration = parseInt(flashDurationSec, 10)
    const repeatInterval = parseInt(repeatIntervalSec, 10)

    let vtt = 'WEBVTT\n\n'

    // Generate cues based on mode
    const totalSeconds = 12 * 60 * 60 // 12 hours
    let cueIndex = 1

    if (mode === 'always-on') {
        // ALWAYS-ON MODE: Clock visible every second, continuously
        // Lower opacity recommended (30%) so it's subtle during playback
        for (let t = 0; t < totalSeconds; t += 1) {
            const startTime = t
            const endTime = t + 1

            const cueDate = new Date(baseTime.getTime() + (t * 1000))
            const timeText = formatTime(cueDate, timeFormat)

            vtt += `${cueIndex}\n`
            vtt += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)} line:5% position:95% align:end\n`
            vtt += `${timeText}\n\n`

            cueIndex++
        }
    } else if (mode === 'subliminal') {
        // SUBLIMINAL MODE: Very short cue (50ms) every second
        // Invisible during playback, might be visible when paused
        for (let t = 0; t < totalSeconds; t += 1) {
            const startTime = t
            const endTime = t + 0.05 // 50 milliseconds

            const cueDate = new Date(baseTime.getTime() + (t * 1000))
            const timeText = formatTime(cueDate, timeFormat)

            vtt += `${cueIndex}\n`
            vtt += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)} line:5% position:95% align:end\n`
            vtt += `${timeText}\n\n`

            cueIndex++
        }
    } else {
        // FLASH MODE (default): On for X seconds, off until next interval
        for (let t = 0; t < totalSeconds; t += repeatInterval) {
            const startTime = t
            const endTime = t + flashDuration

            const cueDate = new Date(baseTime.getTime() + (t * 1000))
            const timeText = formatTime(cueDate, timeFormat)

            vtt += `${cueIndex}\n`
            vtt += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)} line:5% position:95% align:end\n`
            vtt += `${timeText}\n\n`

            cueIndex++
        }
    }

    return vtt
}

// =============================================================================
// PARSE CONFIG FROM URL
// =============================================================================
function parseConfig(configStr) {
    if (!configStr) return {}

    try {
        return JSON.parse(Buffer.from(configStr, 'base64').toString('utf-8'))
    } catch {
        // Try URL-encoded JSON
        try {
            return JSON.parse(decodeURIComponent(configStr))
        } catch {
            return {}
        }
    }
}

function encodeConfig(config) {
    return Buffer.from(JSON.stringify(config)).toString('base64')
}

// =============================================================================
// SUBTITLES HANDLER
// =============================================================================
const PORT = process.env.PORT || 7000

builder.defineSubtitlesHandler(({ type, id, config }) => {
    console.log(`[Flash Clock] Subtitles request: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return Promise.resolve({ subtitles: [] })
    }

    // Build the config for the VTT URL
    const userConfig = config || {}
    const cfgEncoded = encodeConfig({
        timeFormat: userConfig.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: userConfig.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: userConfig.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: userConfig.mode || DEFAULTS.mode
    })

    // Get the addon base URL (auto-detect Vercel deployment)
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.ADDON_URL || `http://localhost:${PORT}`)

    return Promise.resolve({
        subtitles: [
            {
                id: 'flashclock-time',
                lang: 'eng',
                label: '🕒 Flash Clock (Top Right)',
                url: `${baseUrl}/flashclock.vtt?cfg=${cfgEncoded}`
            }
        ]
    })
})

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================
const app = express()

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200)
    }
    next()
})

// =============================================================================
// LANDING PAGE
// =============================================================================
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flash Clock - Stremio Addon</title>
    <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #524948 0%, #3a3433 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #fff;
        }
        .container {
            text-align: center;
            max-width: 600px;
        }
        .logo {
            width: 120px;
            height: 120px;
            margin-bottom: 24px;
            filter: drop-shadow(0 8px 24px rgba(0,0,0,0.3));
        }
        h1 {
            font-size: 48px;
            margin-bottom: 12px;
            text-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .tagline {
            font-size: 20px;
            opacity: 0.9;
            margin-bottom: 32px;
        }
        .features {
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 32px;
            text-align: left;
        }
        .features h3 {
            margin-bottom: 16px;
            font-size: 18px;
        }
        .features ul {
            list-style: none;
            padding: 0;
        }
        .features li {
            padding: 8px 0;
            padding-left: 28px;
            position: relative;
        }
        .features li::before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #70F8BA;
            font-weight: bold;
        }
        .buttons {
            display: flex;
            gap: 16px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .btn {
            display: inline-block;
            padding: 16px 32px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .btn-primary {
            background: linear-gradient(135deg, #70F8BA 0%, #CAFE48 100%);
            color: #333;
            box-shadow: 0 8px 24px rgba(112, 248, 186, 0.3);
        }
        .btn-secondary {
            background: rgba(255,255,255,0.15);
            color: #fff;
            border: 2px solid rgba(255,255,255,0.3);
        }
        .footer {
            margin-top: 48px;
            opacity: 0.6;
            font-size: 14px;
        }
        .footer a {
            color: #7CB4B8;
        }
    </style>
</head>
<body>
    <div class="container">
        <img src="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico" alt="Flash Clock" class="logo">
        <h1>🕒 Flash Clock</h1>
        <p class="tagline">See the real time while watching - via subtitle overlay</p>

        <div class="features">
            <h3>Features</h3>
            <ul>
                <li>Shows current time in top-right corner</li>
                <li>Flash mode - appears briefly, then disappears</li>
                <li>Always-on mode for continuous display</li>
                <li>12h or 24h time format</li>
                <li>Configurable flash duration & interval</li>
                <li>Works with movies & TV shows</li>
            </ul>
        </div>

        <div class="buttons">
            <a href="stremio://clockrr.vercel.app/manifest.json" class="btn btn-primary">Install Addon</a>
            <a href="/configure" class="btn btn-secondary">Configure</a>
        </div>

        <p class="footer">
            Open source on <a href="https://github.com/Kepners/clockrr" target="_blank">GitHub</a>
        </p>
    </div>
</body>
</html>`)
})

// WebVTT endpoint - must be before addon router
app.get('/flashclock.vtt', (req, res) => {
    const config = parseConfig(req.query.cfg)
    const baseTime = new Date()

    // Check cache
    let vtt = getCachedVTT(config)
    if (!vtt) {
        vtt = generateWebVTT(config, baseTime)
        setCachedVTT(config, vtt)
    }

    res.set({
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=30'
    })
    res.send(vtt)
})

// =============================================================================
// CONFIGURE PAGE (Torrentio-style)
// =============================================================================
function getConfigureHTML(currentConfig = {}) {
    const config = {
        timeFormat: currentConfig.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: currentConfig.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: currentConfig.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: currentConfig.mode || DEFAULTS.mode
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flash Clock - Configure</title>
    <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #524948 0%, #3a3433 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #fff;
            border-radius: 16px;
            padding: 32px;
            max-width: 420px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #57467B;
            font-size: 24px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 24px;
        }
        .option-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 14px;
        }
        select {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            background: #fff;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        select:focus {
            outline: none;
            border-color: #57467B;
        }
        .install-btn {
            display: block;
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #57467B 0%, #7CB4B8 100%);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            margin-top: 24px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .install-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(87, 70, 123, 0.4);
        }
        .note {
            margin-top: 16px;
            padding: 12px;
            background: #f5f5f5;
            border-radius: 8px;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🕒 Flash Clock</h1>
        <p class="subtitle">Configure your clock overlay settings</p>

        <div class="option-group">
            <label>Time Format</label>
            <select id="timeFormat" onchange="updateLink()">
                <option value="24h" ${config.timeFormat === '24h' ? 'selected' : ''}>24-hour (14:30)</option>
                <option value="12h" ${config.timeFormat === '12h' ? 'selected' : ''}>12-hour (2:30 PM)</option>
            </select>
        </div>

        <div class="option-group">
            <label>Display Mode</label>
            <select id="mode" onchange="updateLink()">
                <option value="flash" ${config.mode === 'flash' ? 'selected' : ''}>Flash (shows briefly, then hides)</option>
                <option value="always-on" ${config.mode === 'always-on' ? 'selected' : ''}>Always On (continuous)</option>
                <option value="subliminal" ${config.mode === 'subliminal' ? 'selected' : ''}>Subliminal (50ms flash)</option>
            </select>
        </div>

        <div class="option-group" id="flashOptions">
            <label>Flash Duration</label>
            <select id="flashDurationSec" onchange="updateLink()">
                <option value="3" ${config.flashDurationSec === '3' ? 'selected' : ''}>3 seconds</option>
                <option value="5" ${config.flashDurationSec === '5' ? 'selected' : ''}>5 seconds</option>
                <option value="10" ${config.flashDurationSec == '10' ? 'selected' : ''}>10 seconds</option>
                <option value="15" ${config.flashDurationSec === '15' ? 'selected' : ''}>15 seconds</option>
                <option value="30" ${config.flashDurationSec === '30' ? 'selected' : ''}>30 seconds</option>
                <option value="60" ${config.flashDurationSec === '60' ? 'selected' : ''}>60 seconds</option>
            </select>
        </div>

        <div class="option-group" id="intervalOptions">
            <label>Repeat Interval</label>
            <select id="repeatIntervalSec" onchange="updateLink()">
                <option value="10" ${config.repeatIntervalSec === '10' ? 'selected' : ''}>Every 10 seconds</option>
                <option value="20" ${config.repeatIntervalSec === '20' ? 'selected' : ''}>Every 20 seconds</option>
                <option value="30" ${config.repeatIntervalSec === '30' ? 'selected' : ''}>Every 30 seconds</option>
                <option value="60" ${config.repeatIntervalSec == '60' ? 'selected' : ''}>Every 60 seconds</option>
                <option value="120" ${config.repeatIntervalSec === '120' ? 'selected' : ''}>Every 2 minutes</option>
                <option value="300" ${config.repeatIntervalSec === '300' ? 'selected' : ''}>Every 5 minutes</option>
            </select>
        </div>

        <a id="installLink" class="install-btn" href="#">Install Addon</a>

        <p class="note">Clicking Install will update your existing addon configuration</p>
    </div>

    <script>
        function updateLink() {
            const mode = document.getElementById('mode').value;
            const flashOpts = document.getElementById('flashOptions');
            const intervalOpts = document.getElementById('intervalOptions');

            // Show/hide flash-specific options
            if (mode === 'flash') {
                flashOpts.style.display = 'block';
                intervalOpts.style.display = 'block';
            } else {
                flashOpts.style.display = 'none';
                intervalOpts.style.display = 'none';
            }

            const config = {
                timeFormat: document.getElementById('timeFormat').value,
                mode: mode,
                flashDurationSec: document.getElementById('flashDurationSec').value,
                repeatIntervalSec: document.getElementById('repeatIntervalSec').value
            };

            const configStr = btoa(JSON.stringify(config));
            const host = window.location.host;
            const protocol = window.location.protocol;

            // Use stremio:// protocol for install
            document.getElementById('installLink').href = 'stremio://' + host + '/' + configStr + '/manifest.json';
        }

        // Initialize on load
        updateLink();
    </script>
</body>
</html>`
}

// Configure page routes
app.get('/configure', (req, res) => {
    res.send(getConfigureHTML({}))
})

app.get('/:config/configure', (req, res) => {
    const config = parseConfig(req.params.config)
    res.send(getConfigureHTML(config))
})

// =============================================================================
// CONFIG-BASED MANIFEST ROUTES (Torrentio-style)
// =============================================================================
app.get('/:config/manifest.json', (req, res) => {
    const config = parseConfig(req.params.config)

    // Return manifest with config embedded
    const configuredManifest = {
        ...manifest,
        // Pass config to handlers via query params in resource URLs
        behaviorHints: {
            ...manifest.behaviorHints,
            configurable: true,
            configurationRequired: false
        }
    }

    res.json(configuredManifest)
})

// Config-based subtitles endpoint
app.get('/:config/subtitles/:type/:id.json', (req, res) => {
    const { config: configStr, type, id } = req.params
    const config = parseConfig(configStr)

    console.log(`[Flash Clock] Config subtitles: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return res.json({ subtitles: [] })
    }

    const cfgEncoded = encodeConfig({
        timeFormat: config.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: config.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: config.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: config.mode || DEFAULTS.mode
    })

    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.ADDON_URL || `http://localhost:${PORT}`)

    res.json({
        subtitles: [
            {
                id: 'flashclock-time',
                lang: 'eng',
                label: '🕒 Flash Clock (Top Right)',
                url: `${baseUrl}/flashclock.vtt?cfg=${cfgEncoded}`
            }
        ]
    })
})

// Mount Stremio addon router (for base install without config)
app.use(getRouter(builder.getInterface()))

// Export for Vercel serverless
module.exports = app

// Start server if running locally (not in Vercel)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║              🕒 FLASH CLOCK (TOP RIGHT)                           ║
║         Stremio Subtitle Clock Addon Running                      ║
╠═══════════════════════════════════════════════════════════════════╣
║  Manifest:   http://localhost:${PORT}/manifest.json                  ║
║  Install:    stremio://localhost:${PORT}/manifest.json               ║
║  VTT Test:   http://localhost:${PORT}/flashclock.vtt                 ║
╠═══════════════════════════════════════════════════════════════════╣
║  Config Options:                                                  ║
║    - Time Format: 24h / 12h                                       ║
║    - Flash Duration: 5 / 10 / 15 seconds                          ║
║    - Repeat Interval: 30 / 60 / 120 seconds                       ║
║    - Opacity: 30% / 50% / 70% / 100%                              ║
║    - Text Size: small / medium / large                            ║
║    - Shadow: yes / no                                             ║
║    - Mode: flash / always-on / subliminal                         ║
╠═══════════════════════════════════════════════════════════════════╣
║  MODES:                                                           ║
║    flash     = On for X sec, off for Y sec (default)              ║
║    always-on = Clock visible continuously (use 30% opacity)       ║
║    subliminal= 50ms cue every second (test for pause visibility)  ║
╚═══════════════════════════════════════════════════════════════════╝
`)
    })
}

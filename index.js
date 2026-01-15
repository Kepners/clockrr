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

// Configure page - HTML UI for addon settings
app.get('/configure', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🕒 Flash Clock - Configure</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #524948 0%, #57467B 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
            background: rgba(0,0,0,0.3);
            border-radius: 16px;
            padding: 30px;
        }
        h1 { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 48px; text-align: center; margin-bottom: 10px; }
        label { display: block; margin-bottom: 5px; font-weight: 600; }
        select {
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            border: none;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 16px;
            margin-bottom: 20px;
        }
        select option { background: #524948; }
        .btn {
            display: block;
            width: 100%;
            padding: 15px;
            background: #70F8BA;
            color: #524948;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
        }
        .btn:hover { background: #CAFE48; }
        .info { text-align: center; margin-top: 20px; font-size: 14px; opacity: 0.8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🕒</div>
        <h1>Flash Clock</h1>

        <label>Display Mode</label>
        <select id="mode">
            <option value="flash">Flash (on/off intervals)</option>
            <option value="always-on">Always On (continuous)</option>
            <option value="subliminal">Subliminal (50ms pulses)</option>
        </select>

        <label>Time Format</label>
        <select id="timeFormat">
            <option value="24h">24 Hour</option>
            <option value="12h">12 Hour (AM/PM)</option>
        </select>

        <label>Flash Duration (flash mode only)</label>
        <select id="flashDurationSec">
            <option value="3">3 seconds</option>
            <option value="5">5 seconds</option>
            <option value="10" selected>10 seconds</option>
            <option value="15">15 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">60 seconds (always on for 1 min)</option>
        </select>

        <label>Repeat Interval (flash mode only)</label>
        <select id="repeatIntervalSec">
            <option value="10">Every 10 seconds</option>
            <option value="20">Every 20 seconds</option>
            <option value="30">Every 30 seconds</option>
            <option value="60" selected>Every 60 seconds</option>
            <option value="120">Every 2 minutes</option>
            <option value="300">Every 5 minutes</option>
        </select>

        <button class="btn" onclick="install()">Install Addon</button>
        <button class="btn" style="background:#7CB4B8;margin-top:10px" onclick="copyUrl()">Copy Install URL</button>
        <input type="text" id="urlDisplay" readonly style="width:100%;padding:10px;margin-top:10px;border-radius:8px;border:none;background:rgba(255,255,255,0.1);color:#70F8BA;font-size:12px;display:none">

        <p class="info">For Stremio Desktop: Click "Copy Install URL" and paste in Settings → Addons → "Install from URL"</p>
    </div>

    <script>
        function install() {
            const config = {
                mode: document.getElementById('mode').value,
                timeFormat: document.getElementById('timeFormat').value,
                flashDurationSec: document.getElementById('flashDurationSec').value,
                repeatIntervalSec: document.getElementById('repeatIntervalSec').value
            };
            const encoded = btoa(JSON.stringify(config));
            const url = 'stremio://' + window.location.host + '/' + encoded + '/manifest.json';
            window.location.href = url;
        }
        function copyUrl() {
            const config = {
                mode: document.getElementById('mode').value,
                timeFormat: document.getElementById('timeFormat').value,
                flashDurationSec: document.getElementById('flashDurationSec').value,
                repeatIntervalSec: document.getElementById('repeatIntervalSec').value
            };
            const encoded = btoa(JSON.stringify(config));
            const url = window.location.protocol + '//' + window.location.host + '/' + encoded + '/manifest.json';
            const input = document.getElementById('urlDisplay');
            input.value = url;
            input.style.display = 'block';
            navigator.clipboard.writeText(url).then(() => {
                alert('URL copied! Paste it in Stremio Desktop: Settings → Addons → Install from URL');
            });
        }
    </script>
</body>
</html>`;
    res.type('html').send(html);
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

// Mount Stremio addon router
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

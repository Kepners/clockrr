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
    <meta name="description" content="See the real time while watching movies and TV shows. Flash Clock adds a subtle clock overlay via subtitles.">
    <meta property="og:title" content="Flash Clock - Stremio Addon">
    <meta property="og:description" content="See the real time while watching - via subtitle overlay">
    <meta property="og:image" content="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --taupe: #524948;
            --grape: #57467B;
            --teal: #7CB4B8;
            --mint: #70F8BA;
            --chartreuse: #CAFE48;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--taupe);
            min-height: 100vh;
            color: #fff;
            overflow-x: hidden;
        }

        /* Animated background */
        .bg-gradient {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background:
                radial-gradient(ellipse at 20% 20%, rgba(87, 70, 123, 0.4) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, rgba(124, 180, 184, 0.3) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(112, 248, 186, 0.1) 0%, transparent 70%),
                linear-gradient(180deg, #524948 0%, #3a3433 100%);
            z-index: -1;
        }

        .bg-grid {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image:
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: -1;
        }

        /* Floating particles */
        .particles {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: -1;
            overflow: hidden;
        }

        .particle {
            position: absolute;
            width: 4px;
            height: 4px;
            background: var(--mint);
            border-radius: 50%;
            opacity: 0.3;
            animation: float 20s infinite ease-in-out;
        }

        .particle:nth-child(1) { left: 10%; animation-delay: 0s; animation-duration: 25s; }
        .particle:nth-child(2) { left: 20%; animation-delay: 2s; animation-duration: 20s; }
        .particle:nth-child(3) { left: 30%; animation-delay: 4s; animation-duration: 28s; }
        .particle:nth-child(4) { left: 40%; animation-delay: 1s; animation-duration: 22s; }
        .particle:nth-child(5) { left: 50%; animation-delay: 3s; animation-duration: 24s; }
        .particle:nth-child(6) { left: 60%; animation-delay: 5s; animation-duration: 26s; }
        .particle:nth-child(7) { left: 70%; animation-delay: 2s; animation-duration: 21s; }
        .particle:nth-child(8) { left: 80%; animation-delay: 4s; animation-duration: 27s; }
        .particle:nth-child(9) { left: 90%; animation-delay: 1s; animation-duration: 23s; }

        @keyframes float {
            0%, 100% { transform: translateY(100vh) scale(1); opacity: 0; }
            10% { opacity: 0.3; }
            90% { opacity: 0.3; }
            100% { transform: translateY(-100px) scale(1.5); opacity: 0; }
        }

        /* Main content */
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 60px 24px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        /* Hero section */
        .hero {
            text-align: center;
            margin-bottom: 64px;
        }

        .logo-wrapper {
            position: relative;
            display: inline-block;
            margin-bottom: 32px;
        }

        .logo {
            width: 140px;
            height: 140px;
            filter: drop-shadow(0 0 40px rgba(112, 248, 186, 0.4));
            animation: pulse 3s ease-in-out infinite;
        }

        .logo-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 200px;
            height: 200px;
            transform: translate(-50%, -50%);
            background: radial-gradient(circle, rgba(112, 248, 186, 0.3) 0%, transparent 70%);
            animation: glow 3s ease-in-out infinite;
            z-index: -1;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        @keyframes glow {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
            50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
        }

        h1 {
            font-size: 64px;
            font-weight: 800;
            margin-bottom: 16px;
            background: linear-gradient(135deg, #fff 0%, var(--teal) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -2px;
        }

        .tagline {
            font-size: 24px;
            font-weight: 400;
            opacity: 0.8;
            margin-bottom: 16px;
        }

        /* Live clock demo */
        .clock-demo {
            display: inline-block;
            font-family: 'JetBrains Mono', monospace;
            font-size: 48px;
            font-weight: 500;
            padding: 16px 32px;
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            border: 1px solid rgba(112, 248, 186, 0.3);
            color: var(--mint);
            text-shadow: 0 0 20px rgba(112, 248, 186, 0.5);
            margin-top: 24px;
            animation: clockPulse 1s ease-in-out infinite;
        }

        @keyframes clockPulse {
            0%, 100% { box-shadow: 0 0 20px rgba(112, 248, 186, 0.2); }
            50% { box-shadow: 0 0 40px rgba(112, 248, 186, 0.4); }
        }

        /* Features grid */
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-bottom: 64px;
        }

        .feature-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 28px;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        }

        .feature-card:hover {
            background: rgba(255,255,255,0.08);
            border-color: rgba(112, 248, 186, 0.3);
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }

        .feature-icon {
            font-size: 36px;
            margin-bottom: 16px;
        }

        .feature-card h3 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .feature-card p {
            font-size: 15px;
            opacity: 0.7;
            line-height: 1.6;
        }

        /* CTA section */
        .cta {
            text-align: center;
        }

        .buttons {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 32px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 18px 36px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--mint) 0%, var(--chartreuse) 100%);
            color: #1a1a1a;
            box-shadow: 0 8px 32px rgba(112, 248, 186, 0.4);
        }

        .btn-primary:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 12px 40px rgba(112, 248, 186, 0.5);
        }

        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #fff;
            border: 2px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
        }

        .btn-secondary:hover {
            background: rgba(255,255,255,0.15);
            border-color: var(--teal);
            transform: translateY(-3px);
        }

        /* Footer */
        .footer {
            text-align: center;
            padding-top: 48px;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 48px;
        }

        .footer p {
            opacity: 0.5;
            font-size: 14px;
        }

        .footer a {
            color: var(--teal);
            text-decoration: none;
            transition: color 0.2s;
        }

        .footer a:hover {
            color: var(--mint);
        }

        .made-with {
            margin-top: 12px;
            font-size: 13px;
            opacity: 0.4;
        }

        /* Responsive */
        @media (max-width: 768px) {
            h1 { font-size: 40px; }
            .tagline { font-size: 18px; }
            .clock-demo { font-size: 32px; padding: 12px 24px; }
            .container { padding: 40px 20px; }
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>
    <div class="bg-grid"></div>
    <div class="particles">
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
    </div>

    <div class="container">
        <div class="hero">
            <div class="logo-wrapper">
                <div class="logo-glow"></div>
                <img src="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico" alt="Flash Clock" class="logo">
            </div>
            <h1>Flash Clock</h1>
            <p class="tagline">Know the time without leaving your movie</p>
            <div class="clock-demo" id="liveClock">--:--:--</div>
        </div>

        <div class="features">
            <div class="feature-card">
                <div class="feature-icon">⚡</div>
                <h3>Flash Mode</h3>
                <p>Clock appears briefly then disappears. Perfect for a quick glance without distraction.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">👁️</div>
                <h3>Always-On Mode</h3>
                <p>Keep the clock visible continuously in the corner. Great for time-sensitive viewing.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🎨</div>
                <h3>Fully Configurable</h3>
                <p>Choose 12h or 24h format, flash duration, repeat interval, and display mode.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🎬</div>
                <h3>Works Everywhere</h3>
                <p>Compatible with all movies and TV shows in Stremio. Uses subtitle overlay technology.</p>
            </div>
        </div>

        <div class="cta">
            <div class="buttons">
                <a href="stremio://clockrr.vercel.app/manifest.json" class="btn btn-primary">
                    <span>⬇️</span> Install in Stremio
                </a>
                <a href="/configure" class="btn btn-secondary">
                    <span>⚙️</span> Configure Settings
                </a>
            </div>
        </div>

        <div class="footer">
            <p>Open source on <a href="https://github.com/Kepners/clockrr" target="_blank">GitHub</a></p>
            <p class="made-with">Made for Stremio</p>
        </div>
    </div>

    <script>
        function updateClock() {
            const now = new Date();
            const h = now.getHours().toString().padStart(2, '0');
            const m = now.getMinutes().toString().padStart(2, '0');
            const s = now.getSeconds().toString().padStart(2, '0');
            document.getElementById('liveClock').textContent = h + ':' + m + ':' + s;
        }
        updateClock();
        setInterval(updateClock, 1000);
    </script>
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

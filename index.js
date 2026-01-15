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

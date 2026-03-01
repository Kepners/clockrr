#!/usr/bin/env node

try {
    require('dotenv').config({ path: '.env.local' })
    require('dotenv').config()
} catch (_err) {
    // Optional in production when dotenv is not installed.
}

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
    name: '🕒 Clockrr (Top Right)',
    description: 'Digital clock overlay via subtitles - flashes current time briefly, then disappears. Perfect for checking time when pausing.',
    logo: 'https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico',
    background: '#524948',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    catalogs: [],
    stremioAddonsConfig: {
        issuer: 'https://stremio-addons.net',
        signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..KgLtKC1PoD-j8qhI-KhRfA.rkzlJ3SK6rpY8yodw_4v-VhzbTyowuzeBUzjtduBcUNyzumYeqX-RKeHLfrNcelbLtDxQOWLpbGBkSUy9HAoOkJ8K4jU1IrTq_-SFB18QCBCmgc81BVutdVIayMPQ-2_.R1oeS6DraLHhHFwwzRhdPA'
    },
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

// Returns current time bucketed to the minute (YYYYMMDDHHMM)
// All requests within the same minute share the same VTT URL → CDN cache hit
function getTimeBucket(date) {
    const d = date || new Date()
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`
}

// Parse a YYYYMMDDHHMM bucket string back to a Date
function parseBucketTime(bucket) {
    if (!bucket || bucket.length !== 12) return new Date()
    return new Date(
        parseInt(bucket.slice(0, 4)),
        parseInt(bucket.slice(4, 6)) - 1,
        parseInt(bucket.slice(6, 8)),
        parseInt(bucket.slice(8, 10)),
        parseInt(bucket.slice(10, 12)),
        0
    )
}

// =============================================================================
// SUPABASE ANALYTICS (fire-and-forget)
// =============================================================================
function getSupabaseWriteKey() {
    return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
}

function getSupabaseReadKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
}

function trackView(contentId, contentType) {
    const url = process.env.SUPABASE_URL
    const key = getSupabaseWriteKey()
    if (!url || !key || !contentId) return

    fetch(`${url}/rest/v1/clockrr_views`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ content_id: contentId, content_type: contentType })
    }).catch(() => {}) // never block the response
}

const SUPABASE_PAGE_SIZE = 1000
const MAX_TOP_CONTENT = 20
const STATS_CACHE_TTL_MS = 15000
let statsCache = { timestamp: 0, payload: null }

function getSupabaseHeaders(key, withCount = false) {
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`
    }
    if (withCount) headers.Prefer = 'count=exact'
    return headers
}

function sortTopContentFromMap(counts) {
    return Array.from(counts.entries())
        .map(([id, value]) => ({
            id,
            type: value.type || 'movie',
            count: value.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_TOP_CONTENT)
}

async function fetchExactViewsCount(url, key, sinceIso) {
    const sinceFilter = encodeURIComponent(`gte.${sinceIso}`)
    const countUrl = `${url}/rest/v1/clockrr_views?select=id&created_at=${sinceFilter}&limit=1`
    const resp = await fetch(countUrl, {
        headers: getSupabaseHeaders(key, true)
    })
    if (!resp.ok) {
        throw new Error(`Count query failed (${resp.status})`)
    }

    const contentRange = resp.headers.get('content-range') || ''
    const totalStr = contentRange.includes('/') ? contentRange.split('/')[1] : ''
    const total = parseInt(totalStr, 10)
    if (Number.isFinite(total)) return total

    // Fallback: if count header is unavailable, fall back to response size
    const rows = await resp.json()
    return Array.isArray(rows) ? rows.length : 0
}

async function fetchTopContentViaAggregate(url, key, sinceIso) {
    const sinceFilter = encodeURIComponent(`gte.${sinceIso}`)
    const aggUrl = `${url}/rest/v1/clockrr_views?select=content_id,content_type,count:count(*)&created_at=${sinceFilter}&order=count.desc&limit=${MAX_TOP_CONTENT}`
    const resp = await fetch(aggUrl, {
        headers: getSupabaseHeaders(key)
    })
    if (!resp.ok) {
        throw new Error(`Aggregate query failed (${resp.status})`)
    }

    const rows = await resp.json()
    if (!Array.isArray(rows)) {
        throw new Error('Invalid aggregate response')
    }

    return rows
        .filter(row => row && row.content_id)
        .map(row => ({
            id: row.content_id,
            type: row.content_type || 'movie',
            count: Number(row.count) || 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_TOP_CONTENT)
}

async function fetchTopContentViaPaging(url, key, sinceIso, totalViews) {
    const sinceFilter = encodeURIComponent(`gte.${sinceIso}`)
    const counts = new Map()
    let offset = 0

    while (true) {
        const pageUrl = `${url}/rest/v1/clockrr_views?select=content_id,content_type&created_at=${sinceFilter}&limit=${SUPABASE_PAGE_SIZE}&offset=${offset}`
        const resp = await fetch(pageUrl, {
            headers: getSupabaseHeaders(key)
        })
        if (!resp.ok) {
            throw new Error(`Paged query failed (${resp.status})`)
        }

        const rows = await resp.json()
        if (!Array.isArray(rows) || rows.length === 0) break

        for (const row of rows) {
            if (!row || !row.content_id) continue
            const existing = counts.get(row.content_id) || { count: 0, type: row.content_type }
            existing.count += 1
            if (!existing.type && row.content_type) existing.type = row.content_type
            counts.set(row.content_id, existing)
        }

        offset += rows.length
        if (rows.length < SUPABASE_PAGE_SIZE) break
        if (totalViews && offset >= totalViews) break
    }

    return sortTopContentFromMap(counts)
}

// =============================================================================
// SUBTITLES HANDLER
// =============================================================================
const PORT = process.env.PORT || 7000

builder.defineSubtitlesHandler(({ type, id, config }) => {
    console.log(`[Clockrr] Subtitles request: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return Promise.resolve({ subtitles: [] })
    }

    trackView(id, type)

    // Build the config for the VTT URL
    const userConfig = config || {}
    const cfgEncoded = encodeConfig({
        timeFormat: userConfig.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: userConfig.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: userConfig.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: userConfig.mode || DEFAULTS.mode
    })

    // Get the addon base URL - ADDON_URL env var takes priority (works for both Vercel and Beamup)
    const baseUrl = process.env.ADDON_URL
        || (process.env.VERCEL ? 'https://clockrr.vercel.app' : `http://localhost:${PORT}`)

    const t = getTimeBucket()

    return Promise.resolve({
        subtitles: [
            {
                id: 'flashclock-time',
                lang: 'eng',
                label: '🕒 Clockrr (Top Right)',
                url: `${baseUrl}/flashclock.vtt?cfg=${cfgEncoded}&t=${t}`
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
    <title>Clockrr - Stremio Addon</title>
    <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico">
    <meta name="description" content="See the real time while watching movies and TV shows. Clockrr adds a clock overlay via subtitles - it gives you time.">
    <meta property="og:title" content="Clockrr - Stremio Addon">
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

        .top-actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 24px;
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

        .btn-coffee {
            display: inline-block;
            padding: 14px 28px;
            background: linear-gradient(135deg, #FFDD00 0%, #FF6600 100%);
            color: #1a1a1a;
            font-weight: 700;
            font-size: 16px;
            text-decoration: none;
            border-radius: 10px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 16px rgba(255, 102, 0, 0.3);
        }

        .btn-coffee:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(255, 102, 0, 0.5);
        }

        .made-with {
            margin-top: 12px;
            font-size: 13px;
            opacity: 0.4;
        }

        /* Leaderboard */
        .leaderboard {
            margin: 60px 0 20px;
        }

        .leaderboard h2 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 6px;
            color: #fff;
        }

        .leaderboard-subtitle {
            font-size: 14px;
            color: rgba(255,255,255,0.5);
            margin-bottom: 24px;
        }

        .leaderboard-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .lb-item {
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 14px 18px;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s;
        }

        .lb-item:hover {
            background: rgba(112, 248, 186, 0.08);
            border-color: rgba(112, 248, 186, 0.3);
            transform: translateX(4px);
        }

        .lb-rank {
            font-size: 13px;
            font-weight: 700;
            color: rgba(255,255,255,0.3);
            width: 24px;
            text-align: center;
            flex-shrink: 0;
        }

        .lb-rank.top3 {
            color: var(--chartreuse);
        }

        .lb-info {
            flex: 1;
            min-width: 0;
        }

        .lb-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            color: var(--mint);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lb-type {
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
        }

        .lb-count {
            font-size: 13px;
            font-weight: 600;
            color: var(--teal);
            flex-shrink: 0;
        }

        .lb-loading {
            text-align: center;
            padding: 30px;
            color: rgba(255,255,255,0.3);
            font-size: 14px;
        }

        .lb-empty {
            text-align: center;
            padding: 30px;
            color: rgba(255,255,255,0.3);
            font-size: 14px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            h1 { font-size: 40px; }
            .tagline { font-size: 18px; }
            .clock-demo { font-size: 32px; padding: 12px 24px; }
            .container { padding: 40px 20px; }
            .top-actions { justify-content: center; margin-bottom: 16px; }
            .leaderboard-list { grid-template-columns: 1fr; }
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
        <div class="top-actions">
            <a href="https://buymeacoffee.com/kepners" target="_blank" class="btn-coffee">
                ☕ Buy Me a Coffee
            </a>
        </div>
        <div class="hero">
            <div class="logo-wrapper">
                <div class="logo-glow"></div>
                <img src="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico" alt="Clockrr" class="logo">
            </div>
            <h1>Clockrr</h1>
            <p class="tagline">It gives you time. Every OS. Every screen.</p>
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
                <div class="feature-icon">🌍</div>
                <h3>Every Platform</h3>
                <p>Windows, Mac, Linux, Android, iOS, Smart TVs - anywhere Stremio runs, Clockrr runs.</p>
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

        <div class="leaderboard">
            <h2>🔥 What People Are Watching</h2>
            <p class="leaderboard-subtitle">Most watched content with Clockrr in the last 30 days</p>
            <div class="leaderboard-list" id="lbList">
                <div class="lb-loading">Loading...</div>
            </div>
        </div>

        <div class="footer">
            <p style="margin-top: 20px;">Open source on <a href="https://github.com/Kepners/clockrr" target="_blank">GitHub</a></p>
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
        function loadLeaderboard() {
            fetch('/stats?ts=' + Date.now(), { cache: 'no-store' })
                .then(r => r.json())
                .then(data => {
                    const el = document.getElementById('lbList');
                    if (!data.top_content || data.top_content.length === 0) {
                        el.innerHTML = '<div class="lb-empty">No data yet - be the first to watch with Clockrr!</div>';
                        return;
                    }
                    el.innerHTML = data.top_content.slice(0, 10).map((item, i) => {
                        const rank = i + 1;
                        const isImdb = item.id && item.id.startsWith('tt');
                        const href = isImdb ? 'https://www.imdb.com/title/' + item.id + '/' : '#';
                        const target = isImdb ? ' target="_blank" rel="noopener"' : '';
                        return '<a href="' + href + '" class="lb-item"' + target + '>' +
                            '<div class="lb-rank' + (rank <= 3 ? ' top3' : '') + '">' + rank + '</div>' +
                            '<div class="lb-info">' +
                                '<div class="lb-id">' + item.id + '</div>' +
                                '<div class="lb-type">' + item.type + '</div>' +
                            '</div>' +
                            '<div class="lb-count">' + item.count + ' ' + (item.count === 1 ? 'view' : 'views') + '</div>' +
                        '</a>';
                    }).join('');
                })
                .catch(() => {
                    document.getElementById('lbList').innerHTML = '<div class="lb-empty">Stats unavailable</div>';
                });
        }

        loadLeaderboard();
        setInterval(loadLeaderboard, 15000);
    </script>
</body>
</html>`)
})

// WebVTT endpoint - must be before addon router
app.get('/flashclock.vtt', (req, res) => {
    const config = parseConfig(req.query.cfg)
    // Use the bucketed time from URL param so the same URL → same content → CDN cache hit
    const baseTime = parseBucketTime(req.query.t)

    // Check cache (keyed by config + time bucket)
    const cacheConfig = { ...config, _t: req.query.t }
    let vtt = getCachedVTT(cacheConfig)
    if (!vtt) {
        vtt = generateWebVTT(config, baseTime)
        setCachedVTT(cacheConfig, vtt)
    }

    res.set({
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
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
    <title>Clockrr - Configure</title>
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
        <h1>🕒 Clockrr</h1>
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

    console.log(`[Clockrr] Config subtitles: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return res.json({ subtitles: [] })
    }

    trackView(id, type)

    const cfgEncoded = encodeConfig({
        timeFormat: config.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: config.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: config.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: config.mode || DEFAULTS.mode
    })

    const baseUrl = process.env.ADDON_URL
        || (process.env.VERCEL ? 'https://clockrr.vercel.app' : `http://localhost:${PORT}`)

    const t = getTimeBucket()

    res.json({
        subtitles: [
            {
                id: 'flashclock-time',
                lang: 'eng',
                label: '🕒 Clockrr (Top Right)',
                url: `${baseUrl}/flashclock.vtt?cfg=${cfgEncoded}&t=${t}`
            }
        ]
    })
})

// =============================================================================
// STATS / LEADERBOARD ENDPOINT
// =============================================================================
app.get('/stats', async (req, res) => {
    const url = process.env.SUPABASE_URL
    const key = getSupabaseReadKey()

    if (!url || !key) {
        return res.json({ error: 'Analytics not configured' })
    }

    try {
        const now = Date.now()
        if (statsCache.payload && now - statsCache.timestamp < STATS_CACHE_TTL_MS) {
            res.set('Cache-Control', 'no-store')
            return res.json(statsCache.payload)
        }

        const generatedAt = new Date()
        const since = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const totalViews = await fetchExactViewsCount(url, key, since)

        let topContent = []
        if (totalViews > 0) {
            // Try DB-side aggregate first (fast, low bandwidth), fallback to paging if unavailable.
            try {
                topContent = await fetchTopContentViaAggregate(url, key, since)
            } catch {
                topContent = await fetchTopContentViaPaging(url, key, since, totalViews)
            }
        }

        const payload = {
            period: 'last_30_days',
            generated_at: generatedAt.toISOString(),
            total_views: totalViews,
            top_content: topContent
        }

        statsCache = { timestamp: now, payload }
        res.set('Cache-Control', 'no-store')
        res.json(payload)
    } catch (e) {
        res.json({ error: e.message })
    }
})

// =============================================================================
// LEADERBOARD HTML PAGE
// =============================================================================
app.get('/leaderboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clockrr Leaderboard - What People Are Watching</title>
    <link rel="icon" type="image/x-icon" href="https://raw.githubusercontent.com/Kepners/clockrr/master/logo.ico">
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
            font-family: 'Inter', -apple-system, sans-serif;
            background: linear-gradient(180deg, #524948 0%, #3a3433 100%);
            min-height: 100vh;
            color: #fff;
            padding: 40px 20px;
        }
        .wrap {
            max-width: 600px;
            margin: 0 auto;
        }
        .back {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: rgba(255,255,255,0.5);
            text-decoration: none;
            font-size: 14px;
            margin-bottom: 32px;
            transition: color 0.2s;
        }
        .back:hover { color: var(--mint); }
        h1 {
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 6px;
        }
        .subtitle {
            font-size: 14px;
            color: rgba(255,255,255,0.5);
            margin-bottom: 8px;
        }
        .total {
            font-size: 13px;
            color: var(--teal);
            margin-bottom: 32px;
        }
        .list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .item {
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 16px 20px;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s;
        }
        .item:hover {
            background: rgba(112, 248, 186, 0.08);
            border-color: rgba(112, 248, 186, 0.3);
            transform: translateX(4px);
        }
        .rank {
            font-size: 18px;
            font-weight: 800;
            width: 32px;
            text-align: center;
            flex-shrink: 0;
            color: rgba(255,255,255,0.25);
        }
        .rank.gold { color: #FFD700; }
        .rank.silver { color: #C0C0C0; }
        .rank.bronze { color: #CD7F32; }
        .info { flex: 1; min-width: 0; }
        .id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 15px;
            color: var(--mint);
        }
        .type {
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 3px;
        }
        .count {
            font-size: 14px;
            font-weight: 700;
            color: var(--teal);
            flex-shrink: 0;
        }
        .imdb-badge {
            font-size: 11px;
            background: #F5C518;
            color: #000;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            flex-shrink: 0;
        }
        .loading, .empty {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255,255,255,0.3);
        }
        .updated {
            text-align: center;
            margin-top: 32px;
            font-size: 12px;
            color: rgba(255,255,255,0.25);
        }
        @media (max-width: 768px) {
            .list { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <a href="/" class="back">← Back to Clockrr</a>
        <h1>🔥 What People Are Watching</h1>
        <p class="subtitle">Top content watched with the Clockrr overlay — last 30 days</p>
        <p class="total" id="totalViews"></p>
        <div class="list" id="list"><div class="loading">Loading...</div></div>
        <p class="updated" id="updated"></p>
    </div>
    <script>
        function loadStats() {
            fetch('/stats?ts=' + Date.now(), { cache: 'no-store' })
                .then(r => r.json())
                .then(data => {
                    if (data.total_views !== undefined) {
                        document.getElementById('totalViews').textContent = data.total_views.toLocaleString() + ' total views tracked';
                    }
                    const el = document.getElementById('list');
                    if (!data.top_content || data.top_content.length === 0) {
                        el.innerHTML = '<div class="empty">No data yet - be the first to watch with Clockrr!</div>';
                        return;
                    }
                    const ranks = ['gold', 'silver', 'bronze'];
                    el.innerHTML = data.top_content.map((item, i) => {
                        const rank = i + 1;
                        const isImdb = item.id && item.id.startsWith('tt');
                        const href = isImdb ? 'https://www.imdb.com/title/' + item.id + '/' : '#';
                        const target = isImdb ? ' target="_blank" rel="noopener"' : '';
                        const rankClass = ranks[i] || '';
                        const badge = isImdb ? '<span class="imdb-badge">IMDb</span>' : '';
                        return '<a href="' + href + '" class="item"' + target + '>' +
                            '<div class="rank ' + rankClass + '">' + rank + '</div>' +
                            '<div class="info">' +
                                '<div class="id">' + item.id + '</div>' +
                                '<div class="type">' + item.type + '</div>' +
                            '</div>' +
                            badge +
                            '<div class="count">' + item.count.toLocaleString() + ' ' + (item.count === 1 ? 'view' : 'views') + '</div>' +
                        '</a>';
                    }).join('');
                    document.getElementById('updated').textContent = 'Updated: ' + new Date().toLocaleString();
                })
                .catch(() => {
                    document.getElementById('list').innerHTML = '<div class="empty">Stats unavailable</div>';
                });
        }

        loadStats();
        setInterval(loadStats, 15000);
    </script>
</body>
</html>`)
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

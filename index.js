#!/usr/bin/env node

try {
    require('dotenv').config({ path: '.env.local' })
    require('dotenv').config()
} catch (_err) {
    // Optional in production when dotenv is not installed.
}

const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const express = require('express')
const crypto = require('crypto')

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
    return (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
}

function getSupabaseReadKey() {
    return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
}

function getSupabaseUrl() {
    return (process.env.SUPABASE_URL || '').trim()
}

function getClientIp(req) {
    if (!req) return ''

    const xForwardedFor = req.headers && req.headers['x-forwarded-for']
    if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
        return xForwardedFor.split(',')[0].trim()
    }

    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
        return String(xForwardedFor[0]).split(',')[0].trim()
    }

    const xRealIp = req.headers && req.headers['x-real-ip']
    if (typeof xRealIp === 'string' && xRealIp.trim()) {
        return xRealIp.trim()
    }

    if (req.socket && req.socket.remoteAddress) {
        return String(req.socket.remoteAddress)
    }

    return ''
}

function buildViewerKey(req) {
    if (!req) return null

    const ip = getClientIp(req)
    const userAgent = req.headers && req.headers['user-agent']
        ? String(req.headers['user-agent'])
        : ''

    if (!ip && !userAgent) return null

    const salt = process.env.VIEWER_KEY_SALT || 'clockrr'
    return crypto
        .createHash('sha256')
        .update(`${salt}|${ip}|${userAgent}`)
        .digest('hex')
        .slice(0, 32)
}

function trackView(contentId, contentType, viewerKey) {
    const url = getSupabaseUrl()
    const key = getSupabaseWriteKey()
    if (!url || !key || !contentId) return

    const postPayload = (payload) => fetch(`${url}/rest/v1/clockrr_views`, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
    })

    const payload = { content_id: contentId, content_type: contentType }
    if (viewerKey) payload.viewer_key = viewerKey

    postPayload(payload)
        .then(async resp => {
            if (resp.ok || !viewerKey) return
            const errorText = await resp.text().catch(() => '')
            if (errorText.includes('viewer_key')) {
                return postPayload({ content_id: contentId, content_type: contentType }).catch(() => {})
            }
        })
        .catch(() => {}) // never block the response
}

const SUPABASE_RECENT_SAMPLE_LIMIT = 5000
const SUPABASE_SAMPLE_PAGE_SIZE = 1000
const MAX_TOP_CONTENT = 20
const MAX_TOP_PER_TYPE = 10
const STATS_CACHE_TTL_MS = 15000
const ROLLING_WINDOWS = [
    { key: '24h', label: 'Last 24h' },
    { key: '7d', label: 'Last 7d' },
    { key: '30d', label: 'Last 30d' }
]
let statsCache = { timestamp: 0, payload: null }

function getSupabaseHeaders(key, countMode) {
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`
    }
    if (countMode) headers.Prefer = `count=${countMode}`
    return headers
}

function normalizeContentType(contentType) {
    return contentType === 'series' ? 'series' : 'movie'
}

function extractImdbId(contentId) {
    if (!contentId) return null
    const match = String(contentId).match(/tt\d+/i)
    return match ? match[0].toLowerCase() : null
}

function normalizeContentId(contentId, contentType) {
    if (!contentId) return ''
    const imdbId = extractImdbId(contentId)
    if (imdbId) return imdbId
    if (contentType === 'series') return String(contentId).split(':')[0]
    return String(contentId)
}

function getContentKey(type, id) {
    return `${type}:${id}`
}

function mergeContentCount(counts, rawId, rawType, increment = 1, viewerKey) {
    const type = normalizeContentType(rawType)
    const id = normalizeContentId(rawId, type)
    if (!id) return

    const key = getContentKey(type, id)
    const existing = counts.get(key) || {
        id,
        type,
        count: 0,
        _uniqueViewerKeys: new Set()
    }
    existing.count += Number(increment) || 0
    if (viewerKey) {
        existing._uniqueViewerKeys.add(String(viewerKey))
    }
    counts.set(key, existing)
}

function sortTopContentFromMap(counts, limit) {
    const sorted = Array.from(counts.values())
        .map(item => {
            const uniqueUsers = Number.isFinite(item.unique_users)
                ? item.unique_users
                : (item._uniqueViewerKeys ? item._uniqueViewerKeys.size : 0)
            const avgCallsPerUser = uniqueUsers > 0
                ? Number((item.count / uniqueUsers).toFixed(2))
                : null
            return {
                id: item.id,
                type: item.type,
                count: item.count,
                total_calls: item.count,
                unique_users: uniqueUsers,
                avg_calls_per_user: avgCallsPerUser
            }
        })
        .sort((a, b) => b.count - a.count)

    if (typeof limit === 'number') {
        return sorted.slice(0, limit)
    }
    return sorted
}

function pickTopByType(items, type, limit = MAX_TOP_PER_TYPE) {
    return items.filter(item => item.type === type).slice(0, limit)
}

function pickTopByUniqueUsers(items, limit = MAX_TOP_CONTENT) {
    return [...items]
        .sort((a, b) => {
            if (b.unique_users !== a.unique_users) return b.unique_users - a.unique_users
            return b.count - a.count
        })
        .slice(0, limit)
}

async function fetchExactViewsCount(url, key, sinceIso) {
    const sinceFilter = encodeURIComponent(`gte.${sinceIso}`)
    const countUrl = `${url}/rest/v1/clockrr_views?select=id&created_at=${sinceFilter}&limit=1`
    const resp = await fetch(countUrl, {
        headers: getSupabaseHeaders(key, 'planned')
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

async function fetchTopContentViaRpc(url, key, sinceIso) {
    const rpcUrl = `${url}/rest/v1/rpc/clockrr_title_stats`
    const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            ...getSupabaseHeaders(key),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ since_iso: sinceIso })
    })

    if (!resp.ok) {
        throw new Error(`RPC query failed (${resp.status})`)
    }

    const rows = await resp.json()
    if (!Array.isArray(rows)) {
        throw new Error('Invalid RPC response')
    }

    const merged = new Map()
    for (const row of rows) {
        if (!row || !row.content_id) continue

        const type = normalizeContentType(row.content_type)
        const id = normalizeContentId(row.content_id, type)
        if (!id) continue

        const mapKey = getContentKey(type, id)
        const existing = merged.get(mapKey) || {
            id,
            type,
            count: 0,
            unique_users: 0
        }
        existing.count += Number(row.total_calls) || 0
        existing.unique_users += Number(row.unique_users) || 0
        merged.set(mapKey, existing)
    }

    return sortTopContentFromMap(merged)
}

async function fetchTopContentFromRecentSample(url, key, sinceIso) {
    const sinceFilter = encodeURIComponent(`gte.${sinceIso}`)
    const merged = new Map()
    let sampledRows = 0

    for (let offset = 0; offset < SUPABASE_RECENT_SAMPLE_LIMIT; offset += SUPABASE_SAMPLE_PAGE_SIZE) {
        const pageLimit = Math.min(SUPABASE_SAMPLE_PAGE_SIZE, SUPABASE_RECENT_SAMPLE_LIMIT - offset)
        const sampleUrl = `${url}/rest/v1/clockrr_views?select=content_id,content_type&created_at=${sinceFilter}&order=created_at.desc&limit=${pageLimit}&offset=${offset}`
        const resp = await fetch(sampleUrl, {
            headers: getSupabaseHeaders(key)
        })
        if (!resp.ok) {
            throw new Error(`Sample query failed (${resp.status})`)
        }

        const rows = await resp.json()
        if (!Array.isArray(rows) || rows.length === 0) break

        for (const row of rows) {
            if (!row || !row.content_id) continue
            mergeContentCount(merged, row.content_id, row.content_type, 1)
        }

        sampledRows += rows.length
        if (rows.length < pageLimit) break
    }

    return {
        ranked: sortTopContentFromMap(merged),
        sampleSize: sampledRows
    }
}

function getDefaultRollingStats() {
    return ROLLING_WINDOWS.map(window => ({
        window: window.key,
        label: window.label,
        total_calls: null,
        unique_users: null
    }))
}

async function fetchRollingStatsViaRpc(url, key) {
    const rpcUrl = `${url}/rest/v1/rpc/clockrr_rollup_stats`
    const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            ...getSupabaseHeaders(key),
            'Content-Type': 'application/json'
        },
        body: '{}'
    })

    if (!resp.ok) {
        throw new Error(`Rolling RPC query failed (${resp.status})`)
    }

    const rows = await resp.json()
    if (!Array.isArray(rows)) {
        throw new Error('Invalid rolling RPC response')
    }

    const rowsByWindow = new Map()
    for (const row of rows) {
        const windowKey = String(
            row && (row.window_key || row.window || row.range_key || '')
        ).trim()
        if (!windowKey) continue

        rowsByWindow.set(windowKey, {
            total_calls: Number(row.total_calls),
            unique_users: Number(row.unique_users)
        })
    }

    return ROLLING_WINDOWS.map(window => {
        const row = rowsByWindow.get(window.key)
        return {
            window: window.key,
            label: window.label,
            total_calls: row && Number.isFinite(row.total_calls) ? row.total_calls : null,
            unique_users: row && Number.isFinite(row.unique_users) ? row.unique_users : null
        }
    })
}

// =============================================================================
// SUBTITLES HANDLER
// =============================================================================
const PORT = process.env.PORT || 7000

function buildSubtitlesResponse(type, id, userConfig = {}) {
    if (!['movie', 'series'].includes(type)) {
        return { subtitles: [] }
    }

    const cfgEncoded = encodeConfig({
        timeFormat: userConfig.timeFormat || DEFAULTS.timeFormat,
        flashDurationSec: userConfig.flashDurationSec || DEFAULTS.flashDurationSec,
        repeatIntervalSec: userConfig.repeatIntervalSec || DEFAULTS.repeatIntervalSec,
        mode: userConfig.mode || DEFAULTS.mode
    })

    const baseUrl = process.env.ADDON_URL
        || (process.env.VERCEL ? 'https://clockrr.vercel.app' : `http://localhost:${PORT}`)
    const t = getTimeBucket()

    return {
        subtitles: [
            {
                id: 'flashclock-time',
                lang: 'eng',
                label: 'Clockrr (Top Right)',
                url: `${baseUrl}/flashclock.vtt?cfg=${cfgEncoded}&t=${t}`
            }
        ]
    }
}

builder.defineSubtitlesHandler(({ type, id, config }) => {
    console.log(`[Clockrr] Subtitles request: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return Promise.resolve({ subtitles: [] })
    }

    trackView(id, type)
    return Promise.resolve(buildSubtitlesResponse(type, id, config || {}))
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
            margin-bottom: 14px;
        }

        .rollup-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 18px;
        }

        .rollup-card {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 10px 12px;
        }

        .rollup-label {
            font-size: 11px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: rgba(255,255,255,0.55);
            margin-bottom: 6px;
        }

        .rollup-value {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            line-height: 1.2;
        }

        .rollup-meta {
            font-size: 12px;
            color: var(--teal);
            margin-top: 2px;
        }

        .rollup-empty {
            text-align: center;
            color: rgba(255,255,255,0.45);
            font-size: 12px;
            padding: 10px;
        }

        .leaderboard-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
        }

        .lb-panel {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 14px;
            padding: 14px;
            backdrop-filter: blur(8px);
        }

        .lb-panel h3 {
            font-size: 15px;
            color: rgba(255,255,255,0.75);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
        }

        .leaderboard-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .lb-item {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 10px;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s;
        }

        .lb-item:hover {
            background: rgba(112, 248, 186, 0.08);
            border-color: rgba(112, 248, 186, 0.3);
            transform: translateY(-1px);
        }

        .lb-rank {
            font-size: 13px;
            font-weight: 700;
            color: rgba(255,255,255,0.3);
            width: 22px;
            text-align: center;
            flex-shrink: 0;
        }

        .lb-rank.top3 {
            color: var(--chartreuse);
        }

        .lb-poster {
            width: 42px;
            height: 62px;
            object-fit: cover;
            border-radius: 8px;
            flex-shrink: 0;
            background: rgba(255,255,255,0.08);
        }

        .lb-poster-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            color: rgba(255,255,255,0.45);
        }

        .lb-info {
            flex: 1;
            min-width: 0;
        }

        .lb-title {
            font-size: 14px;
            font-weight: 600;
            color: #fff;
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

        .lb-metrics {
            font-size: 11px;
            font-weight: 600;
            line-height: 1.35;
            color: var(--teal);
            text-align: right;
            flex-shrink: 0;
        }

        .lb-loading,
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
            .rollup-grid { grid-template-columns: 1fr; }
            .leaderboard-grid { grid-template-columns: 1fr; }
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
            <p class="leaderboard-subtitle">Recent usage by title: total calls, unique users, and average calls per user</p>
            <div class="rollup-grid" id="lbRollups">
                <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
                <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
                <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
            </div>
            <div class="leaderboard-grid">
                <div class="lb-panel">
                    <h3>Top Movies</h3>
                    <div class="leaderboard-list" id="lbMovies">
                        <div class="lb-loading">Loading...</div>
                    </div>
                </div>
                <div class="lb-panel">
                    <h3>Top TV Shows</h3>
                    <div class="leaderboard-list" id="lbSeries">
                        <div class="lb-loading">Loading...</div>
                    </div>
                </div>
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

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatAverage(value) {
            if (value === null || value === undefined) return 'n/a';
            const num = Number(value);
            if (!Number.isFinite(num)) return 'n/a';
            return num.toFixed(2);
        }

        function formatCount(value) {
            const num = Number(value);
            return Number.isFinite(num) && num >= 0 ? num.toLocaleString() : 'n/a';
        }

        let uniqueUsersAvailable = false;
        const cinemetaCache = new Map();

        function renderRollupCards(elementId, rollingStats) {
            const el = document.getElementById(elementId);
            if (!el) return;

            if (!Array.isArray(rollingStats) || rollingStats.length === 0) {
                el.innerHTML = '<div class="rollup-card"><div class="rollup-empty">Rolling stats unavailable</div></div>';
                return;
            }

            el.innerHTML = rollingStats.map(function(item) {
                const label = escapeHtml(item.label || item.window || 'Window');
                const calls = formatCount(item.total_calls);
                const users = formatCount(item.unique_users);
                return '<div class="rollup-card">' +
                    '<div class="rollup-label">' + label + '</div>' +
                    '<div class="rollup-value">' + calls + ' calls</div>' +
                    '<div class="rollup-meta">' + users + ' users</div>' +
                '</div>';
            }).join('');
        }

        function getNormalizedContentId(item) {
            const rawId = String((item && item.id) || '');
            const imdbMatch = rawId.match(/tt\\d+/i);
            if (imdbMatch) return imdbMatch[0].toLowerCase();
            if (item && item.type === 'series') return rawId.split(':')[0];
            return rawId;
        }

        function resolveMetadata(item) {
            const normalizedId = getNormalizedContentId(item);
            const baseItem = Object.assign({}, item, { id: normalizedId || item.id });

            if (!normalizedId || !normalizedId.startsWith('tt')) {
                return Promise.resolve(Object.assign({}, baseItem, {
                    title: item.title || normalizedId || item.id || 'Unknown',
                    poster: item.poster || null,
                    href: '#'
                }));
            }

            const type = item.type === 'series' ? 'series' : 'movie';
            const cacheKey = type + ':' + normalizedId;

            if (!cinemetaCache.has(cacheKey)) {
                const request = fetch('https://v3-cinemeta.strem.io/meta/' + type + '/' + encodeURIComponent(normalizedId) + '.json')
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .then(function(data) {
                        const meta = data && data.meta ? data.meta : null;
                        return Object.assign({}, baseItem, {
                            title: (meta && (meta.name || meta.title)) || normalizedId,
                            poster: (meta && (meta.poster || meta.background)) || null,
                            href: 'https://www.imdb.com/title/' + normalizedId + '/'
                        });
                    })
                    .catch(function() {
                        return Object.assign({}, baseItem, {
                            title: normalizedId,
                            poster: null,
                            href: 'https://www.imdb.com/title/' + normalizedId + '/'
                        });
                    });
                cinemetaCache.set(cacheKey, request);
            }

            return cinemetaCache.get(cacheKey);
        }

        function renderLeaderboardList(listId, items, emptyMessage) {
            const el = document.getElementById(listId);
            if (!Array.isArray(items) || items.length === 0) {
                el.innerHTML = '<div class="lb-empty">' + emptyMessage + '</div>';
                return;
            }

            el.innerHTML = items.slice(0, 10).map(function(item, i) {
                const rank = i + 1;
                const title = escapeHtml(item.title || item.id || 'Unknown');
                const poster = item.poster
                    ? '<img class="lb-poster" src="' + escapeHtml(item.poster) + '" alt="' + title + ' poster" loading="lazy">'
                    : '<div class="lb-poster lb-poster-placeholder">No art</div>';
                const typeLabel = item.type === 'series' ? 'TV SHOW' : 'MOVIE';
                const href = item.href && item.href !== '#' ? item.href : '';
                const totalCalls = Number(item.total_calls !== undefined ? item.total_calls : item.count || 0);
                const uniqueUsers = Number(item.unique_users || 0);
                const uniqueUsersLabel = uniqueUsers.toLocaleString();
                const avgCalls = uniqueUsers > 0 ? formatAverage(item.avg_calls_per_user) : 'n/a';
                const openTag = href
                    ? '<a href="' + escapeHtml(href) + '" class="lb-item" target="_blank" rel="noopener">'
                    : '<div class="lb-item">';
                const closeTag = href ? '</a>' : '</div>';

                return openTag +
                    '<div class="lb-rank' + (rank <= 3 ? ' top3' : '') + '">' + rank + '</div>' +
                    poster +
                    '<div class="lb-info">' +
                        '<div class="lb-title">' + title + '</div>' +
                        '<div class="lb-type">' + typeLabel + '</div>' +
                    '</div>' +
                    '<div class="lb-metrics">' +
                        '<div>' + totalCalls.toLocaleString() + ' calls</div>' +
                        '<div>' + uniqueUsersLabel + ' users</div>' +
                        '<div>avg ' + avgCalls + '</div>' +
                    '</div>' +
                closeTag;
            }).join('');
        }

        function loadLeaderboard() {
            fetch('/stats?ts=' + Date.now(), { cache: 'no-store' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    const movies = Array.isArray(data.top_movies) ? data.top_movies : [];
                    const series = Array.isArray(data.top_tv_shows) ? data.top_tv_shows : [];
                    renderRollupCards('lbRollups', data.rolling_stats);
                    uniqueUsersAvailable = !!data.unique_users_available;
                    return Promise.all([
                        Promise.all(movies.slice(0, 10).map(resolveMetadata)),
                        Promise.all(series.slice(0, 10).map(resolveMetadata))
                    ]);
                })
                .then(function(results) {
                    renderLeaderboardList('lbMovies', results[0], 'No movie data yet - be the first to watch with Clockrr.');
                    renderLeaderboardList('lbSeries', results[1], 'No TV data yet - watch a series episode with Clockrr.');
                })
                .catch(function() {
                    renderRollupCards('lbRollups', []);
                    document.getElementById('lbMovies').innerHTML = '<div class="lb-empty">Stats unavailable</div>';
                    document.getElementById('lbSeries').innerHTML = '<div class="lb-empty">Stats unavailable</div>';
                });
        }

        updateClock();
        setInterval(updateClock, 1000);
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

// Base subtitles endpoint with request-based analytics
app.get('/subtitles/:type/:id.json', (req, res) => {
    const { type, id } = req.params
    console.log(`[Clockrr] Base subtitles: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return res.json({ subtitles: [] })
    }

    const viewerKey = buildViewerKey(req)
    trackView(id, type, viewerKey)
    res.json(buildSubtitlesResponse(type, id))
})

// Config-based subtitles endpoint
app.get('/:config/subtitles/:type/:id.json', (req, res) => {
    const { config: configStr, type, id } = req.params
    const config = parseConfig(configStr)

    console.log(`[Clockrr] Config subtitles: type=${type}, id=${id}`)

    if (!['movie', 'series'].includes(type)) {
        return res.json({ subtitles: [] })
    }

    const viewerKey = buildViewerKey(req)
    trackView(id, type, viewerKey)
    res.json(buildSubtitlesResponse(type, id, config))
})

// =============================================================================
// STATS / LEADERBOARD ENDPOINT
// =============================================================================
app.get('/stats', async (req, res) => {
    const url = getSupabaseUrl()
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
        const rollingStatsFromRpc = await fetchRollingStatsViaRpc(url, key).catch(() => null)
        const rolling30dFromRpc = Array.isArray(rollingStatsFromRpc)
            ? rollingStatsFromRpc.find(item => item.window === '30d')
            : null
        const totalViewsFromRolling = rolling30dFromRpc && Number.isFinite(rolling30dFromRpc.total_calls)
            ? rolling30dFromRpc.total_calls
            : null
        const totalViews = Number.isFinite(totalViewsFromRolling)
            ? totalViewsFromRolling
            : await fetchExactViewsCount(url, key, since)
        const rollingStats = Array.isArray(rollingStatsFromRpc) ? rollingStatsFromRpc : (() => {
            const fallback = getDefaultRollingStats()
            const thirtyDay = fallback.find(item => item.window === '30d')
            if (thirtyDay) {
                thirtyDay.total_calls = totalViews
            }
            return fallback
        })()
        const rolling30d = rollingStats.find(item => item.window === '30d') || null

        let rankedContent = []
        let statsMode = 'rpc'
        let sampledRows = null
        if (totalViews > 0) {
            try {
                rankedContent = await fetchTopContentViaRpc(url, key, since)
            } catch {
                const sampled = await fetchTopContentFromRecentSample(url, key, since)
                rankedContent = sampled.ranked
                sampledRows = sampled.sampleSize
                statsMode = 'approx_recent_sample'
            }
        }

        const callsByTitleRaw = rankedContent.slice(0, MAX_TOP_CONTENT)
        const uniqueUsersByTitleRaw = pickTopByUniqueUsers(rankedContent, MAX_TOP_CONTENT)
        const topMoviesRaw = pickTopByType(rankedContent, 'movie')
        const topSeriesRaw = pickTopByType(rankedContent, 'series')
        const callsByTitle = callsByTitleRaw
        const uniqueUsersByTitle = uniqueUsersByTitleRaw
        const topMovies = topMoviesRaw
        const topSeries = topSeriesRaw

        const payload = {
            period: 'last_30_days',
            generated_at: generatedAt.toISOString(),
            total_views: totalViews,
            total_unique_users_30d: rolling30d && Number.isFinite(rolling30d.unique_users)
                ? rolling30d.unique_users
                : null,
            stats_mode: statsMode,
            sampled_rows: sampledRows,
            unique_users_available: rankedContent.some(item => (item.unique_users || 0) > 0),
            rolling_stats: rollingStats,
            top_content: callsByTitle,
            calls_by_title: callsByTitle,
            unique_users_by_title: uniqueUsersByTitle,
            top_movies: topMovies,
            top_series: topSeries,
            top_tv_shows: topSeries
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
            max-width: 920px;
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
            margin-bottom: 10px;
        }
        .rollup-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 20px;
        }
        .rollup-card {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 10px 12px;
        }
        .rollup-label {
            font-size: 11px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: rgba(255,255,255,0.55);
            margin-bottom: 6px;
        }
        .rollup-value {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            line-height: 1.2;
        }
        .rollup-meta {
            font-size: 12px;
            color: var(--teal);
            margin-top: 2px;
        }
        .rollup-empty {
            text-align: center;
            color: rgba(255,255,255,0.45);
            font-size: 12px;
            padding: 10px;
        }
        .boards {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
        }
        .board {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 14px;
            padding: 14px;
            backdrop-filter: blur(8px);
        }
        .board h2 {
            font-size: 16px;
            margin-bottom: 12px;
            color: rgba(255,255,255,0.85);
            text-transform: uppercase;
            letter-spacing: 0.6px;
        }
        .list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .item {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 10px;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s;
        }
        .item:hover {
            background: rgba(112, 248, 186, 0.08);
            border-color: rgba(112, 248, 186, 0.3);
            transform: translateY(-1px);
        }
        .rank {
            font-size: 13px;
            font-weight: 700;
            width: 22px;
            text-align: center;
            flex-shrink: 0;
            color: rgba(255,255,255,0.35);
        }
        .rank.gold { color: #FFD700; }
        .rank.silver { color: #C0C0C0; }
        .rank.bronze { color: #CD7F32; }
        .poster {
            width: 42px;
            height: 62px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
            background: rgba(255,255,255,0.08);
        }
        .poster.placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            color: rgba(255,255,255,0.45);
        }
        .info { flex: 1; min-width: 0; }
        .title {
            font-size: 14px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .type {
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
        }
        .metrics {
            font-size: 11px;
            line-height: 1.35;
            color: var(--teal);
            text-align: right;
            flex-shrink: 0;
        }
        .loading, .empty {
            text-align: center;
            padding: 30px 20px;
            color: rgba(255,255,255,0.3);
        }
        .updated {
            text-align: center;
            margin-top: 32px;
            font-size: 12px;
            color: rgba(255,255,255,0.25);
        }
        @media (max-width: 768px) {
            .rollup-grid { grid-template-columns: 1fr; }
            .boards { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <a href="/" class="back">← Back to Clockrr</a>
        <h1>🔥 What People Are Watching</h1>
        <p class="subtitle">Two views of recent activity: calls volume and unique users</p>
        <p class="total" id="totalViews"></p>
        <div class="rollup-grid" id="rollups">
            <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
            <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
            <div class="rollup-card"><div class="rollup-empty">Loading rolling stats...</div></div>
        </div>
        <div class="boards">
            <div class="board">
                <h2>Calls by Title</h2>
                <div class="list" id="callsList"><div class="loading">Loading...</div></div>
            </div>
            <div class="board">
                <h2>Unique Users by Title</h2>
                <div class="list" id="usersList"><div class="loading">Loading...</div></div>
            </div>
        </div>
        <p class="updated" id="updated"></p>
    </div>
    <script>
        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatAverage(value) {
            if (value === null || value === undefined) return 'n/a';
            const num = Number(value);
            if (!Number.isFinite(num)) return 'n/a';
            return num.toFixed(2);
        }

        function formatCount(value) {
            const num = Number(value);
            return Number.isFinite(num) && num >= 0 ? num.toLocaleString() : 'n/a';
        }

        let uniqueUsersAvailable = false;
        const cinemetaCache = new Map();

        function renderRollupCards(elementId, rollingStats) {
            const el = document.getElementById(elementId);
            if (!el) return;

            if (!Array.isArray(rollingStats) || rollingStats.length === 0) {
                el.innerHTML = '<div class="rollup-card"><div class="rollup-empty">Rolling stats unavailable</div></div>';
                return;
            }

            el.innerHTML = rollingStats.map(function(item) {
                const label = escapeHtml(item.label || item.window || 'Window');
                const calls = formatCount(item.total_calls);
                const users = formatCount(item.unique_users);
                return '<div class="rollup-card">' +
                    '<div class="rollup-label">' + label + '</div>' +
                    '<div class="rollup-value">' + calls + ' calls</div>' +
                    '<div class="rollup-meta">' + users + ' users</div>' +
                '</div>';
            }).join('');
        }

        function getNormalizedContentId(item) {
            const rawId = String((item && item.id) || '');
            const imdbMatch = rawId.match(/tt\\d+/i);
            if (imdbMatch) return imdbMatch[0].toLowerCase();
            if (item && item.type === 'series') return rawId.split(':')[0];
            return rawId;
        }

        function resolveMetadata(item) {
            const normalizedId = getNormalizedContentId(item);
            const baseItem = Object.assign({}, item, { id: normalizedId || item.id });

            if (!normalizedId || !normalizedId.startsWith('tt')) {
                return Promise.resolve(Object.assign({}, baseItem, {
                    title: item.title || normalizedId || item.id || 'Unknown',
                    poster: item.poster || null,
                    href: '#'
                }));
            }

            const type = item.type === 'series' ? 'series' : 'movie';
            const cacheKey = type + ':' + normalizedId;

            if (!cinemetaCache.has(cacheKey)) {
                const request = fetch('https://v3-cinemeta.strem.io/meta/' + type + '/' + encodeURIComponent(normalizedId) + '.json')
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .then(function(data) {
                        const meta = data && data.meta ? data.meta : null;
                        return Object.assign({}, baseItem, {
                            title: (meta && (meta.name || meta.title)) || normalizedId,
                            poster: (meta && (meta.poster || meta.background)) || null,
                            href: 'https://www.imdb.com/title/' + normalizedId + '/'
                        });
                    })
                    .catch(function() {
                        return Object.assign({}, baseItem, {
                            title: normalizedId,
                            poster: null,
                            href: 'https://www.imdb.com/title/' + normalizedId + '/'
                        });
                    });
                cinemetaCache.set(cacheKey, request);
            }

            return cinemetaCache.get(cacheKey);
        }

        function renderList(listId, items, emptyMessage) {
            const el = document.getElementById(listId);
            if (!Array.isArray(items) || items.length === 0) {
                el.innerHTML = '<div class="empty">' + emptyMessage + '</div>';
                return;
            }

            const ranks = ['gold', 'silver', 'bronze'];
            el.innerHTML = items.slice(0, 20).map(function(item, i) {
                const rank = i + 1;
                const rankClass = ranks[i] || '';
                const title = escapeHtml(item.title || item.id || 'Unknown');
                const typeLabel = item.type === 'series' ? 'TV SHOW' : 'MOVIE';
                const href = item.href && item.href !== '#' ? item.href : '';
                const totalCalls = Number(item.total_calls !== undefined ? item.total_calls : item.count || 0);
                const uniqueUsers = Number(item.unique_users || 0);
                const uniqueUsersLabel = uniqueUsers.toLocaleString();
                const avgCalls = uniqueUsers > 0 ? formatAverage(item.avg_calls_per_user) : 'n/a';
                const poster = item.poster
                    ? '<img class="poster" src="' + escapeHtml(item.poster) + '" alt="' + title + ' poster" loading="lazy">'
                    : '<div class="poster placeholder">No art</div>';
                const openTag = href
                    ? '<a href="' + escapeHtml(href) + '" class="item" target="_blank" rel="noopener">'
                    : '<div class="item">';
                const closeTag = href ? '</a>' : '</div>';

                return openTag +
                    '<div class="rank ' + rankClass + '">' + rank + '</div>' +
                    poster +
                    '<div class="info">' +
                        '<div class="title">' + title + '</div>' +
                        '<div class="type">' + typeLabel + '</div>' +
                    '</div>' +
                    '<div class="metrics">' +
                        '<div>' + totalCalls.toLocaleString() + ' calls</div>' +
                        '<div>' + uniqueUsersLabel + ' users</div>' +
                        '<div>avg ' + avgCalls + '</div>' +
                    '</div>' +
                closeTag;
            }).join('');
        }

        function loadStats() {
            fetch('/stats?ts=' + Date.now(), { cache: 'no-store' })
                .then(r => r.json())
                .then(data => {
                    if (data.total_views !== undefined) {
                        const totalCalls = formatCount(data.total_views);
                        const totalUsers30d = Number(data.total_unique_users_30d);
                        const usersSuffix = Number.isFinite(totalUsers30d)
                            ? ' | ' + totalUsers30d.toLocaleString() + ' unique users (30d)'
                            : '';
                        document.getElementById('totalViews').textContent = totalCalls + ' calls tracked in last 30d' + usersSuffix;
                    }
                    renderRollupCards('rollups', data.rolling_stats);
                    uniqueUsersAvailable = !!data.unique_users_available;
                    const calls = Array.isArray(data.calls_by_title) ? data.calls_by_title : (data.top_content || []);
                    const users = Array.isArray(data.unique_users_by_title) ? data.unique_users_by_title : [];
                    return Promise.all([
                        Promise.all(calls.slice(0, 20).map(resolveMetadata)),
                        Promise.all(users.slice(0, 20).map(resolveMetadata))
                    ]);
                })
                .then(results => {
                    renderList('callsList', results[0], 'No call data yet - be the first to watch with Clockrr.');
                    renderList('usersList', results[1], 'No unique-user data yet. Data starts building from new tracking events.');
                    document.getElementById('updated').textContent = 'Updated: ' + new Date().toLocaleString();
                })
                .catch(() => {
                    renderRollupCards('rollups', []);
                    document.getElementById('callsList').innerHTML = '<div class="empty">Stats unavailable</div>';
                    document.getElementById('usersList').innerHTML = '<div class="empty">Stats unavailable</div>';
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

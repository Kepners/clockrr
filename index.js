#!/usr/bin/env node

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk')

// Manifest defines the addon
const manifest = {
    id: 'com.kepners.clockrr',
    version: '1.0.0',
    name: 'Clockrr',
    description: 'A clock addon for Stremio - displays current time',
    logo: 'https://i.imgur.com/placeholder.png', // TODO: Add actual logo
    background: '#524948', // Taupe Grey
    resources: ['catalog', 'meta'],
    types: ['other'],
    catalogs: [
        {
            type: 'other',
            id: 'clockrr-main',
            name: 'Clockrr'
        }
    ]
}

const builder = new addonBuilder(manifest)

// Generate clock item with current time
function getClockItem() {
    const now = new Date()
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    })
    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return {
        id: 'clockrr-time',
        type: 'other',
        name: `🕐 ${timeString}`,
        poster: 'https://i.imgur.com/placeholder.png', // TODO: Add clock poster
        posterShape: 'square',
        description: `Current Time: ${timeString}\n\nDate: ${dateString}\n\n⏰ Clockrr - Your Stremio Clock`,
        releaseInfo: dateString,
        runtime: 'Live'
    }
}

// Catalog handler - returns clock item
builder.defineCatalogHandler(({ type, id }) => {
    console.log(`[Clockrr] Catalog request: type=${type}, id=${id}`)

    if (type === 'other' && id === 'clockrr-main') {
        return Promise.resolve({
            metas: [getClockItem()]
        })
    }

    return Promise.resolve({ metas: [] })
})

// Meta handler - returns detailed clock info
builder.defineMetaHandler(({ type, id }) => {
    console.log(`[Clockrr] Meta request: type=${type}, id=${id}`)

    if (type === 'other' && id === 'clockrr-time') {
        return Promise.resolve({
            meta: getClockItem()
        })
    }

    return Promise.resolve({ meta: null })
})

// Start server
const PORT = process.env.PORT || 7000

serveHTTP(builder.getInterface(), { port: PORT })

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                      🕐 CLOCKRR                           ║
║              Stremio Clock Addon Running                  ║
╠═══════════════════════════════════════════════════════════╣
║  Local:     http://localhost:${PORT}/manifest.json          ║
║  Install:   stremio://localhost:${PORT}/manifest.json       ║
╚═══════════════════════════════════════════════════════════╝
`)

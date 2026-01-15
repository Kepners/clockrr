# Flash Clock - Stremio Subtitle Clock Addon

## Project Overview
**Flash Clock (Top Right)** - A subtitle-based clock overlay for Stremio

| Item | Value |
|------|-------|
| Type | Stremio Subtitle Addon |
| Repo | github.com/Kepners/clockrr |
| Hosting | Local / Beamup |
| Framework | Stremio Addon SDK |

---

## Key Documentation
| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Installation & usage |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Session memory |

---

## Design System

### Color Palette
| Color | Hex | Name | Use |
|-------|-----|------|-----|
| Dark | `#524948` | Taupe Grey | Background |
| Primary | `#57467B` | Dusty Grape | Accents |
| Secondary | `#7CB4B8` | Tropical Teal | Secondary UI |
| Highlight | `#70F8BA` | Tropical Mint | Clock display |
| Accent | `#CAFE48` | Chartreuse | Active states |

---

## Development

### Key Files
| File | Purpose |
|------|---------|
| `index.js` | Main addon server - manifest, subtitle handler, WebVTT endpoint |
| `package.json` | Dependencies + scripts |

### Addon Structure
```
index.js
├── Manifest: id, name, resources:['subtitles'], types:['movie','series']
├── defineSubtitlesHandler: Returns Flash Clock subtitle track
├── /flashclock.vtt: WebVTT endpoint with time cues
└── Cache: In-memory 30s TTL
```

### Resources Used
- `subtitles` - Provides clock as selectable subtitle track
- Types: `movie`, `series`

### Configuration Options
| Option | Values | Default |
|--------|--------|---------|
| timeFormat | 24h, 12h | 24h |
| flashDurationSec | 5, 10, 15 | 10 |
| repeatIntervalSec | 30, 60, 120 | 60 |
| opacity | 30, 50, 70, 100 | 70 |
| textSize | small, medium, large | medium |
| shadow | yes, no | yes |

### Local Testing
```bash
npm start
# Server: http://localhost:7000
# Manifest: http://localhost:7000/manifest.json
# VTT Test: http://localhost:7000/flashclock.vtt
# Install in Stremio: stremio://localhost:7000/manifest.json
```

---

## Quick Commands
```bash
# Run locally
npm start

# Test manifest
curl http://localhost:7000/manifest.json

# Test WebVTT output
curl http://localhost:7000/flashclock.vtt
```

---

## How It Works
1. User plays movie/series in Stremio
2. Addon provides "Flash Clock" subtitle track
3. User selects the track via CC button
4. WebVTT cues show time briefly (10s) every 60s
5. When paused, current cue stays visible

---

## TODO
- [ ] Deploy to Beamup for public URL
- [ ] Add actual logo image
- [ ] Test on different Stremio clients (Android, Web, Desktop)

---

*Created: January 15, 2026*
*Rewritten to Subtitle Addon: January 15, 2026*

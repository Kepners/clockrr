# Clockrr - Stremio Clock Addon

## Project Overview
**Clockrr** - A clock addon for Stremio media player

| Item | Value |
|------|-------|
| Type | Stremio Addon |
| Repo | github.com/Kepners/clockrr |
| Hosting | GitHub (addon hosted externally or locally) |
| Framework | Stremio Addon SDK |

---

## Key Documentation
| Doc | Purpose |
|-----|---------|
| [docs/SPEC.md](docs/SPEC.md) | Project specification |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Session memory |

---

## Design System

### Color Palette
| Color | Hex | Name | Use |
|-------|-----|------|-----|
| Dark | `#524948` | Taupe Grey | Background, dark elements |
| Primary | `#57467B` | Dusty Grape | Accents, headers |
| Secondary | `#7CB4B8` | Tropical Teal | Secondary UI elements |
| Highlight | `#70F8BA` | Tropical Mint | Clock display, highlights |
| Accent | `#CAFE48` | Chartreuse | Active states, buttons |

### VS Code Workspace
- Title bar: `#57467B` (Dusty Grape)
- Activity bar: `#57467B`
- Status bar: `#524948` (Taupe Grey)

---

## Development

### Stremio Addon SDK
```bash
npm install stremio-addon-sdk
```

### Local Testing
```bash
npm start
# Open: http://localhost:7000/manifest.json
# Install in Stremio: stremio://localhost:7000/manifest.json
```

---

## Quick Commands
```bash
# Run locally
npm start

# Test manifest
curl http://localhost:7000/manifest.json
```

---

*Created: January 15, 2026*

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

### Stremio Addon SDK Setup (COMPLETE ✅)
```bash
# Installed: stremio-addon-sdk@1.6.10
npm install stremio-addon-sdk
```

### Key Files
| File | Purpose |
|------|---------|
| `index.js` | Main addon server - defines manifest, catalog, meta handlers |
| `package.json` | Dependencies + scripts (`npm start`, `npm run dev`) |

### Addon Structure
```
index.js
├── Manifest: id, name, resources, types, catalogs
├── defineCatalogHandler: Returns clock item with current time
└── defineMetaHandler: Returns detailed clock info
```

### Resources Used
- `catalog` - Shows clock in Stremio browse
- `meta` - Shows time details when clicked
- Type: `other` (not movie/series)

### Local Testing
```bash
npm start
# Server: http://localhost:7000
# Manifest: http://localhost:7000/manifest.json
# Install in Stremio: stremio://localhost:7000/manifest.json
```

### Auto-Launch (opens Stremio + installs)
```bash
npm run dev
```

---

## Quick Commands
```bash
# Run locally
npm start

# Run + auto-install in Stremio
npm run dev

# Test manifest
curl http://localhost:7000/manifest.json
```

---

## TODO
- [ ] Add actual logo image (replace placeholder)
- [ ] Add poster image for clock item
- [ ] Deploy to Beamup for public URL
- [ ] Customize clock display format options

---

*Created: January 15, 2026*
*SDK Setup: January 15, 2026*

# Clockrr - Session Memory

## Quick Reference
- **Repo**: github.com/Kepners/clockrr
- **Workspace color**: #57467B (Dusty Grape)
- **Type**: Stremio Addon

---

## Color Palette
```
#524948 - Taupe Grey (background)
#57467B - Dusty Grape (primary)
#7CB4B8 - Tropical Teal (secondary)
#70F8BA - Tropical Mint (highlight/clock)
#CAFE48 - Chartreuse (accent)
```

---

## Architecture
```
Stremio Client
    ↓ (HTTP request)
index.js (Node.js server on port 7000)
    ├── GET /manifest.json → Returns addon manifest
    ├── GET /catalog/other/clockrr-main.json → Returns clock item
    └── GET /meta/other/clockrr-time.json → Returns clock details
```

**SDK**: `stremio-addon-sdk@1.6.10`

---

## Key Files
| File | Purpose |
|------|---------|
| `index.js` | Main addon server - manifest + handlers (manifest embedded, not separate file) |
| `package.json` | Dependencies: stremio-addon-sdk, scripts: start, dev |

---

## Addon Handlers
| Handler | Purpose |
|---------|---------|
| `defineCatalogHandler` | Returns clock item with live time in name |
| `defineMetaHandler` | Returns detailed time/date info |

---

## Known Issues
[None yet]

---

## Session Notes
- **Jan 15, 2026**: Project created, SDK installed, boilerplate complete

---

*Last Updated: January 15, 2026*

# Clockrr - Architecture

## System Overview

```
┌─────────────────────────────────────────────┐
│              Stremio Client                  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │          Clockrr Addon              │    │
│  │                                     │    │
│  │  ┌─────────┐    ┌─────────────┐    │    │
│  │  │ Manifest│───▶│ Clock View  │    │    │
│  │  └─────────┘    └─────────────┘    │    │
│  │                        │           │    │
│  │                 ┌──────▼──────┐    │    │
│  │                 │ Time Display│    │    │
│  │                 └─────────────┘    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Components

### 1. Manifest (`manifest.json`)
Stremio addon manifest defining:
- Addon ID, name, version
- Supported resources
- Catalog configuration

### 2. Addon Server (`index.js`)
Node.js server using Stremio Addon SDK:
- Serves manifest
- Handles catalog requests
- Returns clock data

## Data Flow

1. User installs addon via manifest URL
2. Stremio fetches manifest
3. Addon appears in Stremio interface
4. User accesses clock feature
5. Current time displayed

## Deployment Options

| Option | URL Pattern | Notes |
|--------|-------------|-------|
| Local | `http://localhost:7000/manifest.json` | Development |
| Beamup | `https://clockrr.beamup.dev/manifest.json` | Free hosting |
| Custom | Self-hosted server | Full control |

---

*Last Updated: January 15, 2026*

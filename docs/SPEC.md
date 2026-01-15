# Clockrr - Specification

## Overview
A clock addon for Stremio media player that displays the current time.

## Goals
- [ ] Display current time in Stremio interface
- [ ] Clean, readable clock design
- [ ] Match app color palette

## User Stories
- As a Stremio user, I want to see the current time while browsing content
- As a user, I want the clock to match Stremio's aesthetic

## Technical Requirements
- **Framework**: Stremio Addon SDK (Node.js)
- **Hosting**: Can be self-hosted or deployed to Beamup/Vercel
- **Manifest**: Standard Stremio addon manifest

## MVP Features
1. Display current time
2. Clean UI matching color palette
3. Easy installation via Stremio addon URL

## Future Features
- Multiple timezone support
- Different clock styles (analog/digital)
- Customizable colors

## Design Requirements
### Colors (from palette)
- Background: `#524948` (Taupe Grey)
- Primary: `#57467B` (Dusty Grape)
- Secondary: `#7CB4B8` (Tropical Teal)
- Clock display: `#70F8BA` (Tropical Mint)
- Accents: `#CAFE48` (Chartreuse)

### Style
- Modern, minimal
- High contrast for readability
- Consistent with Stremio's dark theme

---

*Status: DRAFT - Needs review*

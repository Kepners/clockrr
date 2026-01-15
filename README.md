# Flash Clock (Top Right)

A Stremio subtitle addon that briefly flashes the current time in the top-right corner of the screen. Perfect for checking the time when you pause a video without a permanent overlay.

## How It Works

- When playing any movie or series, select the "Flash Clock (Top Right)" subtitle track
- The current time flashes on screen for ~10 seconds
- Then disappears for ~60 seconds (configurable)
- Repeats throughout playback
- When you pause, the current subtitle cue stays visible

## Installation

### Local Installation
```bash
npm install
npm start
```

Then install in Stremio:
- Open Stremio
- Go to Settings > Addons
- Enter: `http://localhost:7000/manifest.json`
- Or click: [Install Addon](stremio://localhost:7000/manifest.json)

### Public URL (Beamup)
Coming soon - deploy to Beamup for a public URL.

## Configuration Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| Time Format | 24h, 12h | 24h | Clock display format |
| Flash Duration | 5, 10, 15 sec | 10 | How long the time shows |
| Repeat Interval | 30, 60, 120 sec | 60 | Time between flashes |
| Opacity | 30%, 50%, 70%, 100% | 70% | Text transparency |
| Text Size | small, medium, large | medium | Clock text size |
| Shadow | yes, no | yes | Drop shadow on text |

## Usage

1. Install the addon in Stremio
2. Play any movie or TV show
3. Open subtitle settings (CC button)
4. Select "Flash Clock (Top Right)"
5. The time will flash periodically

## Limitations

- **Not live ticking**: The clock shows the wall-clock time computed when the VTT file is requested. It updates as you progress through playback but won't tick live while paused.
- **Positioning varies**: Top-right positioning uses WebVTT cue settings. Some Stremio clients may render it differently.
- **Style support**: STYLE blocks are supported by some players but not all. Falls back to default subtitle styling.

## Technical Details

- Uses `stremio-addon-sdk` with `subtitles` resource
- Serves WebVTT files dynamically at `/flashclock.vtt`
- Generates cues for a 12-hour playback timeline
- In-memory caching with 30-second TTL
- Wall-clock time = server time at request + playback offset

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/manifest.json` | Stremio addon manifest |
| `/subtitles/:type/:id.json` | Returns subtitle track list |
| `/flashclock.vtt?cfg=...` | WebVTT file with time cues |

## Development

```bash
# Run locally
npm start

# Test manifest
curl http://localhost:7000/manifest.json

# Test VTT output
curl http://localhost:7000/flashclock.vtt
```

## Color Palette

| Color | Hex | Name |
|-------|-----|------|
| Background | `#524948` | Taupe Grey |
| Primary | `#57467B` | Dusty Grape |
| Secondary | `#7CB4B8` | Tropical Teal |
| Highlight | `#70F8BA` | Tropical Mint |
| Accent | `#CAFE48` | Chartreuse |

## License

MIT

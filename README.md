# RenderForge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-270%20passing-brightgreen.svg)]()

Self-hosted, **Shotstack API v1-compatible** video render engine. Hybrid Puppeteer + FFmpeg pipeline delivers smooth Ken Burns effects, transitions, and text overlays with FFmpeg encoding — **no per-render fees**.

Built for high-volume automated video production (270-channel YouTube automation).

## Why RenderForge?

| | Shotstack | RenderForge |
|---|-----------|-------------|
| Deployment | Cloud only | **Self-hosted** + Cloud |
| Cost | $0.25/render ($125~$1,900/mo) | **$0** (self-hosted) |
| Open Source | No | **Yes** (MIT) |
| Ken Burns Quality | Limited easing | **JS-computed per-frame transforms** |
| AI Native | Limited | Seedream / Seedance integration |
| API Compat | -- | **Full Shotstack v1 drop-in** |

### Render Output Examples

3-scene HD video with Ken Burns, fade transitions, TTS audio, BGM, and subtitle overlays:

| Scene 1 — zoomIn | Scene 2 — slideLeft | Scene 3 — zoomOut |
|---|---|---|
| Nebula + subtitle overlay | Crab Nebula + fade transition | Crystal + subtitle |

## Features

- **4 APIs** — Edit, Serve, Ingest, Create (full Shotstack v1 compatible)
- **14 asset types** — Video, Image, Text, RichText, Audio, Shape, SVG, HTML, Title, Luma, Caption, AI (T2I/I2V)
- **Ken Burns** — zoomIn, zoomOut, slideLeft, slideRight, slideUp, slideDown + Fast/Slow variants (linear constant speed, per-frame JS computation)
- **Transitions** — fade, fadeSlow, fadeFast, reveal, wipe, slide, carousel, shuffle, zoom (20+ types)
- **Filters** — blur, boost, contrast, darken, greyscale, lighten, muted, negative
- **Effects** — Tween animations, ChromaKey, Transform (rotate/skew/flip), Speed control
- **Audio** — Multi-track TTS + BGM mixing with FFmpeg (volume, fadeIn/Out, crossfade, atempo)
- **Output** — mp4, gif, jpg, png, bmp, mp3
- **Resolutions** — preview, mobile, sd, hd, 1080, 4k
- **Aspect ratios** — 16:9, 9:16, 1:1, 4:5, 4:3
- **Templates** — CRUD with merge field substitution (`{{PLACEHOLDER}}`)
- **Extended API** — Batch render, preview mode, queue status dashboard
- **Auth** — x-api-key (Shotstack compatible) + JWT Bearer
- **Observability** — Prometheus metrics (`/metrics`) + pino structured logging
- **Webhooks** — Callback POST on render complete/fail with retry
- **Scaling** — BullMQ job queue, horizontal worker scaling via Docker Compose

## Architecture

```
Client (n8n / cURL / SDK)
  → POST /edit/v1/render (Shotstack JSON)
  → API Module (Fastify) — validation, auth, 202 Accepted
  → Job Queue (BullMQ + Redis)
  → Render Pipeline:
      1. Timeline Parser — Shotstack JSON → Internal Representation
      2. Scene Builder — IR → HTML/CSS with embedded updateFrame() JS
      3. Frame Capture — Puppeteer page.evaluate() per frame (PNG sequence)
      4. Encoder — FFmpeg H.264 + audio mixing → MP4
  → Asset Storage (local FS / S3)
  → Client polls GET /edit/v1/render/:id → status: done, url: "..."
```

**Key design:** Instead of CSS animations (unreliable timing), RenderForge computes KenBurns transforms and transition opacity per-frame via `page.evaluate()`. This gives frame-perfect control over all visual effects.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| HTTP Server | Fastify |
| Job Queue | BullMQ + Redis |
| Browser Engine | Puppeteer + Chromium (browserless) |
| Video Encoder | FFmpeg |
| Image Processing | Sharp |
| Database | Drizzle ORM + SQLite / PostgreSQL |
| Language | TypeScript |
| Tests | Vitest (270 tests) |

## Quick Start

```bash
git clone https://github.com/jjjames38/renderforge.git
cd renderforge

pnpm install

# Start infrastructure (Redis + Chromium)
docker compose -f docker/docker-compose.dev.yml up -d

# Run dev server
pnpm dev

# Run tests
pnpm test
```

### Production (Docker)

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Usage

### Submit a render

```bash
curl -X POST http://localhost:3000/edit/v1/render \
  -H "Content-Type: application/json" \
  -d '{
    "timeline": {
      "background": "#000000",
      "tracks": [
        {
          "clips": [{
            "asset": {
              "type": "text",
              "text": "Hello World",
              "font": { "family": "Montserrat", "size": 34, "color": "#ffffff", "weight": 700 },
              "stroke": { "color": "#000000", "width": 3 }
            },
            "start": 0, "length": 5,
            "position": "bottom", "offset": { "y": 0.09 }
          }]
        },
        {
          "clips": [{
            "asset": { "type": "image", "src": "https://example.com/photo.jpg" },
            "start": 0, "length": 5,
            "effect": "zoomIn", "filter": "boost"
          }]
        }
      ]
    },
    "output": { "format": "mp4", "resolution": "hd" }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Created",
  "response": { "id": "abc123", "status": "queued" }
}
```

### Check render status

```bash
curl http://localhost:3000/edit/v1/render/abc123
```

**Response (when done):**
```json
{
  "success": true,
  "response": {
    "id": "abc123",
    "status": "done",
    "url": "/serve/v1/assets/abc123/output.mp4"
  }
}
```

### Batch render

```bash
curl -X POST http://localhost:3000/x/v1/render/batch \
  -H "Content-Type: application/json" \
  -d '{ "renders": [ {...}, {...}, {...} ] }'
```

### Template with merge fields

```bash
# Create template
curl -X POST http://localhost:3000/edit/v1/template \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Longform",
    "template": {
      "timeline": { "tracks": [{ "clips": [{ "asset": { "type": "text", "text": "{{TITLE}}" }, "start": 0, "length": 5 }] }] },
      "output": { "format": "mp4", "resolution": "hd" }
    }
  }'

# Render from template
curl -X POST http://localhost:3000/edit/v1/template/{id}/render \
  -H "Content-Type: application/json" \
  -d '{ "merge": [{ "find": "TITLE", "replace": "My Video Title" }] }'
```

## RunPod Unified Deployment (RTX 4090)

Deploy all 3 AI engines on a single RunPod RTX 4090 instance:

```bash
docker compose -f docker/docker-compose.runpod.yml up -d
```

**VRAM Budget (24GB):**

| Engine | VRAM | Purpose |
|--------|------|---------|
| Fish Speech TTS | 2GB (resident) | Text-to-speech |
| Flux Klein 4B | 8GB (on-demand) | Text-to-image |
| HunyuanVideo 1.5 | 14GB (on-demand) | Image-to-video |

Compatible pairs: Fish Speech + Flux (10GB), Fish Speech + Hunyuan (16GB with CPU offload).

**Cost:** ~$50/month (RunPod RTX 4090) vs $5,522/month with external APIs.

## Ecosystem — 5 Projects Connected

RenderForge connects all 5 projects in the YouTube 270-channel automation pipeline:

| Project | Role | Integration |
|---------|------|-------------|
| **RenderForge** | Video render engine | Core |
| **VisualCore** | GPU inference (Flux, Hunyuan, ESRGAN) | Create API providers |
| **VoiceCore** | TTS (Fish Speech) | Create API provider |
| **ProfileCore** | Anti-detect browser automation | `/x/v1/profiles/*` |
| **CubeInsight** | Trend analysis and sentiment | `/x/v1/trends/*` |

ProfileCore and CubeInsight are disabled by default. Enable via:
```bash
PROFILECORE_ENABLED=true
CUBEINSIGHT_ENABLED=true
```

## n8n Integration (Shotstack Migration)

RenderForge is a **drop-in replacement** for Shotstack in n8n workflows. To migrate:

### 1. Change the API URL

In your n8n Code nodes, replace:
```javascript
// Before (Shotstack)
hostname: 'api.shotstack.io'
path: '/edit/v1/render'

// After (RenderForge)
hostname: 'host.docker.internal'
port: 3000
path: '/edit/v1/render'
```

### 2. Switch from HTTPS to HTTP

```javascript
// Before
const https = require('https');
const req = https.request(options, ...);

// After
const http = require('http');
const req = http.request(options, ...);
```

### 3. Keep your existing payload

The timeline JSON (`tracks`, `clips`, `asset`, `effect`, `filter`, `transition`) is **100% compatible**. No payload changes needed.

### 4. Auth header (optional)

The `x-api-key` header is ignored when `AUTH_ENABLED=false` (default). You can leave it in your code or remove it.

### Prerequisites

RenderForge must be running on the host machine:
```bash
# Start infrastructure
docker compose -f docker/docker-compose.dev.yml up -d

# Start RenderForge
cd renderforge && pnpm dev
```

## API Reference

### Edit API (`/edit/v1/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/render` | Submit render job |
| GET | `/render/:id` | Get render status |
| POST | `/template` | Create template |
| GET | `/template` | List templates |
| GET | `/template/:id` | Get template |
| PUT | `/template/:id` | Update template |
| DELETE | `/template/:id` | Delete template |
| POST | `/template/:id/render` | Render from template |
| GET | `/inspect?url=` | Media metadata (ffprobe) |

### Serve API (`/serve/v1/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets/:id` | Get asset details |
| DELETE | `/assets/:id` | Delete asset |
| GET | `/assets/render/:id` | Get asset by render ID |
| POST | `/assets/transfer` | Transfer to S3/Mux/webhook |

### Ingest API (`/ingest/v1/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sources` | Fetch source from URL |
| GET | `/sources` | List sources |
| GET | `/sources/:id` | Get source status |
| DELETE | `/sources/:id` | Delete source |
| POST | `/upload` | Direct file upload |

### Create API (`/create/v1/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate` | Generate AI asset (T2I / I2V) |
| GET | `/generate/:id` | Get generation status |

### Extended API (`/x/v1/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/render/batch` | Submit multiple renders |
| POST | `/render/preview` | Quick low-res preview |
| GET | `/queue/status` | Queue dashboard |
| GET | `/metrics` | Prometheus metrics |
| POST | `/profiles/launch` | Launch a ProfileCore browser profile |
| POST | `/profiles/close` | Close a browser profile |
| GET | `/profiles/health` | Profile/proxy health check |
| GET | `/profiles/list` | List profiles by tier |
| GET | `/trends/topics` | Trending topics (CubeInsight) |
| GET | `/trends/sentiment` | Video sentiment analysis |
| GET | `/trends/channels` | Channel search |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `CHROMIUM_WS` | `ws://localhost:3001` | Chromium WebSocket |
| `STORAGE_DRIVER` | `local` | Storage backend (`local` / `s3`) |
| `STORAGE_PATH` | `./data/assets` | Local storage path |
| `DB_DRIVER` | `sqlite` | Database (`sqlite` / `pg`) |
| `AUTH_ENABLED` | `false` | Enable API authentication |
| `API_KEYS` | -- | Comma-separated API keys |
| `JWT_SECRET` | -- | JWT signing secret |

### AI Provider Config (`config.yaml`)

```yaml
create:
  text_to_image:
    provider: seedream
    api_url: https://api.byteplus.com/...
    api_key: ${SEEDREAM_API_KEY}
  image_to_video:
    provider: seedance
    api_url: https://api.byteplus.com/...
    api_key: ${SEEDANCE_API_KEY}
```

## Scaling

```bash
docker compose up --scale renderforge=4 --scale chromium=4
```

Each worker picks jobs from the shared BullMQ queue. Workers and Chromium instances scale 1:1.

## Performance

Measured on Mac Mini M2 (single worker):

| Metric | Value |
|--------|-------|
| 18s HD video (450 frames) | ~110s render time |
| Frame capture rate | ~4 frames/sec |
| Parse + Build | < 5ms |
| FFmpeg encode | ~4s |
| Audio mixing (TTS + BGM) | included in encode |

## Project Structure

```
src/
  api/
    edit/          # Render + template endpoints
    serve/         # Asset serving + transfer
    ingest/        # Source management + upload
    create/        # AI generation endpoints
    extended/      # Batch, preview, queue status
    metrics.ts     # Prometheus metrics
    middleware/    # Auth (x-api-key + JWT)
  render/
    parser/        # Shotstack JSON → Internal Representation
    builder/       # IR → HTML + updateFrame() JS
    capture/       # Puppeteer per-frame capture
    encoder/       # FFmpeg video + audio mixing
    effects/       # Ken Burns, transitions, filters, tween, chromakey
    assets/        # 14 asset type handlers
    pipeline.ts    # Pipeline orchestrator
  queue/
    queues.ts      # BullMQ queue definitions
    workers/       # Render, ingest, create workers
  template/        # CRUD + merge field engine
  asset/           # Storage (local/S3) + destinations
  db/              # Drizzle ORM schema
  config/          # Environment config
  server.ts        # Fastify bootstrap
  index.ts         # Entry point
docker/
  Dockerfile       # Multi-stage production build
  docker-compose.yml       # Production stack
  docker-compose.dev.yml   # Dev infrastructure
tests/             # 270 Vitest test suites
docs/
  superpowers/
    specs/         # Design specification
    plans/         # Implementation plan
```

## Development

```bash
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d
pnpm dev            # Start with hot reload
pnpm test           # Run all 270 tests
pnpm test:watch     # Watch mode
pnpm build          # TypeScript compile
```

## Contributing

Contributions welcome. Please open an issue first to discuss changes.

## License

[MIT](LICENSE)

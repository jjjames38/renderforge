# Changelog

## [0.1.0] - 2026-03-29

### Initial Release

Full Shotstack API v1-compatible self-hosted video render engine.

#### Core
- Modular monolith architecture (Fastify + BullMQ + Puppeteer + FFmpeg)
- Timeline Parser: Shotstack JSON → Internal Representation with merge field substitution
- Scene Builder: IR → HTML/CSS with embedded `updateFrame()` JavaScript
- Frame Capture: Puppeteer `page.evaluate()` per-frame rendering (frame-perfect timing)
- Encoder: FFmpeg H.264/H.265 encoding with multi-track audio mixing

#### APIs (Shotstack v1 Compatible)
- **Edit API** — POST/GET render, template CRUD, template render, media inspect
- **Serve API** — Asset management, CDN serve, S3/Mux/webhook transfer
- **Ingest API** — Source fetch, upload, status polling
- **Create API** — AI asset generation (Text-to-Image, Image-to-Video) via Seedream/Seedance

#### Extended API
- Batch render (multiple renders in one request)
- Preview mode (low-res fast render)
- Queue status dashboard
- Prometheus metrics endpoint

#### Asset Types (14)
Video, Image, Text, RichText, Audio, Shape, SVG, HTML, Title, Luma, Caption, TextToImage, ImageToVideo

#### Effects
- Ken Burns: zoomIn, zoomOut, slideLeft, slideRight, slideUp, slideDown + Fast/Slow (linear constant speed)
- Transitions: fade, fadeSlow, fadeFast, reveal, wipe, slide, carousel, shuffle, zoom (20+ types)
- Filters: blur, boost, contrast, darken, greyscale, lighten, muted, negative
- Tween animations with cubic-bezier easing
- ChromaKey (canvas + FFmpeg)
- Transform (rotate, skew, flip)
- Speed control (video + audio atempo)

#### Audio
- Multi-track TTS audio mixing
- BGM with fadeIn/fadeOut/fadeInFadeOut effects
- Volume control per clip
- FFmpeg amix filter_complex for multi-stream combining

#### Infrastructure
- Docker Compose one-click deploy (renderforge + redis + chromium)
- Horizontal scaling: `docker compose up --scale renderforge=4 --scale chromium=4`
- SQLite (self-hosting) / PostgreSQL (cloud) via Drizzle ORM
- Local filesystem / S3-compatible storage (MinIO)
- Prometheus metrics + pino structured logging
- x-api-key + JWT Bearer authentication

#### Testing
- 270 tests across 23 test files
- Unit tests for all modules (parser, builder, capture, encoder, effects, assets)
- Integration tests for all API endpoints
- Beyond Orbit compatibility tests (real Shotstack payload validation)

#### n8n Integration
- Drop-in replacement for Shotstack in n8n workflows
- URL change only — timeline JSON payload 100% compatible
- Verified with Beyond Orbit 270-channel YouTube automation pipeline

# Changelog

## [0.3.0] - 2026-03-29

### VoiceCore TTS Integration

Add Fish Speech TTS provider for local text-to-speech generation.
VoiceCore is disabled by default (opt-in via `VOICECORE_ENABLED=true`).

#### Features
- **VoiceCore TTS Provider** — Fish Speech v1.5 local TTS via REST API
- `tts` type added to Create API (alongside text-to-image, image-to-video, upscale)
- ProviderRouter routes `type: 'tts'` to VoiceCoreTTSProvider
- Tier voice references via `style` field (maps to Fish Speech `reference_id`)
- WAV output saved to local storage, served via Serve API

#### RunPod Unified Deployment
- `docker-compose.runpod.yml` — single RTX 4090 runs all 3 engines
- VoiceCore Dockerfile (Fish Speech v1.5 + CUDA 12.4)
- VRAM budget: Fish Speech(2GB) + Flux(8GB) or HunyuanVideo(14GB)
- Monthly cost: ~$50 vs $5,522 with external APIs

#### Configuration
- `VOICECORE_ENABLED`, `VOICECORE_HOST`, `VOICECORE_PORT` env vars
- VoiceCore section added to `config/index.ts`

#### Testing
- VoiceCoreTTSProvider unit tests (mocked fetch, error handling, config parsing)

## [0.2.0] - 2026-03-30

### VisualCore Integration

Integrate VisualCore local GPU inference engine into RenderForge Create API.
GPU features are disabled by default (opt-in via `GPU_ENABLED=true`).

#### Create API Enhancements
- Add `upscale` type to Create API (alongside text-to-image, image-to-video)
- Add optional `priority` and `style` fields to generation requests
- ProviderRouter: automatic routing based on type, visual_priority, and availability
- Backward compatible: existing behavior unchanged when GPU is disabled

#### Local GPU Providers
- **Flux Klein 4B** (text-to-image) via ComfyUI WebSocket API
- **HunyuanVideo 1.5** (image-to-video) via local REST API
- **Real-ESRGAN** (upscale) via ncnn-vulkan CLI
- **Seedance API** (remote fallback) for high-priority video scenes

#### GPU Memory Manager
- Single-GPU VRAM orchestration (RTX 4090 24GB target)
- Model swap queue with deduplication
- Fish Speech always-resident (2GB) for TTS coexistence

#### Quality Control Pipeline
- CLIP score prompt-image alignment check
- Aesthetic score evaluation
- NSFW detection and rejection
- Video temporal consistency and motion detection
- Auto-retry with seed variation (up to 3 attempts)
- Fallback to external API on QC exhaustion

#### Docker GPU Stack
- `docker-compose.gpu.yml` with ComfyUI + HunyuanVideo + VoiceCore
- HunyuanVideo Dockerfile + FastAPI REST wrapper
- Model download script (`scripts/download-models.sh`)

#### Testing
- 23 new VisualCore tests (293 total across 24 test files)
- Dimension resolution, GPU memory management, routing logic, QC thresholds

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

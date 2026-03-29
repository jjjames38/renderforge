import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { getDb } from './db/index.js';
import { renderRoutes } from './api/edit/render.js';
import { templateRoutes } from './api/edit/templates.js';
import { sourcesRoutes } from './api/ingest/sources.js';
import { uploadRoutes } from './api/ingest/upload.js';
import { assetsRoutes } from './api/serve/assets.js';
import { createRoutes } from './api/create/generate.js';
import { inspectRoutes } from './api/edit/inspect.js';
import { createRenderWorker } from './queue/workers/render-worker.js';
import { createIngestWorker } from './queue/workers/ingest-worker.js';
import { createCreateWorker } from './queue/workers/create-worker.js';
import { createQueues } from './queue/queues.js';
import { batchRoutes } from './api/extended/batch.js';
import { previewRoutes } from './api/extended/preview.js';
import { queueStatusRoutes } from './api/extended/queue-status.js';
import { metricsRoutes } from './api/metrics.js';
import { config } from './config/index.js';
import type { Worker } from 'bullmq';

export async function createServer(opts?: { testing?: boolean }) {
  const app = Fastify({
    logger: opts?.testing ? false : {
      transport: { target: 'pino-pretty' },
    },
  });

  await app.register(cors);

  // Initialize DB (in-memory for tests, file-based otherwise)
  const dbPath = opts?.testing ? ':memory:' : undefined;
  const db = getDb(dbPath, { migrate: true });

  // Attach db to app for routes to use
  (app as any).db = db;

  app.get('/', async () => ({
    name: 'renderforge',
    version: '0.1.0',
    status: 'ok',
  }));

  // Register static file serving for rendered assets
  const storagePath = resolve(config.storage.path);
  mkdirSync(storagePath, { recursive: true });
  await app.register(fastifyStatic, {
    root: storagePath,
    prefix: '/serve/v1/assets/',
    decorateReply: false,
  });

  // Register API routes
  await app.register(renderRoutes);
  await app.register(templateRoutes);
  await app.register(sourcesRoutes);
  await app.register(uploadRoutes);
  await app.register(assetsRoutes);
  await app.register(createRoutes);
  await app.register(inspectRoutes);

  // Register extended API routes
  await app.register(batchRoutes);
  await app.register(previewRoutes);
  await app.register(queueStatusRoutes);
  await app.register(metricsRoutes);

  // Start render worker and queues (skip in test mode)
  if (!opts?.testing) {
    const queues = createQueues();
    (app as any).queues = queues;

    const renderWorker = createRenderWorker(db);
    (app as any).renderWorker = renderWorker;

    const ingestWorker = createIngestWorker(db);
    (app as any).ingestWorker = ingestWorker;

    // ── VisualCore GPU Pipeline (opt-in) ──
    let gpuManager: any = null;
    let providerRouter: any = null;

    if (config.gpu.enabled) {
      const { GPUMemoryManager } = await import('./create/gpu/memory-manager.js');
      const { ProviderRouter } = await import('./create/providers/router.js');

      gpuManager = new GPUMemoryManager({ fishSpeechResident: true });

      const visualCoreConfig = {
        comfyui: {
          host: config.comfyui.host,
          port: config.comfyui.port,
          protocol: config.comfyui.protocol,
        },
        hunyuan: {
          host: config.hunyuan.host,
          port: config.hunyuan.port,
          enable_step_distill: config.hunyuan.enableStepDistill,
          default_steps: 8,
        },
        seedance: {
          api_key: process.env.SEEDANCE_API_KEY ?? '',
          api_url: process.env.SEEDANCE_API_URL ?? '',
          tier: (process.env.SEEDANCE_TIER ?? 'fast') as 'fast' | 'pro',
        },
        seedream: {
          api_key: process.env.SEEDREAM_API_KEY ?? '',
          api_url: process.env.SEEDREAM_API_URL ?? '',
        },
        qc: {
          clip_threshold: config.qc.clipThreshold,
          aesthetic_threshold: config.qc.aestheticThreshold,
          nsfw_threshold: config.qc.nsfwThreshold,
          max_retries: 3,
          fallback_to_api: true,
        },
        gpu: {
          swap_strategy: config.gpu.swapStrategy as 'on-demand' | 'scheduled',
          default_model: 'flux-klein',
          fish_speech_resident: true,
          vram_total_gb: Math.round(config.gpu.vramBudget / 1024),
        },
        lora_presets: {},
        voicecore: {
          host: config.voicecore.host,
          port: config.voicecore.port,
          enabled: config.voicecore.enabled,
        },
      };

      providerRouter = new ProviderRouter(visualCoreConfig, gpuManager);

      app.log.info('VisualCore GPU pipeline initialized');
    }

    const createWorker = createCreateWorker(providerRouter ?? undefined);
    (app as any).createWorker = createWorker;

    app.addHook('onClose', async () => {
      await renderWorker.close();
      await ingestWorker.close();
      await createWorker.close();
      await Promise.all(Object.values(queues).map((q: any) => q.close()));

      // Cleanup GPU resources
      if (gpuManager) {
        await gpuManager.unloadAll();
      }
    });

    await app.ready();
  }

  return app;
}

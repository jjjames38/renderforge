import { mkdirSync } from 'fs';
import { join } from 'path';
import { acquirePage, releasePage } from './browser-pool.js';

export interface CaptureOptions {
  html: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  isStatic?: boolean;
}

export interface CaptureResult {
  frameDir: string;
  frameCount: number;
  framePattern: string;
}

// Recycle the Puppeteer page every N frames to prevent Chromium OOM.
const PAGE_RECYCLE_INTERVAL = 1000;

// Load HTML content with timeout protection
async function loadContent(page: any, html: string, isFirst: boolean): Promise<void> {
  // Use setContent with a race against a hard timeout
  const loadPromise = page.setContent(html, {
    waitUntil: isFirst ? 'networkidle2' : 'domcontentloaded',
    timeout: isFirst ? 60000 : 10000,
  });

  // Hard timeout: if setContent doesn't resolve, force continue
  const timeoutMs = isFirst ? 60000 : 10000;
  await Promise.race([
    loadPromise,
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]).catch(() => {}); // swallow any error, proceed with whatever loaded
}

export async function captureFrames(opts: CaptureOptions): Promise<CaptureResult> {
  mkdirSync(opts.outputDir, { recursive: true });

  if (opts.isStatic) {
    const page = await acquirePage(opts.width, opts.height);
    try {
      await loadContent(page, opts.html, true);
      await page.evaluate((time: number) => {
        if (typeof (window as any).updateFrame === 'function') {
          (window as any).updateFrame(time);
        }
      }, 0);
      await page.screenshot({
        path: join(opts.outputDir, 'frame_00001.png'),
        type: 'png',
      });
      return { frameDir: opts.outputDir, frameCount: 1, framePattern: 'frame_%05d.png' };
    } finally {
      await releasePage(page);
    }
  }

  const totalFrames = Math.ceil(opts.fps * opts.duration);
  let page = await acquirePage(opts.width, opts.height);
  let pageFrameCount = 0;

  try {
    await loadContent(page, opts.html, true);

    for (let i = 0; i < totalFrames; i++) {
      // Periodic GC instead of page recycle (avoids setContent hang on reload)
      if (pageFrameCount > 0 && pageFrameCount % PAGE_RECYCLE_INTERVAL === 0) {
        try {
          const cdp = await page.createCDPSession();
          await cdp.send('HeapProfiler.collectGarbage');
          await cdp.detach();
        } catch {} // ignore GC errors
      }

      const currentTime = i / opts.fps;

      await page.evaluate((time: number) => {
        if (typeof (window as any).updateFrame === 'function') {
          (window as any).updateFrame(time);
        }
      }, currentTime);

      const frameNum = String(i + 1).padStart(5, '0');
      await page.screenshot({
        path: join(opts.outputDir, `frame_${frameNum}.png`),
        type: 'png',
      });

      pageFrameCount++;
    }

    return { frameDir: opts.outputDir, frameCount: totalFrames, framePattern: 'frame_%05d.png' };
  } finally {
    await releasePage(page);
  }
}

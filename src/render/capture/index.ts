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

// Load HTML content into page with image preloading and timeout
async function loadContent(page: any, html: string, isFirst: boolean): Promise<void> {
  if (isFirst) {
    // First load: wait for all images via networkidle0 (max 30s)
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  } else {
    // Recycle: use domcontentloaded (fast) + explicit image wait
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    // Wait for images already cached by browser (max 5s)
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images).map((img: HTMLImageElement) =>
          img.complete ? Promise.resolve() :
          new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 3000); })
        )
      );
    }).catch(() => {}); // ignore timeout
  }
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
      // Recycle page every N frames to prevent Chromium memory buildup
      if (pageFrameCount >= PAGE_RECYCLE_INTERVAL) {
        await releasePage(page);
        page = await acquirePage(opts.width, opts.height);
        await loadContent(page, opts.html, false);
        pageFrameCount = 0;
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

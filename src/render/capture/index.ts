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

/**
 * Load HTML into page using setContent with domcontentloaded (never hangs).
 * Then wait for images via evaluate with a hard timeout.
 */
async function loadHtml(page: any, html: string): Promise<void> {
  // domcontentloaded returns as soon as HTML is parsed — never waits for network
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for all <img> elements to load (with 15s hard timeout)
  try {
    await page.waitForFunction(
      () => Array.from(document.images).every((img: HTMLImageElement) => img.complete),
      { timeout: 15000 },
    );
  } catch {
    // Some images may not load (404, slow network) — proceed anyway
  }
}

export async function captureFrames(opts: CaptureOptions): Promise<CaptureResult> {
  mkdirSync(opts.outputDir, { recursive: true });

  if (opts.isStatic) {
    const page = await acquirePage(opts.width, opts.height);
    try {
      await loadHtml(page, opts.html);
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
  const page = await acquirePage(opts.width, opts.height);

  try {
    await loadHtml(page, opts.html);

    for (let i = 0; i < totalFrames; i++) {
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
    }

    return { frameDir: opts.outputDir, frameCount: totalFrames, framePattern: 'frame_%05d.png' };
  } finally {
    await releasePage(page);
  }
}

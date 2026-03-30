import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { acquirePage, releasePage } from './browser-pool.js';

export type ProgressCallback = (frame: number, totalFrames: number) => void;

export interface CaptureOptions {
  html: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  isStatic?: boolean;
  onProgress?: ProgressCallback;
}

export interface CaptureResult {
  frameDir: string;
  frameCount: number;
  framePattern: string;
  resumed: boolean;
  resumedFrom: number;
}

interface Checkpoint {
  lastFrame: number;
  totalFrames: number;
  updatedAt: string;
}

const CHECKPOINT_INTERVAL = 100;

function readCheckpoint(dir: string): Checkpoint | null {
  const path = join(dir, 'checkpoint.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCheckpoint(dir: string, lastFrame: number, totalFrames: number): void {
  const path = join(dir, 'checkpoint.json');
  const data: Checkpoint = { lastFrame, totalFrames, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(data));
}

function frameExists(dir: string, frameNum: string): boolean {
  return existsSync(join(dir, `frame_${frameNum}.png`));
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
      return { frameDir: opts.outputDir, frameCount: 1, framePattern: 'frame_%05d.png', resumed: false, resumedFrom: 0 };
    } finally {
      await releasePage(page);
    }
  }

  const totalFrames = Math.ceil(opts.fps * opts.duration);

  // Check for existing checkpoint to resume from
  const checkpoint = readCheckpoint(opts.outputDir);
  let startFrame = 0;
  let resumed = false;

  if (checkpoint && checkpoint.totalFrames === totalFrames && checkpoint.lastFrame > 0) {
    // Verify the last checkpointed frame actually exists on disk
    const lastFrameNum = String(checkpoint.lastFrame).padStart(5, '0');
    if (frameExists(opts.outputDir, lastFrameNum)) {
      startFrame = checkpoint.lastFrame;
      resumed = true;
    }
  }

  const page = await acquirePage(opts.width, opts.height);

  try {
    await loadHtml(page, opts.html);

    for (let i = startFrame; i < totalFrames; i++) {
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

      // Write checkpoint every N frames
      if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
        writeCheckpoint(opts.outputDir, i + 1, totalFrames);
      }

      // Report progress
      opts.onProgress?.(i + 1, totalFrames);
    }

    // Final checkpoint
    writeCheckpoint(opts.outputDir, totalFrames, totalFrames);

    return {
      frameDir: opts.outputDir,
      frameCount: totalFrames,
      framePattern: 'frame_%05d.png',
      resumed,
      resumedFrom: resumed ? startFrame : 0,
    };
  } finally {
    await releasePage(page);
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync } from 'fs';

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
}));

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    chromium: { wsEndpoint: 'ws://localhost:3001' },
  },
}));

const mockPage = {
  setViewport: vi.fn(),
  setContent: vi.fn(),
  screenshot: vi.fn(),
  evaluate: vi.fn().mockResolvedValue(undefined),
  waitForFunction: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
};

const mockBrowser = {
  connected: true,
  newPage: vi.fn().mockResolvedValue(mockPage),
};

vi.mock('puppeteer-core', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowser.newPage.mockResolvedValue(mockPage);
});

describe('browser-pool', () => {
  it('acquirePage sets viewport to correct width and height', async () => {
    const { acquirePage } = await import(
      '../../../src/render/capture/browser-pool.js'
    );
    const page = await acquirePage(1920, 1080);
    expect(mockPage.setViewport).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
    });
    expect(page).toBe(mockPage);
  });

  it('releasePage calls page.close()', async () => {
    const { releasePage } = await import(
      '../../../src/render/capture/browser-pool.js'
    );
    await releasePage(mockPage as any);
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('releasePage swallows errors from page.close()', async () => {
    const { releasePage } = await import(
      '../../../src/render/capture/browser-pool.js'
    );
    mockPage.close.mockRejectedValueOnce(new Error('already closed'));
    await expect(releasePage(mockPage as any)).resolves.toBeUndefined();
  });
});

describe('captureFrames', () => {
  it('creates outputDir recursively', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    await captureFrames({
      html: '<html></html>',
      outputDir: '/tmp/test-frames',
      width: 1920,
      height: 1080,
      fps: 25,
      duration: 1,
      isStatic: true,
    });
    expect(mkdirSync).toHaveBeenCalledWith('/tmp/test-frames', {
      recursive: true,
    });
  });

  it('static capture calls updateFrame(0), takes single screenshot and returns frameCount=1', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    const result = await captureFrames({
      html: '<html><body>Hello</body></html>',
      outputDir: '/tmp/static-frames',
      width: 1280,
      height: 720,
      fps: 25,
      duration: 5,
      isStatic: true,
    });

    expect(result.frameCount).toBe(1);
    expect(result.frameDir).toBe('/tmp/static-frames');
    expect(result.framePattern).toBe('frame_%05d.png');
    expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
    expect(mockPage.screenshot).toHaveBeenCalledWith({
      path: '/tmp/static-frames/frame_00001.png',
      type: 'png',
    });
    // Should call evaluate once for updateFrame at time 0 (loadContent no longer calls evaluate)
    expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
  });

  it('animated capture with duration=2 fps=25 calls screenshot 50 times', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    const result = await captureFrames({
      html: '<html><body>Animated</body></html>',
      outputDir: '/tmp/anim-frames',
      width: 1920,
      height: 1080,
      fps: 25,
      duration: 2,
      isStatic: false,
    });

    expect(result.frameCount).toBe(50);
    expect(result.frameDir).toBe('/tmp/anim-frames');
    expect(result.framePattern).toBe('frame_%05d.png');
    expect(mockPage.screenshot).toHaveBeenCalledTimes(50);
    // Should call evaluate 50 times: 50 (updateFrame for each frame)
    expect(mockPage.evaluate).toHaveBeenCalledTimes(50);
  });

  it('animated capture calls page.evaluate for each frame (no CDP animation control)', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    await captureFrames({
      html: '<html></html>',
      outputDir: '/tmp/anim-test',
      width: 800,
      height: 600,
      fps: 10,
      duration: 0.5,
      isStatic: false,
    });

    // 10fps * 0.5s = 5 frames = 5 evaluate calls (updateFrame only)
    expect(mockPage.evaluate).toHaveBeenCalledTimes(5);
    // No CDP session should be created (no animation playback rate control)
  });

  it('sets page content with waitUntil domcontentloaded', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    await captureFrames({
      html: '<html><body>Test</body></html>',
      outputDir: '/tmp/content-test',
      width: 1920,
      height: 1080,
      fps: 25,
      duration: 1,
      isStatic: true,
    });

    expect(mockPage.setContent).toHaveBeenCalledWith(
      '<html><body>Test</body></html>',
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
  });

  it('releases page even if screenshot throws', async () => {
    const { captureFrames } = await import(
      '../../../src/render/capture/index.js'
    );
    mockPage.screenshot.mockRejectedValueOnce(new Error('screenshot failed'));

    await expect(
      captureFrames({
        html: '<html></html>',
        outputDir: '/tmp/error-test',
        width: 800,
        height: 600,
        fps: 25,
        duration: 1,
        isStatic: true,
      }),
    ).rejects.toThrow('screenshot failed');

    expect(mockPage.close).toHaveBeenCalled();
  });
});

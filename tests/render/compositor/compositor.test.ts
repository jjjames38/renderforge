import { describe, it, expect } from 'vitest';
import { canUseFFmpegCompositor } from '../../../src/render/compositor/router.js';
import { buildInputs } from '../../../src/render/compositor/input_builder.js';
import { buildFilterGraph } from '../../../src/render/compositor/filter_graph.js';
import { mapKenBurns, mapColorFilter, mapTransition, getFFmpegTransitionDuration } from '../../../src/render/compositor/filters_ffmpeg.js';
import type { IRTimeline, IRScene, IRLayer } from '../../../src/render/parser/types.js';

// ---- Helpers ----

function makeLayer(overrides: Partial<IRLayer> = {}): IRLayer {
  return {
    type: 'visual',
    asset: { type: 'image', src: '/tmp/test.jpg' },
    timing: { start: 0, duration: 5 },
    effects: {},
    position: { fit: 'cover', scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}

function makeTimeline(layers: IRLayer[], format = 'mp4'): IRTimeline {
  const totalDuration = layers.reduce((max, l) => Math.max(max, l.timing.start + l.timing.duration), 0);
  return {
    scenes: [{
      startTime: 0,
      duration: totalDuration,
      layers,
    }],
    audio: { clips: [] },
    output: { width: 1920, height: 1080, fps: 25, format, quality: 'high' },
    assets: [],
  };
}

// ---- Router tests ----

describe('canUseFFmpegCompositor', () => {
  it('accepts timeline with image clips', () => {
    const ir = makeTimeline([makeLayer()]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(true);
  });

  it('accepts timeline with video clips', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'video', src: '/tmp/test.mp4' } }),
    ]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(true);
  });

  it('rejects SVG asset', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'svg', src: '/tmp/test.svg' } }),
    ]);
    const result = canUseFFmpegCompositor(ir);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('svg');
  });

  it('rejects luma asset', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'luma', src: '/tmp/luma.mp4' } }),
    ]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(false);
  });

  it('rejects tween opacity arrays', () => {
    const ir = makeTimeline([
      makeLayer({ effects: { opacity: [{ from: 0, to: 1, start: 0, length: 1 }] } }),
    ]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(false);
  });

  it('rejects shuffle transitions', () => {
    const ir = makeTimeline([
      makeLayer({ timing: { start: 0, duration: 5, transitionIn: 'shuffleLeft' } }),
    ]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(false);
  });

  it('accepts fade transitions', () => {
    const ir = makeTimeline([
      makeLayer({ timing: { start: 0, duration: 5, transitionIn: 'fade' } }),
    ]);
    expect(canUseFFmpegCompositor(ir).eligible).toBe(true);
  });

  it('rejects GIF output format', () => {
    const ir = makeTimeline([makeLayer()], 'gif');
    expect(canUseFFmpegCompositor(ir).eligible).toBe(false);
  });

  it('respects force puppeteer mode', () => {
    const ir = makeTimeline([makeLayer()]);
    expect(canUseFFmpegCompositor(ir, 'puppeteer').eligible).toBe(false);
  });

  it('respects force ffmpeg mode', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'svg', src: '/tmp/test.svg' } }),
    ]);
    expect(canUseFFmpegCompositor(ir, 'ffmpeg').eligible).toBe(true);
  });
});

// ---- Filter mapping tests ----

describe('filters_ffmpeg', () => {
  describe('mapKenBurns', () => {
    it('generates zoompan for zoomIn', () => {
      const result = mapKenBurns('zoomIn', 5, 1920, 1080, 25);
      expect(result).toBeTruthy();
      expect(result).toContain('zoompan');
      expect(result).toContain('1920x1080');
      expect(result).toContain('fps=25');
    });

    it('generates zoompan for zoomOut', () => {
      const result = mapKenBurns('zoomOut', 5, 1920, 1080, 25);
      expect(result).toContain('zoompan');
      expect(result).toContain('if(eq(on,1)');
    });

    it('generates zoompan for slideLeft', () => {
      const result = mapKenBurns('slideLeft', 5, 1920, 1080, 25);
      expect(result).toContain('zoompan');
    });

    it('returns null for unknown effect', () => {
      expect(mapKenBurns('unknownEffect', 5, 1920, 1080, 25)).toBeNull();
    });

    it('handles speed suffixes', () => {
      const fast = mapKenBurns('zoomInFast', 3, 1920, 1080, 25);
      const slow = mapKenBurns('zoomInSlow', 8, 1920, 1080, 25);
      expect(fast).toBeTruthy();
      expect(slow).toBeTruthy();
    });
  });

  describe('mapColorFilter', () => {
    it('maps boost to eq', () => {
      expect(mapColorFilter('boost')).toBe('eq=contrast=1.2:saturation=1.3');
    });

    it('maps greyscale to hue', () => {
      expect(mapColorFilter('greyscale')).toBe('hue=s=0');
    });

    it('maps darken to eq brightness', () => {
      expect(mapColorFilter('darken')).toBe('eq=brightness=-0.3');
    });

    it('returns null for unknown filter', () => {
      expect(mapColorFilter('nonexistent')).toBeNull();
    });
  });

  describe('mapTransition', () => {
    it('maps fade', () => {
      expect(mapTransition('fade')).toBe('fade');
    });

    it('maps slideLeft', () => {
      expect(mapTransition('slideLeft')).toBe('slideleft');
    });

    it('maps wipeRight', () => {
      expect(mapTransition('wipeRight')).toBe('wiperight');
    });

    it('returns null for shuffleLeft', () => {
      expect(mapTransition('shuffleLeft')).toBeNull();
    });

    it('strips speed suffix', () => {
      expect(mapTransition('fadeFast')).toBe('fade');
      expect(mapTransition('slideLeftSlow')).toBe('slideleft');
    });
  });

  describe('getFFmpegTransitionDuration', () => {
    it('returns 0.3 for normal speed', () => {
      expect(getFFmpegTransitionDuration('fade')).toBe(0.3);
    });

    it('returns 0.15 for fast', () => {
      expect(getFFmpegTransitionDuration('fadeFast')).toBe(0.15);
    });

    it('returns 0.6 for slow', () => {
      expect(getFFmpegTransitionDuration('fadeSlow')).toBe(0.6);
    });
  });
});

// ---- Input builder tests ----

describe('buildInputs', () => {
  it('builds inputs for image clips with loop flag', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'image', src: '/tmp/img1.jpg' }, timing: { start: 0, duration: 5 } }),
      makeLayer({ asset: { type: 'image', src: '/tmp/img2.jpg' }, timing: { start: 5, duration: 5 } }),
    ]);
    const result = buildInputs(ir, 10);
    expect(result.count).toBe(2);
    expect(result.indexMap.get('/tmp/img1.jpg')).toBe(0);
    expect(result.indexMap.get('/tmp/img2.jpg')).toBe(1);
    // Check loop flags are present
    expect(result.args).toContain('-loop');
    expect(result.args).toContain('1');
  });

  it('deduplicates same source used in multiple clips', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'image', src: '/tmp/same.jpg' }, timing: { start: 0, duration: 5 } }),
      makeLayer({ asset: { type: 'image', src: '/tmp/same.jpg' }, timing: { start: 5, duration: 5 } }),
    ]);
    const result = buildInputs(ir, 10);
    expect(result.count).toBe(1);
  });

  it('handles video inputs without loop', () => {
    const ir = makeTimeline([
      makeLayer({ asset: { type: 'video', src: '/tmp/clip.mp4' }, timing: { start: 0, duration: 5 } }),
    ]);
    const result = buildInputs(ir, 5);
    expect(result.count).toBe(1);
    // Video inputs should not have -loop flag
    const loopIdx = result.args.indexOf('-loop');
    expect(loopIdx).toBe(-1);
  });
});

// ---- Filter graph tests ----

describe('buildFilterGraph', () => {
  it('generates filter_complex for single image clip with ken burns', () => {
    const ir = makeTimeline([
      makeLayer({
        asset: { type: 'image', src: '/tmp/img.jpg' },
        timing: { start: 0, duration: 10 },
        effects: { motion: 'zoomIn' },
      }),
    ]);
    const indexMap = new Map([[ '/tmp/img.jpg', 0 ]]);
    const result = buildFilterGraph(ir, indexMap, '/tmp/prefetch');

    expect(result.filterComplex).toContain('zoompan');
    expect(result.videoOutputLabel).toBeTruthy();
  });

  it('generates xfade for sequential clips with transition', () => {
    const ir = makeTimeline([
      makeLayer({
        asset: { type: 'image', src: '/tmp/a.jpg' },
        timing: { start: 0, duration: 5, transitionOut: 'fade' },
      }),
      makeLayer({
        asset: { type: 'image', src: '/tmp/b.jpg' },
        timing: { start: 5, duration: 5, transitionIn: 'fade' },
      }),
    ]);
    const indexMap = new Map([[ '/tmp/a.jpg', 0 ], [ '/tmp/b.jpg', 1 ]]);
    const result = buildFilterGraph(ir, indexMap, '/tmp/prefetch');

    expect(result.filterComplex).toContain('xfade');
    expect(result.filterComplex).toContain('transition=fade');
  });

  it('generates color filter chain', () => {
    const ir = makeTimeline([
      makeLayer({
        asset: { type: 'image', src: '/tmp/img.jpg' },
        timing: { start: 0, duration: 5 },
        effects: { filter: 'boost' },
      }),
    ]);
    const indexMap = new Map([[ '/tmp/img.jpg', 0 ]]);
    const result = buildFilterGraph(ir, indexMap, '/tmp/prefetch');

    expect(result.filterComplex).toContain('eq=contrast=1.2:saturation=1.3');
  });

  it('handles empty timeline gracefully', () => {
    const ir = makeTimeline([]);
    const result = buildFilterGraph(ir, new Map(), '/tmp/prefetch');

    expect(result.filterComplex).toContain('color=c=black');
    expect(result.videoOutputLabel).toBeTruthy();
  });

  it('generates overlay for overlapping clips', () => {
    const ir = makeTimeline([
      makeLayer({
        asset: { type: 'image', src: '/tmp/bg.jpg' },
        timing: { start: 0, duration: 10 },
      }),
      makeLayer({
        asset: { type: 'image', src: '/tmp/fg.jpg' },
        timing: { start: 2, duration: 5 },
      }),
    ]);
    const indexMap = new Map([[ '/tmp/bg.jpg', 0 ], [ '/tmp/fg.jpg', 1 ]]);
    const result = buildFilterGraph(ir, indexMap, '/tmp/prefetch');

    expect(result.filterComplex).toContain('overlay');
    expect(result.filterComplex).toContain('between');
  });
});

import { describe, it, expect } from 'vitest';
import { renderImage } from '../../../src/render/assets/image.js';
import { renderText } from '../../../src/render/assets/text.js';
import { buildKenBurns } from '../../../src/render/effects/kenburns.js';
import { buildFilter } from '../../../src/render/effects/filters.js';
import { buildTransitionIn, buildTransitionOut } from '../../../src/render/effects/transitions.js';
import { buildScene, calcTimelineDuration } from '../../../src/render/builder/index.js';
import type { IRLayer, IRScene, IROutput } from '../../../src/render/parser/types.js';

// ---- Helpers ----

function makeImageLayer(overrides: Partial<IRLayer> = {}): IRLayer {
  return {
    type: 'visual',
    asset: { type: 'image', src: 'https://example.com/photo.jpg' },
    timing: { start: 0, duration: 5 },
    effects: {},
    position: { fit: 'crop', scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}

function makeTextLayer(overrides: Partial<IRLayer> = {}): IRLayer {
  return {
    type: 'visual',
    asset: {
      type: 'text',
      text: 'Hello World',
      font: { family: 'Montserrat', size: 48, color: '#ff0000', weight: 700 },
      stroke: { color: '#000000', width: 2 },
      alignment: { horizontal: 'center', vertical: 'top' },
    },
    timing: { start: 0, duration: 5 },
    effects: {},
    position: { fit: 'crop', scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}

function makeOutput(): IROutput {
  return {
    width: 1280,
    height: 720,
    fps: 25,
    format: 'mp4',
    quality: 'high',
  };
}

// ---- 1. ImageAsset rendering ----

describe('renderImage', () => {
  it('produces an <img> tag with correct src and object-fit cover for crop', () => {
    const result = renderImage(makeImageLayer(), 0);
    expect(result.html).toContain('<img');
    expect(result.html).toContain('src="https://example.com/photo.jpg"');
    expect(result.css).toContain('object-fit: cover');
    expect(result.css).toContain('position: absolute');
  });

  it('uses object-fit contain when fit is contain', () => {
    const layer = makeImageLayer({
      position: { fit: 'contain', scale: 1, offsetX: 0, offsetY: 0 },
    });
    const result = renderImage(layer, 0);
    expect(result.css).toContain('object-fit: contain');
  });

  it('applies scale and offset transforms', () => {
    const layer = makeImageLayer({
      position: { fit: 'crop', scale: 1.5, offsetX: 0.1, offsetY: -0.2 },
    });
    const result = renderImage(layer, 0);
    expect(result.css).toContain('scale(1.5)');
    expect(result.css).toContain('translateX(10%)');
    expect(result.css).toContain('translateY(20%)');
  });
});

// ---- 2. TextAsset rendering ----

describe('renderText', () => {
  it('produces a <div> with text content and font styling', () => {
    const result = renderText(makeTextLayer(), 0);
    expect(result.html).toContain('<div');
    expect(result.html).toContain('Hello World');
    expect(result.css).toContain("font-family: 'Montserrat'");
    expect(result.css).toContain('font-size: 48px');
    expect(result.css).toContain('color: #ff0000');
    expect(result.css).toContain('font-weight: 700');
  });

  it('applies stroke as text-shadow', () => {
    const result = renderText(makeTextLayer(), 0);
    expect(result.css).toContain('text-shadow:');
    expect(result.css).toContain('2px 0 #000000');
    expect(result.css).toContain('-2px 0 #000000');
    expect(result.css).toContain('0 2px #000000');
    expect(result.css).toContain('0 -2px #000000');
  });

  it('positions text at top when alignment.vertical is top', () => {
    const result = renderText(makeTextLayer(), 0);
    expect(result.css).toContain('top: 10%');
  });

  it('centers text when alignment.vertical is center', () => {
    const layer = makeTextLayer();
    layer.asset.alignment = { horizontal: 'center', vertical: 'center' };
    const result = renderText(layer, 0);
    expect(result.css).toContain('top: 50%');
    expect(result.css).toContain('translateY(-50%)');
  });
});

// ---- 3. Ken Burns zoomIn ----

describe('buildKenBurns', () => {
  it('zoomIn produces keyframes with scale(1) to scale(1.3)', () => {
    const result = buildKenBurns('zoomIn');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('scale(1)');
    expect(result!.keyframes).toContain('scale(1.3)');
    expect(result!.keyframes).toContain('5s');
    expect(result!.className).toBe('kb-zoomIn');
  });

  // ---- 4. Ken Burns slideLeft ----

  it('slideLeft produces keyframes with translateX(0) to translateX(-10%)', () => {
    const result = buildKenBurns('slideLeft');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('translateX(0)');
    expect(result!.keyframes).toContain('translateX(-10%)');
  });

  it('fast variant uses 3s duration', () => {
    const result = buildKenBurns('zoomInFast');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('3s');
  });

  it('slow variant uses 8s duration', () => {
    const result = buildKenBurns('slideUpSlow');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('8s');
  });

  it('returns null for unknown effects', () => {
    expect(buildKenBurns('unknown')).toBeNull();
  });
});

// ---- 5. Filter boost ----

describe('buildFilter', () => {
  it('boost returns contrast(1.2) saturate(1.3)', () => {
    expect(buildFilter('boost')).toBe('filter: contrast(1.2) saturate(1.3)');
  });

  // ---- 6. Filter greyscale ----

  it('greyscale returns grayscale(1)', () => {
    expect(buildFilter('greyscale')).toBe('filter: grayscale(1)');
  });

  it('none returns empty string', () => {
    expect(buildFilter('none')).toBe('');
  });

  it('unknown returns empty string', () => {
    expect(buildFilter('nonexistent')).toBe('');
  });

  it('blur returns blur(5px)', () => {
    expect(buildFilter('blur')).toBe('filter: blur(5px)');
  });
});

// ---- 7. Transition fade in ----

describe('buildTransitionIn', () => {
  it('fade produces opacity 0 to 1 keyframes', () => {
    const result = buildTransitionIn('fade');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('opacity: 0');
    expect(result!.keyframes).toContain('opacity: 1');
    expect(result!.duration).toBe(1);
  });

  it('fadeSlow uses 2s duration', () => {
    const result = buildTransitionIn('fadeSlow');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('2s');
    expect(result!.duration).toBe(2);
  });

  it('fadeFast uses 0.5s duration', () => {
    const result = buildTransitionIn('fadeFast');
    expect(result).not.toBeNull();
    expect(result!.keyframes).toContain('0.5s');
    expect(result!.duration).toBe(0.5);
  });

  it('returns null for unknown transitions', () => {
    expect(buildTransitionIn('unknown')).toBeNull();
  });
});

describe('buildTransitionOut', () => {
  it('fade out reverses: opacity 1 to 0', () => {
    const result = buildTransitionOut('fade');
    expect(result).not.toBeNull();
    // Out reverses: from 1 -> to 0
    expect(result!.keyframes).toContain('from { opacity: 1;');
    expect(result!.keyframes).toContain('to { opacity: 0;');
  });
});

// ---- 8. Full scene build ----

describe('buildScene', () => {
  it('produces valid HTML document with viewport matching output dimensions', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [makeImageLayer()],
    };
    const output = makeOutput();
    const html = buildScene(scene, output);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('width: 1280px');
    expect(html).toContain('height: 720px');
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/photo.jpg"');
  });

  // ---- 9. Multiple layers z-index ----

  it('assigns z-index so first layer is on top', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [
        makeTextLayer(),
        makeImageLayer(),
      ],
    };
    const output = makeOutput();
    const html = buildScene(scene, output);

    // First layer (text, index 0) should have z-index: 2 (totalLayers - 0)
    // Second layer (image, index 1) should have z-index: 1 (totalLayers - 1)
    expect(html).toContain('#layer-0 { z-index: 2; }');
    expect(html).toContain('#layer-1 { z-index: 1; }');
  });

  it('applies Ken Burns effect to scene layers', () => {
    const layer = makeImageLayer({
      effects: { motion: 'zoomIn' },
    });
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [layer],
    };
    const html = buildScene(scene, makeOutput());

    expect(html).toContain('kb-zoomIn');
    expect(html).toContain('@keyframes kb-zoomIn');
  });

  it('applies filter effect to scene layers', () => {
    const layer = makeImageLayer({
      effects: { filter: 'greyscale' },
    });
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [layer],
    };
    const html = buildScene(scene, makeOutput());

    expect(html).toContain('filter: grayscale(1)');
  });

  it('applies transitions to scene layers', () => {
    const layer = makeImageLayer({
      timing: { start: 0, duration: 5, transitionIn: 'fade', transitionOut: 'fade' },
    });
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [layer],
    };
    const html = buildScene(scene, makeOutput());

    expect(html).toContain('trans-in-fade');
    expect(html).toContain('trans-out-fade');
  });

  it('skips audio layers', () => {
    const audioLayer: IRLayer = {
      type: 'audio',
      asset: { type: 'audio', src: 'https://example.com/music.mp3' },
      timing: { start: 0, duration: 5 },
      effects: {},
      position: { fit: 'crop', scale: 1, offsetX: 0, offsetY: 0 },
    };
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [audioLayer],
    };
    const html = buildScene(scene, makeOutput());

    // Should have body but no layer content
    expect(html).toContain('<body>');
    expect(html).not.toContain('layer-0');
  });
});

// ---- 10. Timing-based visibility ----

describe('calcTimelineDuration', () => {
  it('returns max(start + duration) across all visual layers', () => {
    const layers: IRLayer[] = [
      makeImageLayer({ timing: { start: 0, duration: 3 } }),
      makeTextLayer({ timing: { start: 2, duration: 5 } }),
    ];
    expect(calcTimelineDuration(layers)).toBe(7);
  });

  it('ignores audio layers', () => {
    const layers: IRLayer[] = [
      makeImageLayer({ timing: { start: 0, duration: 3 } }),
      { type: 'audio', asset: { type: 'audio' }, timing: { start: 0, duration: 100 }, effects: {}, position: { fit: 'crop', scale: 1, offsetX: 0, offsetY: 0 } },
    ];
    expect(calcTimelineDuration(layers)).toBe(3);
  });

  it('returns 0 for no visual layers', () => {
    expect(calcTimelineDuration([])).toBe(0);
  });
});

describe('buildScene timing visibility', () => {
  it('generates visibility keyframes for layers with different start times using wrapper divs', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 10,
      layers: [
        makeImageLayer({ timing: { start: 0, duration: 5 } }),
        makeTextLayer({ timing: { start: 5, duration: 5 } }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 10);

    // Both layers should have visibility animations on wrapper divs
    expect(html).toContain('@keyframes vis-0');
    expect(html).toContain('@keyframes vis-1');
    // Wrapper divs get the visibility animation
    expect(html).toContain('#layer-0-wrapper');
    expect(html).toContain('#layer-1-wrapper');
    expect(html).toContain('animation: vis-0 10s step-end forwards');
    expect(html).toContain('animation: vis-1 10s step-end forwards');
  });

  it('does not add visibility animation when layer covers entire timeline', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 5,
      layers: [
        makeImageLayer({ timing: { start: 0, duration: 5 } }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 5);

    // Single layer covering entire timeline: no visibility animation needed
    expect(html).not.toContain('@keyframes vis-0');
    expect(html).not.toContain('layer-0-wrapper');
  });

  it('sets wrapper opacity to 0 by default when visibility animation is applied', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 10,
      layers: [
        makeTextLayer({ timing: { start: 3, duration: 4 } }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 10);

    expect(html).toContain('#layer-0-wrapper { opacity: 0;');
  });

  it('adds animation-delay to KenBurns matching layer start time', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 10,
      layers: [
        makeImageLayer({
          timing: { start: 3, duration: 5 },
          effects: { motion: 'zoomIn' },
        }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 10);

    expect(html).toContain('animation-delay: 3s');
    expect(html).toContain('kb-zoomIn');
    // KenBurns class should be on inner layer, visibility on wrapper
    expect(html).toContain('layer-0-wrapper');
  });

  it('adds animation-delay to transition-in matching layer start time', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 10,
      layers: [
        makeImageLayer({
          timing: { start: 2, duration: 5, transitionIn: 'fade' },
        }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 10);

    expect(html).toContain('animation-delay: 2s');
    expect(html).toContain('trans-in-fade');
  });

  it('adds animation-delay to transition-out near layer end time', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 10,
      layers: [
        makeImageLayer({
          timing: { start: 2, duration: 5, transitionOut: 'fade' },
        }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 10);

    // fade transition-out duration is 1s, so delay = 2 + 5 - 1 = 6s
    expect(html).toContain('animation-delay: 6s');
    expect(html).toContain('trans-out-fade');
  });

  it('subtitle layers appear and disappear at correct times', () => {
    // Simulate a typical subtitle scenario: 3 captions appearing sequentially
    const scene: IRScene = {
      startTime: 0,
      duration: 15,
      layers: [
        makeImageLayer({ timing: { start: 0, duration: 15 } }), // background
        makeTextLayer({ timing: { start: 0, duration: 5 }, asset: { type: 'text', text: 'Subtitle 1' } }),
        makeTextLayer({ timing: { start: 5, duration: 5 }, asset: { type: 'text', text: 'Subtitle 2' } }),
        makeTextLayer({ timing: { start: 10, duration: 5 }, asset: { type: 'text', text: 'Subtitle 3' } }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 15);

    // Background covers entire timeline - no visibility anim
    expect(html).not.toContain('@keyframes vis-0');
    // Each subtitle gets its own visibility animation on wrappers
    expect(html).toContain('@keyframes vis-1');
    expect(html).toContain('@keyframes vis-2');
    expect(html).toContain('@keyframes vis-3');
    expect(html).toContain('layer-1-wrapper');
    expect(html).toContain('layer-2-wrapper');
    expect(html).toContain('layer-3-wrapper');
  });

  it('KenBurns and visibility work together without CSS conflicts', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 18,
      layers: [
        makeImageLayer({
          timing: { start: 0, duration: 6 },
          effects: { motion: 'zoomIn' },
        }),
        makeImageLayer({
          timing: { start: 6, duration: 6 },
          effects: { motion: 'slideLeft' },
        }),
        makeImageLayer({
          timing: { start: 12, duration: 6 },
          effects: { motion: 'zoomOut' },
        }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 18);

    // Each layer should have wrapper for visibility and inner class for KenBurns
    expect(html).toContain('layer-0-wrapper');
    expect(html).toContain('kb-zoomIn');
    expect(html).toContain('layer-1-wrapper');
    expect(html).toContain('kb-slideLeft');
    expect(html).toContain('layer-2-wrapper');
    expect(html).toContain('kb-zoomOut');

    // Visibility animates opacity on wrapper, KenBurns animates transform on inner
    // These should not conflict because they target different elements
    expect(html).toContain('@keyframes vis-0');
    expect(html).toContain('@keyframes vis-1');
    expect(html).toContain('@keyframes vis-2');
    expect(html).toContain('@keyframes kb-zoomIn');
    expect(html).toContain('@keyframes kb-slideLeft');
    expect(html).toContain('@keyframes kb-zoomOut');
  });

  it('fade transition and visibility work together via wrapper div separation', () => {
    const scene: IRScene = {
      startTime: 0,
      duration: 12,
      layers: [
        makeImageLayer({
          timing: { start: 0, duration: 6, transitionIn: 'fade', transitionOut: 'fade' },
          effects: { motion: 'zoomIn' },
        }),
        makeImageLayer({
          timing: { start: 6, duration: 6, transitionIn: 'fade', transitionOut: 'fade' },
          effects: { motion: 'zoomOut' },
        }),
      ],
    };
    const html = buildScene(scene, makeOutput(), 12);

    // Visibility on wrappers
    expect(html).toContain('layer-0-wrapper');
    expect(html).toContain('layer-1-wrapper');
    // Transitions and KenBurns on inner divs
    expect(html).toContain('trans-in-fade');
    expect(html).toContain('trans-out-fade');
    expect(html).toContain('kb-zoomIn');
    expect(html).toContain('kb-zoomOut');
  });
});

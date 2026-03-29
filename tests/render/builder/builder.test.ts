import { describe, it, expect } from 'vitest';
import { renderImage } from '../../../src/render/assets/image.js';
import { renderText } from '../../../src/render/assets/text.js';
import { buildKenBurns } from '../../../src/render/effects/kenburns.js';
import { buildFilter } from '../../../src/render/effects/filters.js';
import { buildTransitionIn, buildTransitionOut } from '../../../src/render/effects/transitions.js';
import { buildScene } from '../../../src/render/builder/index.js';
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

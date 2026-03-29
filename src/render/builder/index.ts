// Scene Builder: converts IR scene into full HTML/CSS page for Puppeteer capture.

import type { IRScene, IRLayer, IROutput } from '../parser/types.js';
import { wrapInHtml } from './html-template.js';
import { renderImage } from '../assets/image.js';
import { renderText } from '../assets/text.js';
import { renderVideo } from '../assets/video.js';
import { renderRichText } from '../assets/richtext.js';
import { renderHtml } from '../assets/html.js';
import { renderShape } from '../assets/shape.js';
import { renderSvg } from '../assets/svg.js';
import { renderTitle } from '../assets/title.js';
import { renderLuma } from '../assets/luma.js';
import { buildKenBurns } from '../effects/kenburns.js';
import { buildFilter } from '../effects/filters.js';
import { buildTransitionIn, buildTransitionOut } from '../effects/transitions.js';

/**
 * Render a single layer to HTML + CSS based on its asset type.
 */
function renderLayer(layer: IRLayer, index: number): { html: string; css: string } {
  switch (layer.asset.type) {
    case 'image':
      return renderImage(layer, index);
    case 'video':
      return renderVideo(layer, index);
    case 'text':
    case 'caption':
      return renderText(layer, index);
    case 'title':
      return renderTitle(layer, index);
    case 'richtext':
      return renderRichText(layer, index);
    case 'html':
      return renderHtml(layer, index);
    case 'shape':
      return renderShape(layer, index);
    case 'svg':
      return renderSvg(layer, index);
    case 'luma':
      return renderLuma(layer, index);
    default:
      // For unsupported types, return an empty placeholder
      return {
        html: `<div id="layer-${index}" class="unsupported"></div>`,
        css: `#layer-${index} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }`,
      };
  }
}

/**
 * Calculate the total timeline duration from all layers.
 * This is the maximum (start + duration) across all visual layers.
 */
export function calcTimelineDuration(layers: IRLayer[]): number {
  let max = 0;
  for (const layer of layers) {
    if (layer.type !== 'visual') continue;
    const end = layer.timing.start + layer.timing.duration;
    if (end > max) max = end;
  }
  return max;
}

/**
 * Build CSS keyframes for timing-based layer visibility using a WRAPPER div.
 *
 * The wrapper div controls opacity (show/hide) via step-end timing,
 * leaving the inner layer div free to handle KenBurns (transform)
 * and transitions (opacity for fade, transform for slides, etc.)
 * without CSS animation property conflicts.
 */
function buildVisibilityAnimation(
  index: number,
  start: number,
  duration: number,
  totalDuration: number,
): { keyframes: string; wrapperStyle: string } {
  // Edge case: if totalDuration is 0 or layer covers the entire timeline, always show
  if (totalDuration <= 0 || (start <= 0 && duration >= totalDuration)) {
    return { keyframes: '', wrapperStyle: '' };
  }

  const startPct = (start / totalDuration) * 100;
  const endPct = ((start + duration) / totalDuration) * 100;
  const name = `vis-${index}`;

  const keyframes = `@keyframes ${name} {
  0% { opacity: 0; }
  ${startPct.toFixed(4)}% { opacity: 1; }
  ${endPct.toFixed(4)}% { opacity: 0; }
  100% { opacity: 0; }
}`;

  const wrapperStyle = `#layer-${index}-wrapper { opacity: 0; animation: ${name} ${totalDuration}s step-end forwards; }`;

  return { keyframes, wrapperStyle };
}

/**
 * Build the complete HTML page for a single scene.
 *
 * Architecture: Each layer uses a wrapper div pattern:
 *   <div id="layer-N-wrapper"> -- visibility animation (opacity via step-end)
 *     <div id="layer-N" class="kb-xxx trans-in-xxx"> -- KenBurns + transitions
 *       <img ...> (or text div, etc.)
 *     </div>
 *   </div>
 *
 * This prevents CSS animation conflicts:
 * - Wrapper animates opacity for visibility (step-end, no smooth transition)
 * - Inner div animates transform (KenBurns) and can also animate opacity (fade transitions)
 * - Multiple CSS animations on the inner div use comma-separated animation shorthand
 *
 * Layers are rendered with z-index so that the first layer in the array
 * appears on top (highest z-index), matching Shotstack's track ordering.
 */
export function buildScene(scene: IRScene, output: IROutput, totalDuration?: number): string {
  const allCss: string[] = [];
  const allHtml: string[] = [];

  const totalLayers = scene.layers.length;

  // Calculate the effective total duration for visibility animations
  const effectiveDuration = totalDuration ?? calcTimelineDuration(scene.layers);

  for (let i = 0; i < totalLayers; i++) {
    const layer = scene.layers[i];
    if (layer.type !== 'visual') continue;

    const { html, css } = renderLayer(layer, i);
    const classes: string[] = [];

    // z-index on wrapper so stacking order is correct
    const zIndex = totalLayers - i;
    let layerCss = css;

    // Timing-based visibility on WRAPPER div
    const vis = buildVisibilityAnimation(i, layer.timing.start, layer.timing.duration, effectiveDuration);
    const needsWrapper = !!vis.keyframes;

    if (needsWrapper) {
      allCss.push(vis.keyframes);
      // Wrapper gets z-index and position so it stacks correctly
      layerCss += `\n  #layer-${i}-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: ${zIndex}; }`;
      layerCss += `\n  ${vis.wrapperStyle}`;
    } else {
      layerCss += `\n  #layer-${i} { z-index: ${zIndex}; }`;
    }

    // Apply motion (Ken Burns) effect with animation-delay matching layer start
    if (layer.effects.motion) {
      const kb = buildKenBurns(layer.effects.motion);
      if (kb) {
        // Override animation-delay to match layer start time
        const delayedKeyframes = kb.keyframes.replace(
          /animation: ([^ ]+) ([^ ]+) ([^ ]+) forwards;/,
          `animation: $1 $2 $3 forwards; animation-delay: ${layer.timing.start}s;`
        );
        allCss.push(delayedKeyframes);
        classes.push(kb.className);
      }
    }

    // Apply filter effect
    if (layer.effects.filter) {
      const filterVal = buildFilter(layer.effects.filter);
      if (filterVal) {
        layerCss += `\n  #layer-${i} { ${filterVal}; }`;
      }
    }

    // Apply opacity (only when no visibility animation, to avoid conflicts)
    if (layer.effects.opacity !== undefined && typeof layer.effects.opacity === 'number' && !needsWrapper) {
      layerCss += `\n  #layer-${i} { opacity: ${layer.effects.opacity}; }`;
    }

    // Apply crop
    if (layer.crop) {
      const { top, bottom, left, right } = layer.crop;
      layerCss += `\n  #layer-${i} { clip-path: inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%); }`;
    }

    // Apply transition-in with animation-delay matching layer start
    if (layer.timing.transitionIn) {
      const transIn = buildTransitionIn(layer.timing.transitionIn);
      if (transIn) {
        const delayedKeyframes = transIn.keyframes.replace(
          /animation: ([^ ]+) ([^ ]+) ([^ ]+) forwards;/,
          `animation: $1 $2 $3 forwards; animation-delay: ${layer.timing.start}s;`
        );
        allCss.push(delayedKeyframes);
        classes.push(transIn.className);
      }
    }

    // Apply transition-out with animation-delay matching layer end time
    if (layer.timing.transitionOut) {
      const transOut = buildTransitionOut(layer.timing.transitionOut);
      if (transOut) {
        const outStart = layer.timing.start + layer.timing.duration - transOut.duration;
        const delayedKeyframes = transOut.keyframes.replace(
          /animation: ([^ ]+) ([^ ]+) ([^ ]+) forwards;/,
          `animation: $1 $2 $3 forwards; animation-delay: ${Math.max(0, outStart)}s;`
        );
        allCss.push(delayedKeyframes);
        classes.push(transOut.className);
      }
    }

    allCss.push(layerCss);

    // Build the inner layer HTML (with classes for KenBurns/transitions)
    let innerHtml = html;
    if (classes.length > 0) {
      innerHtml = html.replace(
        /id="layer-(\d+)"/,
        `id="layer-$1" class="${classes.join(' ')}"`
      );
    }

    // Wrap in visibility wrapper if needed
    if (needsWrapper) {
      allHtml.push(`<div id="layer-${i}-wrapper">${innerHtml}</div>`);
    } else {
      allHtml.push(innerHtml);
    }
  }

  return wrapInHtml(allHtml.join('\n'), allCss.join('\n'), output.width, output.height);
}

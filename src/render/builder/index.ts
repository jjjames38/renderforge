// Scene Builder: converts IR scene into full HTML/CSS page for Puppeteer capture.

import type { IRScene, IRLayer, IROutput } from '../parser/types.js';
import { wrapInHtml } from './html-template.js';
import { renderImage } from '../assets/image.js';
import { renderText } from '../assets/text.js';
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
    case 'text':
    case 'title':
    case 'caption':
      return renderText(layer, index);
    default:
      // For unsupported types, return an empty placeholder
      return {
        html: `<div id="layer-${index}" class="unsupported"></div>`,
        css: `#layer-${index} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }`,
      };
  }
}

/**
 * Build the complete HTML page for a single scene.
 *
 * Layers are rendered with z-index so that the first layer in the array
 * appears on top (highest z-index), matching Shotstack's track ordering
 * where earlier tracks overlay later ones.
 */
export function buildScene(scene: IRScene, output: IROutput): string {
  const allCss: string[] = [];
  const allHtml: string[] = [];

  const totalLayers = scene.layers.length;

  for (let i = 0; i < totalLayers; i++) {
    const layer = scene.layers[i];
    if (layer.type !== 'visual') continue;

    const { html, css } = renderLayer(layer, i);
    const classes: string[] = [];

    // z-index: first layer on top
    const zIndex = totalLayers - i;
    let layerCss = css;
    layerCss += `\n  #layer-${i} { z-index: ${zIndex}; }`;

    // Apply motion (Ken Burns) effect
    if (layer.effects.motion) {
      const kb = buildKenBurns(layer.effects.motion);
      if (kb) {
        allCss.push(kb.keyframes);
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

    // Apply opacity
    if (layer.effects.opacity !== undefined && typeof layer.effects.opacity === 'number') {
      layerCss += `\n  #layer-${i} { opacity: ${layer.effects.opacity}; }`;
    }

    // Apply crop
    if (layer.crop) {
      const { top, bottom, left, right } = layer.crop;
      layerCss += `\n  #layer-${i} { clip-path: inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%); }`;
    }

    // Apply transition-in
    if (layer.timing.transitionIn) {
      const transIn = buildTransitionIn(layer.timing.transitionIn);
      if (transIn) {
        allCss.push(transIn.keyframes);
        classes.push(transIn.className);
      }
    }

    // Apply transition-out
    if (layer.timing.transitionOut) {
      const transOut = buildTransitionOut(layer.timing.transitionOut);
      if (transOut) {
        allCss.push(transOut.keyframes);
        classes.push(transOut.className);
      }
    }

    allCss.push(layerCss);

    // Inject classes into the HTML element
    if (classes.length > 0) {
      const withClasses = html.replace(
        /id="layer-(\d+)"/,
        `id="layer-$1" class="${classes.join(' ')}"`
      );
      allHtml.push(withClasses);
    } else {
      allHtml.push(html);
    }
  }

  return wrapInHtml(allHtml.join('\n'), allCss.join('\n'), output.width, output.height);
}

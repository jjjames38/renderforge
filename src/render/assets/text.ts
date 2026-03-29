// Renders an IRLayer with text asset to HTML <div> + CSS.

import type { IRLayer } from '../parser/types.js';
import type { RenderedElement } from './image.js';

/**
 * Map Shotstack vertical position strings to CSS.
 */
function mapVerticalPosition(position?: string): string {
  switch (position) {
    case 'top':
      return 'top: 10%; bottom: auto;';
    case 'bottom':
      return 'bottom: 10%; top: auto;';
    case 'center':
    default:
      return 'top: 50%; transform: translateY(-50%);';
  }
}

/**
 * Build CSS text-shadow for stroke effect.
 * Uses 4-direction shadow to simulate stroke/outline.
 */
function buildStroke(stroke?: { color?: string; width?: number }): string {
  if (!stroke || !stroke.color || !stroke.width) return '';
  const c = stroke.color;
  const w = stroke.width;
  return `text-shadow: ${w}px 0 ${c}, -${w}px 0 ${c}, 0 ${w}px ${c}, 0 -${w}px ${c};`;
}

export function renderText(layer: IRLayer, layerIndex: number): RenderedElement {
  const id = `layer-${layerIndex}`;
  const text = layer.asset.text ?? '';
  const font = layer.asset.font ?? {};
  const stroke = layer.asset.stroke;
  const alignment = layer.asset.alignment;

  const fontFamily = font.family ?? 'sans-serif';
  const fontSize = font.size ?? 32;
  const fontColor = font.color ?? '#ffffff';
  const fontWeight = font.weight ?? 400;
  const textAlign = alignment?.horizontal ?? 'center';

  // Determine vertical position from asset alignment
  const verticalPos = mapVerticalPosition(alignment?.vertical);
  const strokeCss = buildStroke(stroke);

  // Offsets from position
  const offsetX = layer.position.offsetX;
  const offsetY = layer.position.offsetY;
  const offsetTransform = (offsetX !== 0 || offsetY !== 0)
    ? `margin-left: ${offsetX * 100}%; margin-top: ${offsetY * -100}%;`
    : '';

  const css = `
  #${id} {
    position: absolute;
    left: 0; right: 0;
    ${verticalPos}
    font-family: '${fontFamily}', sans-serif;
    font-size: ${fontSize}px;
    color: ${fontColor};
    font-weight: ${fontWeight};
    text-align: ${textAlign};
    ${strokeCss}
    ${offsetTransform}
    padding: 0 5%;
  }`;

  const html = `<div id="${id}">${text}</div>`;

  return { html, css };
}

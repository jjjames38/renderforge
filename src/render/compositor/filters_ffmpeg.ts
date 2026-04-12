// Maps CutEngine IR effects to FFmpeg filter expressions.

// Ken Burns motion effects → zoompan filter
// CSS transform scale(1) → scale(1.3) maps to zoompan z=1.0 → z=1.25
// (zoompan crops from center, so 1.25 ≈ 25% zoom looks like CSS scale(1.3))
const ZOOM_START = 1.0;
const ZOOM_END = 1.25;
const SLIDE_RANGE = 0.1; // 10% movement range
const SLIDE_ZOOM = 1.1;  // slight zoom to avoid edge exposure during slide

interface KenBurnsParams {
  base: string;
  durationMultiplier: number;
}

function parseMotionEffect(effect: string): KenBurnsParams | null {
  const bases = ['zoomIn', 'zoomOut', 'slideLeft', 'slideRight', 'slideUp', 'slideDown'];

  if (effect.endsWith('Fast')) {
    const base = effect.slice(0, -4);
    if (bases.includes(base)) return { base, durationMultiplier: 0.6 };
  }
  if (effect.endsWith('Slow')) {
    const base = effect.slice(0, -4);
    if (bases.includes(base)) return { base, durationMultiplier: 1.6 };
  }
  if (bases.includes(effect)) {
    return { base: effect, durationMultiplier: 1.0 };
  }
  return null;
}

/**
 * Generate FFmpeg zoompan filter string for a Ken Burns effect.
 * The zoompan filter produces a video stream from a still image with pan/zoom animation.
 *
 * @param effect - Motion effect name (e.g., 'zoomIn', 'slideLeftFast')
 * @param clipDuration - Duration of the clip in seconds
 * @param width - Output width
 * @param height - Output height
 * @param fps - Output FPS
 * @returns zoompan filter string (without input/output labels)
 */
export function mapKenBurns(
  effect: string,
  clipDuration: number,
  width: number,
  height: number,
  fps: number,
): string | null {
  const parsed = parseMotionEffect(effect);
  if (!parsed) return null;

  const totalFrames = Math.round(clipDuration * fps);
  // zoompan d = total frames for the animation
  const d = totalFrames;

  switch (parsed.base) {
    case 'zoomIn': {
      // Zoom from ZOOM_START to ZOOM_END, centered
      const step = (ZOOM_END - ZOOM_START) / d;
      return `zoompan=z='min(zoom+${step.toFixed(6)},${ZOOM_END})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    case 'zoomOut': {
      // Zoom from ZOOM_END to ZOOM_START, centered
      const step = (ZOOM_END - ZOOM_START) / d;
      return `zoompan=z='if(eq(on,1),${ZOOM_END},max(zoom-${step.toFixed(6)},${ZOOM_START}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    case 'slideLeft': {
      // Pan left: x moves from 5% to 15% of image width (10% travel)
      const startX = 0.05;
      return `zoompan=z=${SLIDE_ZOOM}:x='iw*${startX}+iw*${SLIDE_RANGE}*on/${d}':y='ih*(${SLIDE_ZOOM}-1)/(2*${SLIDE_ZOOM})':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    case 'slideRight': {
      // Pan right: x moves from 15% to 5%
      const startX = 0.05 + SLIDE_RANGE;
      return `zoompan=z=${SLIDE_ZOOM}:x='iw*${startX}-iw*${SLIDE_RANGE}*on/${d}':y='ih*(${SLIDE_ZOOM}-1)/(2*${SLIDE_ZOOM})':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    case 'slideUp': {
      // Pan up: y moves from 5% to 15%
      const startY = 0.05;
      return `zoompan=z=${SLIDE_ZOOM}:x='iw*(${SLIDE_ZOOM}-1)/(2*${SLIDE_ZOOM})':y='ih*${startY}+ih*${SLIDE_RANGE}*on/${d}':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    case 'slideDown': {
      // Pan down: y moves from 15% to 5%
      const startY = 0.05 + SLIDE_RANGE;
      return `zoompan=z=${SLIDE_ZOOM}:x='iw*(${SLIDE_ZOOM}-1)/(2*${SLIDE_ZOOM})':y='ih*${startY}-ih*${SLIDE_RANGE}*on/${d}':d=${d}:s=${width}x${height}:fps=${fps}`;
    }
    default:
      return null;
  }
}

/**
 * Map CutEngine color filter name to FFmpeg filter expression.
 */
export function mapColorFilter(filter: string): string | null {
  switch (filter) {
    case 'boost':     return 'eq=contrast=1.2:saturation=1.3';
    case 'contrast':  return 'eq=contrast=1.5';
    case 'darken':    return 'eq=brightness=-0.3';
    case 'lighten':   return 'eq=brightness=0.3';
    case 'greyscale': return 'hue=s=0';
    case 'muted':     return 'eq=saturation=0.5:contrast=0.9';
    case 'negative':  return 'negate';
    case 'blur':      return 'boxblur=5:5';
    default:          return null;
  }
}

// Shotstack transition → FFmpeg xfade transition name
const TRANSITION_MAP: Record<string, string> = {
  fade:          'fade',
  slideLeft:     'slideleft',
  slideRight:    'slideright',
  slideUp:       'slideup',
  slideDown:     'slidedown',
  wipeLeft:      'wipeleft',
  wipeRight:     'wiperight',
  wipeUp:        'wipeup',
  wipeDown:      'wipedown',
  zoom:          'circleclose',
  reveal:        'wiperight',
  carouselLeft:  'slideleft',
  carouselRight: 'slideright',
  carouselUp:    'slideup',
  carouselDown:  'slidedown',
  // shuffle* has no FFmpeg equivalent — router rejects these
};

/**
 * Map Shotstack transition name to FFmpeg xfade transition type.
 * Returns null if the transition cannot be mapped (triggers Puppeteer fallback).
 */
export function mapTransition(name: string): string | null {
  // Strip speed suffix for lookup
  let base = name;
  if (name.endsWith('Fast')) base = name.slice(0, -4);
  else if (name.endsWith('Slow')) base = name.slice(0, -4);

  return TRANSITION_MAP[base] ?? null;
}

/**
 * Get transition duration in seconds from a transition name.
 * Matches the durations in effects/transitions.ts.
 */
export function getFFmpegTransitionDuration(name: string): number {
  if (name.endsWith('Fast')) return 0.15;
  if (name.endsWith('Slow')) return 0.6;
  return 0.3;
}

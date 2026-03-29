// Maps Shotstack motion effects to CSS @keyframes animations.

export interface KenBurnsResult {
  className: string;
  keyframes: string;
}

interface MotionDef {
  from: string;
  to: string;
}

const MOTION_MAP: Record<string, MotionDef> = {
  zoomIn:     { from: 'scale(1)',         to: 'scale(1.3)' },
  zoomOut:    { from: 'scale(1.3)',       to: 'scale(1)' },
  slideLeft:  { from: 'translateX(0)',    to: 'translateX(-10%)' },
  slideRight: { from: 'translateX(0)',    to: 'translateX(10%)' },
  slideUp:    { from: 'translateY(0)',    to: 'translateY(-10%)' },
  slideDown:  { from: 'translateY(0)',    to: 'translateY(10%)' },
};

const SPEED_NORMAL = 5;
const SPEED_FAST = 3;
const SPEED_SLOW = 8;

/**
 * Parse a motion effect string like "zoomIn", "zoomInFast", "slideLeftSlow"
 * and return the base effect name plus duration.
 */
function parseMotion(effect: string): { base: string; duration: number } | null {
  // Check for speed suffixes
  if (effect.endsWith('Fast')) {
    const base = effect.slice(0, -4);
    if (MOTION_MAP[base]) return { base, duration: SPEED_FAST };
  }
  if (effect.endsWith('Slow')) {
    const base = effect.slice(0, -4);
    if (MOTION_MAP[base]) return { base, duration: SPEED_SLOW };
  }
  if (MOTION_MAP[effect]) {
    return { base: effect, duration: SPEED_NORMAL };
  }
  return null;
}

export function buildKenBurns(effect: string): KenBurnsResult | null {
  const parsed = parseMotion(effect);
  if (!parsed) return null;

  const motion = MOTION_MAP[parsed.base];
  const className = `kb-${effect}`;
  const keyframes = `@keyframes ${className} {
  from { transform: ${motion.from}; }
  to { transform: ${motion.to}; }
}
.${className} {
  animation: ${className} ${parsed.duration}s ease-in-out forwards;
}`;

  return { className, keyframes };
}

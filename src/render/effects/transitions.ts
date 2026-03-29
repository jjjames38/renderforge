// Maps Shotstack transitions to CSS keyframe animations.

export interface TransitionResult {
  className: string;
  keyframes: string;
  duration: number;
}

interface TransitionDef {
  from: Record<string, string>;
  to: Record<string, string>;
}

// Base transition definitions
const TRANSITION_DEFS: Record<string, TransitionDef> = {
  fade: {
    from: { opacity: '0' },
    to: { opacity: '1' },
  },
  reveal: {
    from: { 'clip-path': 'inset(0 100% 0 0)' },
    to: { 'clip-path': 'inset(0 0 0 0)' },
  },
  slideLeft: {
    from: { transform: 'translateX(100%)' },
    to: { transform: 'translateX(0)' },
  },
  slideRight: {
    from: { transform: 'translateX(-100%)' },
    to: { transform: 'translateX(0)' },
  },
  slideUp: {
    from: { transform: 'translateY(100%)' },
    to: { transform: 'translateY(0)' },
  },
  slideDown: {
    from: { transform: 'translateY(-100%)' },
    to: { transform: 'translateY(0)' },
  },
  wipeLeft: {
    from: { 'clip-path': 'inset(0 0 0 100%)' },
    to: { 'clip-path': 'inset(0 0 0 0)' },
  },
  wipeRight: {
    from: { 'clip-path': 'inset(0 100% 0 0)' },
    to: { 'clip-path': 'inset(0 0 0 0)' },
  },
  wipeUp: {
    from: { 'clip-path': 'inset(100% 0 0 0)' },
    to: { 'clip-path': 'inset(0 0 0 0)' },
  },
  wipeDown: {
    from: { 'clip-path': 'inset(0 0 100% 0)' },
    to: { 'clip-path': 'inset(0 0 0 0)' },
  },
  zoom: {
    from: { transform: 'scale(0)' },
    to: { transform: 'scale(1)' },
  },
};

const DURATION_NORMAL = 1;
const DURATION_FAST = 0.5;
const DURATION_SLOW = 2;

function propsToString(props: Record<string, string>): string {
  return Object.entries(props).map(([k, v]) => `${k}: ${v};`).join(' ');
}

/**
 * Parse transition name to extract base name, speed, and direction.
 * E.g. "fadeSlow" -> { base: "fade", duration: 2 }
 *      "slideLeftFast" -> { base: "slideLeft", duration: 0.5 }
 */
function parseTransition(name: string): { base: string; duration: number } | null {
  if (name.endsWith('Fast')) {
    const base = name.slice(0, -4);
    if (TRANSITION_DEFS[base]) return { base, duration: DURATION_FAST };
  }
  if (name.endsWith('Slow')) {
    const base = name.slice(0, -4);
    if (TRANSITION_DEFS[base]) return { base, duration: DURATION_SLOW };
  }
  if (TRANSITION_DEFS[name]) {
    return { base: name, duration: DURATION_NORMAL };
  }
  return null;
}

/**
 * Build a transition-in animation (element appears).
 */
export function buildTransitionIn(name: string): TransitionResult | null {
  const parsed = parseTransition(name);
  if (!parsed) return null;

  const def = TRANSITION_DEFS[parsed.base];
  const className = `trans-in-${name}`;
  const keyframes = `@keyframes ${className} {
  from { ${propsToString(def.from)} }
  to { ${propsToString(def.to)} }
}
.${className} {
  animation: ${className} ${parsed.duration}s ease-in-out forwards;
}`;

  return { className, keyframes, duration: parsed.duration };
}

/**
 * Build a transition-out animation (element disappears).
 * Reverses the from/to of the base transition.
 */
export function buildTransitionOut(name: string): TransitionResult | null {
  const parsed = parseTransition(name);
  if (!parsed) return null;

  const def = TRANSITION_DEFS[parsed.base];
  const className = `trans-out-${name}`;
  // Reverse: go from "to" state to "from" state
  const keyframes = `@keyframes ${className} {
  from { ${propsToString(def.to)} }
  to { ${propsToString(def.from)} }
}
.${className} {
  animation: ${className} ${parsed.duration}s ease-in-out forwards;
}`;

  return { className, keyframes, duration: parsed.duration };
}

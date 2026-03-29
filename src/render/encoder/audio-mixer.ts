import { IRAudioMix } from '../parser/types.js';

export interface AudioMixResult {
  inputArgs: string[];
  filterComplex: string;
  mapArgs: string[];
}

export function buildAudioMix(audio: IRAudioMix, totalDuration: number): AudioMixResult {
  const inputArgs: string[] = [];
  const filters: string[] = [];
  let inputIdx = 1; // 0 is video

  // Process audio clips
  for (const clip of audio.clips) {
    inputArgs.push('-i', clip.src);
    const parts: string[] = [];

    // Volume (skip if 1)
    if (clip.volume !== undefined && clip.volume !== 1) {
      parts.push(`volume=${clip.volume}`);
    }

    // Volume effect (fadeIn/fadeOut)
    if (clip.volumeEffect === 'fadeIn') {
      parts.push(`afade=t=in:d=1`);
    } else if (clip.volumeEffect === 'fadeOut') {
      parts.push(`afade=t=out:st=${clip.duration - 1}:d=1`);
    } else if (clip.volumeEffect === 'fadeInFadeOut') {
      parts.push(`afade=t=in:d=1`);
      parts.push(`afade=t=out:st=${clip.duration - 1}:d=1`);
    }

    // Speed
    if (clip.speed && clip.speed !== 1) {
      parts.push(`atempo=${clip.speed}`);
    }

    // Delay to position on timeline
    const delayMs = Math.round(clip.start * 1000);
    if (delayMs > 0) {
      parts.push(`adelay=${delayMs}|${delayMs}`);
    }

    const chain = parts.length > 0 ? parts.join(',') : 'anull';
    filters.push(`[${inputIdx}:a]${chain}[a${inputIdx}]`);
    inputIdx++;
  }

  // Process soundtrack
  if (audio.soundtrack) {
    inputArgs.push('-i', audio.soundtrack.src);
    const parts: string[] = [];
    parts.push(`volume=${audio.soundtrack.volume ?? 1}`);

    if (audio.soundtrack.effect === 'fadeIn') {
      parts.push(`afade=t=in:d=2`);
    } else if (audio.soundtrack.effect === 'fadeOut') {
      parts.push(`afade=t=out:st=${totalDuration - 2}:d=2`);
    } else if (audio.soundtrack.effect === 'fadeInFadeOut') {
      parts.push(`afade=t=in:d=2`);
      parts.push(`afade=t=out:st=${totalDuration - 2}:d=2`);
    }

    filters.push(`[${inputIdx}:a]${parts.join(',')}[a${inputIdx}]`);
    inputIdx++;
  }

  // Mix all audio streams
  const streamCount = inputIdx - 1;
  if (streamCount === 0) {
    return { inputArgs: [], filterComplex: '', mapArgs: [] };
  }

  const mixInputs = Array.from({ length: streamCount }, (_, i) => `[a${i + 1}]`).join('');
  filters.push(`${mixInputs}amix=inputs=${streamCount}:duration=longest[aout]`);

  return {
    inputArgs,
    filterComplex: filters.join('; '),
    mapArgs: ['-map', '0:v', '-map', '[aout]'],
  };
}

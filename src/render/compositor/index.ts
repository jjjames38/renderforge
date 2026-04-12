// FFmpeg compositor orchestrator.
// Composes an entire IRTimeline into a final video using a single FFmpeg filter_complex pass.

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { IRTimeline } from '../parser/types.js';
import type { CompositorOptions } from './types.js';
import { buildInputs } from './input_builder.js';
import { buildFilterGraph } from './filter_graph.js';
import { buildAudioMix } from '../encoder/audio-mixer.js';
import { resolveCodec, getQualityArgs, getPresetArgs } from '../encoder/hwaccel.js';
import { config } from '../../config/index.js';

/**
 * Compose an IRTimeline into a final video file using FFmpeg filter_complex.
 * This bypasses the Puppeteer frame-capture pipeline entirely.
 *
 * @param ir - Parsed timeline (after prefetch — asset paths are local)
 * @param workDir - Working directory for temp files
 * @param outputPath - Final output file path
 * @param opts - Progress callback
 */
export async function composeTimeline(
  ir: IRTimeline,
  workDir: string,
  outputPath: string,
  opts?: CompositorOptions,
): Promise<void> {
  const totalDuration = ir.scenes.reduce((sum, s) => sum + s.duration, 0);
  const prefetchDir = join(workDir, 'prefetch');

  // 1. Build media inputs (-i arguments)
  const inputs = buildInputs(ir, totalDuration);

  // 2. Build video filter_complex
  const graph = buildFilterGraph(ir, inputs.indexMap, prefetchDir);

  // 3. Build audio filter_complex (reuse existing audio-mixer)
  const hasAudio = ir.audio.clips.length > 0 || ir.audio.soundtrack;
  let audioFilterComplex = '';
  let audioInputArgs: string[] = [];
  let audioMapArgs: string[] = [];

  if (hasAudio && !ir.output.mute) {
    // Audio inputs start after video inputs
    const audioMix = buildAudioMixWithOffset(ir, totalDuration, inputs.count);
    audioFilterComplex = audioMix.filterComplex;
    audioInputArgs = audioMix.inputArgs;
    audioMapArgs = audioMix.mapArgs;
  }

  // 4. Combine video + audio filter_complex
  let fullFilterComplex = graph.filterComplex;
  if (audioFilterComplex) {
    fullFilterComplex += ';\n' + audioFilterComplex;
  }

  // 5. Write filter_complex to temp file (avoid shell arg length limits)
  const filterScriptPath = join(workDir, 'filter_complex.txt');
  writeFileSync(filterScriptPath, fullFilterComplex, 'utf-8');

  // 6. Build final FFmpeg command
  const codec = resolveCodec(config.encoder.codec);
  const [qualityFlag, qualityValue] = getQualityArgs(ir.output.quality, codec);
  const presetArgs = getPresetArgs(codec);

  const args: string[] = [
    ...inputs.args,          // Video inputs (-loop 1 -t D -i path ...)
    ...audioInputArgs,       // Audio inputs (-i narration.mp3 -i bgm.mp3 ...)
    '-filter_complex_script', filterScriptPath,
    '-map', graph.videoOutputLabel,
    ...(audioFilterComplex ? ['-map', '[aout]'] : []),
    '-c:v', codec,
    ...presetArgs,
    qualityFlag, qualityValue,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    '-y',
    outputPath,
  ];

  // 7. Run FFmpeg
  await runFFmpegWithProgress(args, totalDuration, opts?.onProgress);
}

/**
 * Build audio mix with input index offset (audio inputs come after video inputs).
 * The existing buildAudioMix assumes audio starts at input index 1 (index 0 = video frames).
 * In the compositor, audio inputs start at `videoInputCount`.
 */
function buildAudioMixWithOffset(
  ir: IRTimeline,
  totalDuration: number,
  videoInputCount: number,
): { inputArgs: string[]; filterComplex: string; mapArgs: string[] } {
  const mix = buildAudioMix(ir.audio, totalDuration);

  if (!mix.filterComplex) return mix;

  // Rewrite input indices in the filter_complex string
  // The audio-mixer uses indices starting from 1, but we need to offset by videoInputCount
  // Original: [1:a]...[a1]; [2:a]...[a2]; ...
  // Rewritten: [N:a]...[a1]; [N+1:a]...[a2]; ...
  let rewritten = mix.filterComplex;

  // Find all [N:a] references and offset them
  // Audio mixer starts from index 1 (0 is video frames input)
  // We need to shift by (videoInputCount - 1) since mixer assumes 0=video, 1=first audio
  const offset = videoInputCount - 1;
  if (offset > 0) {
    rewritten = rewritten.replace(/\[(\d+):a\]/g, (_match, idx) => {
      const newIdx = parseInt(idx, 10) + offset;
      return `[${newIdx}:a]`;
    });
  }

  return {
    inputArgs: mix.inputArgs,
    filterComplex: rewritten,
    mapArgs: ['-map', `[aout]`],
  };
}

function runFFmpegWithProgress(
  args: string[],
  totalDuration: number,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Parse FFmpeg progress from stderr: "time=HH:MM:SS.ss"
      if (onProgress) {
        const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const seconds = parseInt(timeMatch[1]) * 3600
            + parseInt(timeMatch[2]) * 60
            + parseFloat(timeMatch[3]);
          const percent = Math.min(99, Math.round((seconds / totalDuration) * 100));
          onProgress(percent);
        }
      }
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        // Include the last 500 chars of stderr for debugging
        const errorTail = stderr.slice(-500);
        reject(new Error(`FFmpeg compositor exited with code ${code}: ${errorTail}`));
      }
    });

    proc.on('error', reject);
  });
}

export { canUseFFmpegCompositor } from './router.js';

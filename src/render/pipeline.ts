import { parseTimeline } from './parser/index.js';
import { buildScene } from './builder/index.js';
import { captureFrames } from './capture/index.js';
import { encode } from './encoder/index.js';
import type { IRTimeline } from './parser/types.js';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { renderTotal, renderDuration } from '../api/metrics.js';

export interface PipelineResult {
  outputPath: string;
  format: string;
  duration: number;
}

export type StatusCallback = (status: string) => Promise<void> | void;

interface StageLog {
  stage: string;
  durationMs: number;
}

function logStage(stage: string, startTime: number): StageLog {
  const durationMs = Date.now() - startTime;
  return { stage, durationMs };
}

export async function executePipeline(
  editJson: { timeline: any; output: any; merge?: any[]; callback?: string },
  workDir: string,
  onStatus?: StatusCallback,
): Promise<PipelineResult> {
  mkdirSync(workDir, { recursive: true });

  const pipelineStart = Date.now();
  const stageLogs: StageLog[] = [];

  try {
    // Stage 1: Parse
    let stageStart = Date.now();
    await onStatus?.('fetching');
    const ir: IRTimeline = parseTimeline(editJson);
    stageLogs.push(logStage('parse', stageStart));

    // Stage 2: Build HTML scene
    stageStart = Date.now();
    await onStatus?.('rendering');
    const totalDuration = ir.scenes.reduce((sum, s) => sum + s.duration, 0);
    const sceneHtml = buildScene(ir.scenes[0], ir.output, totalDuration);
    stageLogs.push(logStage('build', stageStart));

    // Stage 3: Capture frames
    stageStart = Date.now();
    const frameDir = join(workDir, 'frames');
    // A scene is static only if all layers share the same timing AND have no effects
    const hasTimingVariation = ir.scenes.some(s =>
      s.layers.some(l => l.type === 'visual' && (l.timing.start > 0 || l.timing.duration < totalDuration)),
    );
    const isStatic = !hasTimingVariation && !ir.scenes.some(s =>
      s.layers.some(l => l.effects.motion || l.timing.transitionIn || l.timing.transitionOut),
    );

    const captureResult = await captureFrames({
      html: sceneHtml,
      outputDir: frameDir,
      width: ir.output.width,
      height: ir.output.height,
      fps: ir.output.fps,
      duration: totalDuration,
      isStatic,
    });
    stageLogs.push(logStage('capture', stageStart));

    // Stage 4: Encode
    stageStart = Date.now();
    await onStatus?.('saving');
    const outputPath = join(workDir, `output.${ir.output.format}`);

    await encode({
      frameDir: captureResult.frameDir,
      framePattern: captureResult.framePattern,
      frameCount: captureResult.frameCount,
      output: ir.output,
      audio: ir.audio.clips.length > 0 || ir.audio.soundtrack ? ir.audio : undefined,
      outputPath,
    });
    stageLogs.push(logStage('encode', stageStart));

    const totalMs = Date.now() - pipelineStart;
    renderDuration.observe(totalMs / 1000);
    renderTotal.inc({ status: 'completed' });

    // Structured log output
    const logEntry = {
      event: 'pipeline_complete',
      totalMs,
      stages: stageLogs,
    };
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify(logEntry));
    }

    return {
      outputPath,
      format: ir.output.format,
      duration: totalDuration,
    };
  } catch (error) {
    renderTotal.inc({ status: 'failed' });

    const totalMs = Date.now() - pipelineStart;
    const logEntry = {
      event: 'pipeline_failed',
      totalMs,
      stages: stageLogs,
      error: error instanceof Error ? error.message : String(error),
    };
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      console.error(JSON.stringify(logEntry));
    }

    throw error;
  }
}

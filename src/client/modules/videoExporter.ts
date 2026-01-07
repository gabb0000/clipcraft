/**
 * ClipCraft - Video Exporter Module
 * Handles exporting clips in multiple formats and aspect ratios
 */

import type { ExportOptions, ExportFormat, AspectRatio, Caption } from '@types/index';
import { Utils } from './utils';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export class VideoExporter {
  /**
   * Export clip with specified options
   */
  static async exportClip(
    videoElement: HTMLVideoElement,
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    Utils.showLoading(`Exporting as ${options.format.toUpperCase()}...`);

    try {
      if (options.format === 'gif') {
        return await this.exportAsGIF(videoElement, startTime, endTime, options);
      } else if (options.aspectRatio !== '16:9') {
        return await this.exportWithAspectRatio(videoElement, startTime, endTime, options);
      } else {
        return await this.exportStandard(videoElement, startTime, endTime, options);
      }
    } finally {
      Utils.hideLoading();
    }
  }

  /**
   * Export as GIF
   */
  private static async exportAsGIF(
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const aspectRatio = this.parseAspectRatio(options.aspectRatio);
    const size = this.calculateDimensions(video.videoWidth, video.videoHeight, aspectRatio, 480);

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Cannot get 2D context');

    // GIF settings
    const fps = 15; // Lower FPS for smaller file size
    const duration = endTime - startTime;
    const frameCount = Math.floor(duration * fps);
    const frameDelay = 1000 / fps;

    // Initialize GIF encoder
    const gif = GIFEncoder();

    // Capture frames
    for (let i = 0; i < frameCount; i++) {
      const time = startTime + (i / frameCount) * duration;
      await this.seekToTime(video, time);

      // Draw frame with aspect ratio
      this.drawFrameWithAspectRatio(ctx, video, size.width, size.height, aspectRatio);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Quantize colors and add frame
      const palette = quantize(imageData.data, 256);
      const index = applyPalette(imageData.data, palette);

      gif.writeFrame(index, canvas.width, canvas.height, {
        palette,
        delay: frameDelay,
      });

      // Update progress
      if (i % 5 === 0) {
        Utils.showLoading(`Creating GIF: ${Math.round((i / frameCount) * 100)}%`);
      }
    }

    gif.finish();
    const buffer = gif.bytes();

    return new Blob([buffer], { type: 'image/gif' });
  }

  /**
   * Export with custom aspect ratio
   */
  private static async exportWithAspectRatio(
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    // Check if server is available for proper encoding
    const serverAvailable = await this.checkServerAvailable();

    if (serverAvailable) {
      return await this.exportServerSide(startTime, endTime, options);
    } else {
      // Fallback to browser-based recording
      return await this.exportBrowserBased(video, startTime, endTime, options);
    }
  }

  /**
   * Standard export (use server for proper audio)
   */
  private static async exportStandard(
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    const serverAvailable = await this.checkServerAvailable();

    if (serverAvailable) {
      return await this.exportServerSide(startTime, endTime, options);
    } else {
      return await this.exportBrowserBased(video, startTime, endTime, options);
    }
  }

  /**
   * Server-side export (preserves audio, applies filters)
   */
  private static async exportServerSide(
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime,
        endTime,
        format: options.format,
        aspectRatio: options.aspectRatio,
        quality: options.quality,
        filters: options.filters || [],
      }),
    });

    if (!response.ok) {
      throw new Error('Server export failed');
    }

    const result = await response.json();
    const videoResponse = await fetch(result.url);
    return await videoResponse.blob();
  }

  /**
   * Browser-based export (fallback, video only)
   */
  private static async exportBrowserBased(
    video: HTMLVideoElement,
    startTime: number,
    endTime: number,
    options: ExportOptions
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const aspectRatio = this.parseAspectRatio(options.aspectRatio);
    const size = this.calculateDimensions(
      video.videoWidth,
      video.videoHeight,
      aspectRatio,
      1080
    );

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');

    const stream = canvas.captureStream(30);
    const mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm';
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.getVideoBitrate(options.quality),
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };

      mediaRecorder.onerror = reject;

      video.currentTime = startTime;
      video.onseeked = () => {
        mediaRecorder.start(100);
        video.play();

        const renderFrame = () => {
          if (video.currentTime >= endTime) {
            mediaRecorder.stop();
            video.pause();
            return;
          }

          this.drawFrameWithAspectRatio(ctx, video, size.width, size.height, aspectRatio);

          if (options.includeCaptions && options.captionStyle) {
            this.drawCaptions(
              ctx,
              options.captions || [],
              video.currentTime - startTime,
              options.captionStyle
            );
          }

          requestAnimationFrame(renderFrame);
        };

        renderFrame();
      };
    });
  }

  /**
   * Draw video frame with aspect ratio cropping/letterboxing
   */
  private static drawFrameWithAspectRatio(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    canvasWidth: number,
    canvasHeight: number,
    targetRatio: { width: number; height: number }
  ): void {
    const videoRatio = video.videoWidth / video.videoHeight;
    const targetRatioValue = targetRatio.width / targetRatio.height;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;

    if (videoRatio > targetRatioValue) {
      // Video is wider - crop sides
      sourceWidth = video.videoHeight * targetRatioValue;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else if (videoRatio < targetRatioValue) {
      // Video is taller - crop top/bottom
      sourceHeight = video.videoWidth / targetRatioValue;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    // Fill background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw video
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvasWidth,
      canvasHeight
    );
  }

  /**
   * Draw captions on canvas
   */
  private static drawCaptions(
    ctx: CanvasRenderingContext2D,
    captions: Caption[],
    currentTime: number,
    style: { color: string; highlightColor: string; fontSize: number }
  ): void {
    const activeCaption = captions.find(
      (c) => currentTime >= c.startTime && currentTime <= c.endTime
    );
    if (!activeCaption) return;

    const words = activeCaption.words || [{ text: activeCaption.text, startTime: 0, endTime: 0 }];
    const y = ctx.canvas.height * 0.85;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${style.fontSize}px Inter, Arial, sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    let x = ctx.canvas.width / 2;
    words.forEach((word) => {
      const isActive = currentTime >= word.startTime && currentTime < word.endTime;
      ctx.fillStyle = isActive ? style.highlightColor : style.color;
      ctx.fillText(word.text, x, y);
      x += ctx.measureText(word.text + ' ').width;
    });

    ctx.restore();
  }

  /**
   * Helper functions
   */
  private static parseAspectRatio(ratio: AspectRatio): { width: number; height: number } {
    const [width, height] = ratio.split(':').map(Number);
    return { width: width!, height: height! };
  }

  private static calculateDimensions(
    videoWidth: number,
    videoHeight: number,
    aspectRatio: { width: number; height: number },
    maxSize: number
  ): { width: number; height: number } {
    const ratio = aspectRatio.width / aspectRatio.height;

    let width: number;
    let height: number;

    if (ratio > 1) {
      // Landscape
      width = Math.min(maxSize, videoWidth);
      height = Math.round(width / ratio);
    } else {
      // Portrait or square
      height = Math.min(maxSize, videoHeight);
      width = Math.round(height * ratio);
    }

    // Ensure even dimensions (required for video encoding)
    width = Math.round(width / 2) * 2;
    height = Math.round(height / 2) * 2;

    return { width, height };
  }

  private static getVideoBitrate(quality: 'low' | 'medium' | 'high'): number {
    const bitrates = {
      low: 2_000_000, // 2 Mbps
      medium: 5_000_000, // 5 Mbps
      high: 10_000_000, // 10 Mbps
    };
    return bitrates[quality];
  }

  private static async checkServerAvailable(): Promise<boolean> {
    try {
      const response = await fetch('/api/status', { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  private static seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      video.currentTime = time;
      video.onseeked = () => resolve();
    });
  }
}

/**
 * ClipCraft - Clip Editor Module
 * Handles timeline, waveform, and clip range selection
 */

import type { HighlightSuggestion, ClipRange } from '@types/index';
import { Utils } from './utils';

export class ClipEditor {
  private videoElement: HTMLVideoElement | null = null;
  private waveformCanvas: HTMLCanvasElement | null = null;
  private waveformCtx: CanvasRenderingContext2D | null = null;
  private clipRange: HTMLElement | null = null;
  private playhead: HTMLElement | null = null;

  // State
  duration = 0;
  clipStart = 0;
  clipEnd = 30;
  clipDuration = 30;
  private isDragging = false;
  private dragTarget: string | null = null;
  private dragStartX = 0;
  private dragStartClipStart = 0;
  private dragStartClipEnd = 0;
  suggestions: HighlightSuggestion[] = [];

  /**
   * Initialize clip editor
   */
  init(
    videoElement: HTMLVideoElement,
    waveformCanvas: HTMLCanvasElement,
    clipRange: HTMLElement,
    playhead: HTMLElement
  ): void {
    this.videoElement = videoElement;
    this.waveformCanvas = waveformCanvas;
    this.waveformCtx = waveformCanvas.getContext('2d');
    this.clipRange = clipRange;
    this.playhead = playhead;

    this.setupEventListeners();
    this.resizeCanvas();

    // Handle window resize
    window.addEventListener('resize', Utils.debounce(() => this.resizeCanvas(), 200));
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.videoElement || !this.waveformCanvas || !this.clipRange) return;

    // Video time update
    this.videoElement.addEventListener('timeupdate', () => this.updatePlayhead());
    this.videoElement.addEventListener('loadedmetadata', () => this.onVideoLoaded());

    // Waveform click to seek
    this.waveformCanvas.addEventListener('click', (e) => this.onWaveformClick(e));

    // Range handle dragging
    const startHandle = document.getElementById('rangeStart');
    const endHandle = document.getElementById('rangeEnd');

    startHandle?.addEventListener('mousedown', (e) => this.startDrag(e, 'start'));
    endHandle?.addEventListener('mousedown', (e) => this.startDrag(e, 'end'));
    this.clipRange.addEventListener('mousedown', (e) => {
      if (e.target === this.clipRange) this.startDrag(e, 'range');
    });

    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.endDrag());

    // Touch support
    startHandle?.addEventListener('touchstart', (e) => this.startDrag(e, 'start'));
    endHandle?.addEventListener('touchstart', (e) => this.startDrag(e, 'end'));
    document.addEventListener('touchmove', (e) => this.onDrag(e));
    document.addEventListener('touchend', () => this.endDrag());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  /**
   * Resize canvas to container
   */
  private resizeCanvas(): void {
    if (!this.waveformCanvas) return;

    const container = this.waveformCanvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    this.waveformCanvas.width = rect.width;
    this.waveformCanvas.height = rect.height;

    this.drawWaveform();
    this.updateClipRangeUI();
  }

  /**
   * Called when video metadata is loaded
   */
  private onVideoLoaded(): void {
    if (!this.videoElement) return;

    this.duration = this.videoElement.duration;
    this.clipStart = 0;
    this.clipEnd = Math.min(this.clipDuration, this.duration);

    this.drawWaveform();
    this.updateClipRangeUI();
  }

  /**
   * Draw waveform visualization
   */
  drawWaveform(): void {
    if (!this.waveformCtx || !this.waveformCanvas) return;

    const ctx = this.waveformCtx;
    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;

    // Clear canvas
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, width, height);

    if (!this.videoElement || this.duration === 0) return;

    // Generate fake waveform data based on video frames
    // (Real waveform would require audio decoding)
    const bars = Math.floor(width / 4);
    const barWidth = 2;
    const gap = 2;

    ctx.fillStyle = '#3b82f6';

    for (let i = 0; i < bars; i++) {
      // Generate pseudo-random heights for visual effect
      const seed = (i * 1234567) % 100;
      const baseHeight = 20 + (seed / 100) * (height - 40);
      const variation = Math.sin(i * 0.1) * 10 + Math.cos(i * 0.05) * 15;
      const barHeight = Math.max(10, baseHeight + variation);

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      // Color gradient based on position
      const progress = i / bars;
      const inClip =
        progress >= this.clipStart / this.duration && progress <= this.clipEnd / this.duration;

      ctx.fillStyle = inClip ? '#60a5fa' : '#404040';
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  /**
   * Update playhead position
   */
  private updatePlayhead(): void {
    if (this.duration === 0 || !this.videoElement || !this.playhead || !this.waveformCanvas)
      return;

    const progress = this.videoElement.currentTime / this.duration;
    const containerWidth = this.waveformCanvas.parentElement?.offsetWidth || 0;

    this.playhead.style.left = `${progress * containerWidth}px`;
  }

  /**
   * Update clip range UI position
   */
  updateClipRangeUI(): void {
    if (this.duration === 0 || !this.clipRange || !this.waveformCanvas) return;

    const containerWidth = this.waveformCanvas.parentElement?.offsetWidth || 0;
    const startPercent = this.clipStart / this.duration;
    const endPercent = this.clipEnd / this.duration;

    this.clipRange.style.left = `${startPercent * containerWidth}px`;
    this.clipRange.style.width = `${(endPercent - startPercent) * containerWidth}px`;

    // Redraw waveform to update highlight
    this.drawWaveform();
  }

  /**
   * Handle waveform click to seek
   */
  private onWaveformClick(e: MouseEvent): void {
    if (!this.waveformCanvas || !this.videoElement) return;

    const rect = this.waveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = x / rect.width;

    const newTime = progress * this.duration;
    this.videoElement.currentTime = Utils.clamp(newTime, 0, this.duration);
  }

  /**
   * Start dragging a handle or range
   */
  private startDrag(e: MouseEvent | TouchEvent, target: string): void {
    e.preventDefault();
    this.isDragging = true;
    this.dragTarget = target;
    this.dragStartX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0;
    this.dragStartClipStart = this.clipStart;
    this.dragStartClipEnd = this.clipEnd;
  }

  /**
   * Handle drag movement
   */
  private onDrag(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging || !this.waveformCanvas) return;

    const currentX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0;
    const containerWidth = this.waveformCanvas.parentElement?.offsetWidth || 0;
    const deltaX = currentX - this.dragStartX;
    const deltaTime = (deltaX / containerWidth) * this.duration;

    switch (this.dragTarget) {
      case 'start':
        this.clipStart = Utils.clamp(
          this.dragStartClipStart + deltaTime,
          0,
          this.clipEnd - 5 // Minimum 5 seconds
        );
        break;

      case 'end':
        this.clipEnd = Utils.clamp(
          this.dragStartClipEnd + deltaTime,
          this.clipStart + 5, // Minimum 5 seconds
          this.duration
        );
        break;

      case 'range':
        const rangeDuration = this.dragStartClipEnd - this.dragStartClipStart;
        let newStart = this.dragStartClipStart + deltaTime;
        let newEnd = this.dragStartClipEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = rangeDuration;
        }
        if (newEnd > this.duration) {
          newEnd = this.duration;
          newStart = this.duration - rangeDuration;
        }

        this.clipStart = newStart;
        this.clipEnd = newEnd;
        break;
    }

    this.updateClipRangeUI();
  }

  /**
   * End drag operation
   */
  private endDrag(): void {
    this.isDragging = false;
    this.dragTarget = null;
  }

  /**
   * Handle keyboard shortcuts
   */
  private onKeydown(e: KeyboardEvent): void {
    // Only handle when not typing in input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;

    if (!this.videoElement) return;

    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        this.togglePlay();
        break;
      case 'j':
        // Seek backward 5 seconds
        this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 5);
        break;
      case 'l':
        // Seek forward 5 seconds
        this.videoElement.currentTime = Math.min(this.duration, this.videoElement.currentTime + 5);
        break;
      case 'k':
        this.togglePlay();
        break;
      case 'i':
        // Set in point
        this.setInPoint(this.videoElement.currentTime);
        break;
      case 'o':
        // Set out point
        this.setOutPoint(this.videoElement.currentTime);
        break;
      case 'arrowleft':
        this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 1);
        break;
      case 'arrowright':
        this.videoElement.currentTime = Math.min(this.duration, this.videoElement.currentTime + 1);
        break;
    }
  }

  /**
   * Toggle play/pause
   */
  private togglePlay(): void {
    if (!this.videoElement) return;

    if (this.videoElement.paused) {
      this.videoElement.play();
    } else {
      this.videoElement.pause();
    }
  }

  /**
   * Set clip in point
   */
  setInPoint(time: number): void {
    this.clipStart = Utils.clamp(time, 0, this.clipEnd - 5);
    this.updateClipRangeUI();
    Utils.showToast(`In point set: ${Utils.formatTime(this.clipStart)}`, 'success');
  }

  /**
   * Set clip out point
   */
  setOutPoint(time: number): void {
    this.clipEnd = Utils.clamp(time, this.clipStart + 5, this.duration);
    this.updateClipRangeUI();
    Utils.showToast(`Out point set: ${Utils.formatTime(this.clipEnd)}`, 'success');
  }

  /**
   * Set clip duration and update end point
   */
  setClipDuration(duration: number): void {
    this.clipDuration = duration;
    this.clipEnd = Math.min(this.clipStart + duration, this.duration);
    this.updateClipRangeUI();
  }

  /**
   * Set clip range from suggestion
   */
  setFromSuggestion(suggestion: HighlightSuggestion): void {
    if (!this.videoElement) return;

    this.clipStart = suggestion.startTime;
    this.clipEnd = suggestion.endTime;
    this.videoElement.currentTime = suggestion.startTime;
    this.updateClipRangeUI();
    Utils.showToast(
      `Clip range set: ${Utils.formatTime(this.clipStart)} - ${Utils.formatTime(this.clipEnd)}`,
      'success'
    );
  }

  /**
   * Display AI suggestions on timeline
   */
  displaySuggestions(suggestions: HighlightSuggestion[]): void {
    this.suggestions = suggestions;
    const container = document.getElementById('aiMarkers');
    if (!container) return;

    container.innerHTML = '';

    suggestions.forEach((suggestion) => {
      const marker = document.createElement('div');
      marker.className = 'ai-marker';
      marker.title = `${suggestion.reason} (${suggestion.score}%)`;

      const position = (suggestion.startTime / this.duration) * 100;
      marker.style.left = `${position}%`;

      marker.addEventListener('click', () => {
        this.setFromSuggestion(suggestion);
      });

      container.appendChild(marker);
    });
  }

  /**
   * Get current clip range
   */
  getClipRange(): ClipRange {
    return {
      start: this.clipStart,
      end: this.clipEnd,
      duration: this.clipEnd - this.clipStart,
    };
  }

  /**
   * Preview clip in the video player
   */
  previewClip(): void {
    if (!this.videoElement) return;

    this.videoElement.currentTime = this.clipStart;
    this.videoElement.play();

    const checkEnd = setInterval(() => {
      if (this.videoElement!.currentTime >= this.clipEnd) {
        this.videoElement!.pause();
        clearInterval(checkEnd);
      }
    }, 100);
  }

  /**
   * Reset editor state
   */
  reset(): void {
    this.clipStart = 0;
    this.clipEnd = this.clipDuration;
    this.suggestions = [];
    const aiMarkers = document.getElementById('aiMarkers');
    if (aiMarkers) {
      aiMarkers.innerHTML = '';
    }
    this.updateClipRangeUI();
  }
}

// Create singleton instance
export const clipEditor = new ClipEditor();

/**
 * ClipCraft - Utility Functions
 * Common helper functions used across the application
 */

import type { ToastType } from '@types/index';

export const Utils = {
  /**
   * Format seconds to MM:SS or HH:MM:SS
   */
  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Parse time string (MM:SS or HH:MM:SS) to seconds
   */
  parseTime(timeStr: string): number {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    }
    return parts[0]! * 60 + parts[1]!;
  },

  /**
   * Generate unique ID
   */
  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  },

  /**
   * Debounce function
   */
  debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return function executedFunction(...args: Parameters<T>) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   */
  throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function (this: unknown, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  /**
   * Clamp a number between min and max
   */
  clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Format file size to human readable
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]!;
  },

  /**
   * Format date to relative time
   */
  formatRelativeTime(date: string | Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return new Date(date).toLocaleDateString();
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return 'Just now';
  },

  /**
   * Extract YouTube video ID from URL
   */
  extractYouTubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/]+)/,
      /youtube\.com\/shorts\/([^&?\/]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1]!;
    }
    return null;
  },

  /**
   * Extract Twitch VOD ID from URL
   */
  extractTwitchVodId(url: string): string | null {
    const match = url.match(/twitch\.tv\/videos\/(\d+)/);
    return match ? match[1]! : null;
  },

  /**
   * Detect video source type from URL
   */
  detectVideoSource(url: string): 'youtube' | 'twitch' | null {
    if (this.extractYouTubeId(url)) return 'youtube';
    if (this.extractTwitchVodId(url)) return 'twitch';
    return null;
  },

  /**
   * Show toast notification
   */
  showToast(message: string, type: ToastType = 'success'): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons: Record<ToastType, string> = {
      success:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>',
      warning:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>',
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * Show/hide loading overlay
   */
  showLoading(text = 'Processing...'): void {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (!overlay || !loadingText) return;

    loadingText.textContent = text;
    overlay.classList.remove('hidden');
  },

  hideLoading(): void {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  },

  /**
   * Create thumbnail from video at specific time
   */
  async createThumbnail(
    videoElement: HTMLVideoElement,
    time: number,
    width = 180,
    height = 320
  ): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      const originalTime = videoElement.currentTime;
      videoElement.currentTime = time;

      videoElement.onseeked = () => {
        ctx.drawImage(videoElement, 0, 0, width, height);
        videoElement.currentTime = originalTime;
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  },
};

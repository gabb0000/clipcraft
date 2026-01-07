/**
 * ClipCraft - Caption Editor Module
 * Interactive caption editing with timing adjustments
 */

import type { Caption } from '@types/index';
import { Utils } from './utils';

export class CaptionEditor {
  private captions: Caption[] = [];
  private onUpdate?: (captions: Caption[]) => void;
  private activeIndex = -1;

  constructor(onUpdate?: (captions: Caption[]) => void) {
    this.onUpdate = onUpdate;
  }

  /**
   * Load captions into editor
   */
  loadCaptions(captions: Caption[]): void {
    this.captions = [...captions];
    this.notifyUpdate();
  }

  /**
   * Get all captions
   */
  getCaptions(): Caption[] {
    return [...this.captions];
  }

  /**
   * Add a new caption
   */
  addCaption(caption: Caption): void {
    this.captions.push(caption);
    this.sortCaptions();
    this.notifyUpdate();
  }

  /**
   * Update caption at index
   */
  updateCaption(index: number, updates: Partial<Caption>): void {
    if (index < 0 || index >= this.captions.length) return;

    this.captions[index] = { ...this.captions[index]!, ...updates };

    // If timing changed, re-sort
    if (updates.startTime !== undefined || updates.endTime !== undefined) {
      this.sortCaptions();
    }

    this.notifyUpdate();
  }

  /**
   * Delete caption at index
   */
  deleteCaption(index: number): void {
    if (index < 0 || index >= this.captions.length) return;

    this.captions.splice(index, 1);
    this.notifyUpdate();
  }

  /**
   * Split caption at word index
   */
  splitCaption(captionIndex: number, wordIndex: number): void {
    const caption = this.captions[captionIndex];
    if (!caption || !caption.words || wordIndex >= caption.words.length) return;

    const firstWords = caption.words.slice(0, wordIndex);
    const secondWords = caption.words.slice(wordIndex);

    if (firstWords.length === 0 || secondWords.length === 0) return;

    // Create two new captions
    const firstCaption: Caption = {
      text: firstWords.map((w) => w.text).join(' '),
      startTime: firstWords[0]!.startTime,
      endTime: firstWords[firstWords.length - 1]!.endTime,
      words: firstWords,
    };

    const secondCaption: Caption = {
      text: secondWords.map((w) => w.text).join(' '),
      startTime: secondWords[0]!.startTime,
      endTime: secondWords[secondWords.length - 1]!.endTime,
      words: secondWords,
    };

    this.captions.splice(captionIndex, 1, firstCaption, secondCaption);
    this.notifyUpdate();
  }

  /**
   * Merge two consecutive captions
   */
  mergeCaptions(index1: number, index2: number): void {
    if (
      index1 < 0 ||
      index2 < 0 ||
      index1 >= this.captions.length ||
      index2 >= this.captions.length
    ) {
      return;
    }

    const caption1 = this.captions[index1]!;
    const caption2 = this.captions[index2]!;

    const mergedCaption: Caption = {
      text: caption1.text + ' ' + caption2.text,
      startTime: Math.min(caption1.startTime, caption2.startTime),
      endTime: Math.max(caption1.endTime, caption2.endTime),
      words: [...(caption1.words || []), ...(caption2.words || [])],
    };

    const deleteIndex = Math.max(index1, index2);
    const keepIndex = Math.min(index1, index2);

    this.captions[keepIndex] = mergedCaption;
    this.captions.splice(deleteIndex, 1);
    this.notifyUpdate();
  }

  /**
   * Adjust caption timing
   */
  adjustTiming(index: number, startDelta: number, endDelta: number): void {
    const caption = this.captions[index];
    if (!caption) return;

    caption.startTime = Math.max(0, caption.startTime + startDelta);
    caption.endTime = Math.max(caption.startTime + 0.1, caption.endTime + endDelta);

    // Adjust word timings proportionally
    if (caption.words) {
      const oldDuration = caption.endTime - startDelta - (caption.startTime - startDelta);
      const newDuration = caption.endTime - caption.startTime;
      const scale = newDuration / oldDuration;

      caption.words = caption.words.map((word, i) => ({
        ...word,
        startTime: caption.startTime + (word.startTime - (caption.startTime - startDelta)) * scale,
        endTime: caption.startTime + (word.endTime - (caption.startTime - startDelta)) * scale,
      }));
    }

    this.sortCaptions();
    this.notifyUpdate();
  }

  /**
   * Update word timing
   */
  updateWordTiming(captionIndex: number, wordIndex: number, startTime: number, endTime: number): void {
    const caption = this.captions[captionIndex];
    if (!caption || !caption.words || !caption.words[wordIndex]) return;

    caption.words[wordIndex]!.startTime = startTime;
    caption.words[wordIndex]!.endTime = endTime;

    // Update caption bounds
    caption.startTime = caption.words[0]!.startTime;
    caption.endTime = caption.words[caption.words.length - 1]!.endTime;

    this.notifyUpdate();
  }

  /**
   * Get caption at specific time
   */
  getCaptionAtTime(time: number): { caption: Caption; index: number } | null {
    const index = this.captions.findIndex((c) => time >= c.startTime && time <= c.endTime);
    if (index === -1) return null;

    return { caption: this.captions[index]!, index };
  }

  /**
   * Export captions as SRT
   */
  exportAsSRT(): string {
    let srt = '';
    this.captions.forEach((caption, index) => {
      const startTime = this.formatSRTTime(caption.startTime);
      const endTime = this.formatSRTTime(caption.endTime);

      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${caption.text}\n\n`;
    });
    return srt;
  }

  /**
   * Export captions as VTT
   */
  exportAsVTT(): string {
    let vtt = 'WEBVTT\n\n';
    this.captions.forEach((caption, index) => {
      const startTime = this.formatVTTTime(caption.startTime);
      const endTime = this.formatVTTTime(caption.endTime);

      vtt += `${index + 1}\n`;
      vtt += `${startTime} --> ${endTime}\n`;
      vtt += `${caption.text}\n\n`;
    });
    return vtt;
  }

  /**
   * Import captions from SRT
   */
  importFromSRT(srtContent: string): void {
    const captions: Caption[] = [];
    const blocks = srtContent.trim().split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 3) continue;

      const timeLine = lines[1];
      if (!timeLine) continue;

      const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (!match) continue;

      const startTime = this.parseSRTTime(match[1]!);
      const endTime = this.parseSRTTime(match[2]!);
      const text = lines.slice(2).join('\n');

      captions.push({ text, startTime, endTime });
    }

    this.captions = captions;
    this.notifyUpdate();
  }

  /**
   * Set active caption
   */
  setActive(index: number): void {
    this.activeIndex = index;
  }

  /**
   * Get active caption index
   */
  getActiveIndex(): number {
    return this.activeIndex;
  }

  /**
   * Private helper methods
   */
  private sortCaptions(): void {
    this.captions.sort((a, b) => a.startTime - b.startTime);
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate([...this.captions]);
    }
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private formatVTTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  private parseSRTTime(timeStr: string): number {
    const [hours, mins, secsAndMs] = timeStr.split(':');
    const [secs, ms] = secsAndMs!.split(',');

    return (
      parseInt(hours!) * 3600 +
      parseInt(mins!) * 60 +
      parseInt(secs!) +
      parseInt(ms!) / 1000
    );
  }
}

/**
 * Render caption editor UI
 */
export function renderCaptionEditorUI(
  container: HTMLElement,
  editor: CaptionEditor,
  currentTime: number
): void {
  const captions = editor.getCaptions();
  const activeIndex = editor.getActiveIndex();

  container.innerHTML = `
    <div class="caption-editor">
      <div class="caption-editor-header">
        <h3>Caption Editor</h3>
        <div class="caption-editor-actions">
          <button class="btn-sm" id="addCaptionBtn">Add Caption</button>
          <button class="btn-sm" id="exportSRTBtn">Export SRT</button>
          <button class="btn-sm" id="exportVTTBtn">Export VTT</button>
        </div>
      </div>
      <div class="caption-list">
        ${captions
          .map(
            (caption, index) => `
          <div class="caption-item ${index === activeIndex ? 'active' : ''}" data-index="${index}">
            <div class="caption-timing">
              <input type="number" step="0.1" value="${caption.startTime.toFixed(1)}"
                class="timing-input" data-type="start" data-index="${index}">
              <span>→</span>
              <input type="number" step="0.1" value="${caption.endTime.toFixed(1)}"
                class="timing-input" data-type="end" data-index="${index}">
              <span class="caption-duration">${(caption.endTime - caption.startTime).toFixed(1)}s</span>
            </div>
            <textarea class="caption-text" data-index="${index}">${caption.text}</textarea>
            <div class="caption-actions">
              <button class="btn-icon" data-action="split" data-index="${index}" title="Split">✂️</button>
              <button class="btn-icon" data-action="merge" data-index="${index}" title="Merge with next">🔗</button>
              <button class="btn-icon" data-action="delete" data-index="${index}" title="Delete">🗑️</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  // Add event listeners
  setupCaptionEditorListeners(container, editor);
}

function setupCaptionEditorListeners(container: HTMLElement, editor: CaptionEditor): void {
  // Add caption
  container.querySelector('#addCaptionBtn')?.addEventListener('click', () => {
    editor.addCaption({
      text: 'New caption',
      startTime: 0,
      endTime: 2,
    });
    renderCaptionEditorUI(container, editor, 0);
  });

  // Export SRT
  container.querySelector('#exportSRTBtn')?.addEventListener('click', () => {
    const srt = editor.exportAsSRT();
    downloadFile(srt, 'captions.srt', 'text/plain');
  });

  // Export VTT
  container.querySelector('#exportVTTBtn')?.addEventListener('click', () => {
    const vtt = editor.exportAsVTT();
    downloadFile(vtt, 'captions.vtt', 'text/vtt');
  });

  // Timing inputs
  container.querySelectorAll('.timing-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index!);
      const type = target.dataset.type as 'start' | 'end';
      const value = parseFloat(target.value);

      const caption = editor.getCaptions()[index]!;
      if (type === 'start') {
        editor.adjustTiming(index, value - caption.startTime, 0);
      } else {
        editor.adjustTiming(index, 0, value - caption.endTime);
      }

      renderCaptionEditorUI(container, editor, 0);
    });
  });

  // Text updates
  container.querySelectorAll('.caption-text').forEach((textarea) => {
    textarea.addEventListener('blur', (e) => {
      const target = e.target as HTMLTextAreaElement;
      const index = parseInt(target.dataset.index!);
      editor.updateCaption(index, { text: target.value });
    });
  });

  // Action buttons
  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      const action = target.dataset.action!;
      const index = parseInt(target.dataset.index!);

      switch (action) {
        case 'delete':
          if (confirm('Delete this caption?')) {
            editor.deleteCaption(index);
            renderCaptionEditorUI(container, editor, 0);
          }
          break;
        case 'split':
          const wordIndex = Math.floor((editor.getCaptions()[index]!.words?.length || 0) / 2);
          editor.splitCaption(index, wordIndex);
          renderCaptionEditorUI(container, editor, 0);
          break;
        case 'merge':
          if (index < editor.getCaptions().length - 1) {
            editor.mergeCaptions(index, index + 1);
            renderCaptionEditorUI(container, editor, 0);
          }
          break;
      }
    });
  });
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

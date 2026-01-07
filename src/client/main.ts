/**
 * ClipCraft - Main Application
 * AI-Powered Video Clipping Tool for TikTok/Instagram
 */

import type {
  AppState,
  CurrentClipState,
  Caption,
  HighlightSuggestion,
  VideoFilter,
  CaptionStyle,
  AspectRatio,
  ExportFormat,
} from '@types/index';
import { Utils } from '@modules/utils';
import { clipStorage } from '@modules/clipStorage';
import { videoLoader } from '@modules/videoLoader';
import { clipEditor } from '@modules/clipEditor';
import { aiAnalyzer } from '@modules/aiAnalyzer';
import { captionEngine } from '@modules/captionEngine';
import { VideoFilterEngine, filterPresets } from '@modules/videoFilters';
import { VideoExporter } from '@modules/videoExporter';
import { CaptionEditor, renderCaptionEditorUI } from '@modules/captionEditor';

// Application State
const App: AppState & {
  filters: VideoFilter[];
  filterEngine: VideoFilterEngine | null;
  captionEditor: CaptionEditor | null;
  captionStyle: CaptionStyle;
  exportSettings: {
    aspectRatio: AspectRatio;
    format: ExportFormat;
    quality: 'low' | 'medium' | 'high';
  };
} = {
  currentView: 'home',
  isVideoLoaded: false,
  currentClip: null,
  captions: [],
  clipDuration: 30,
  filters: [],
  filterEngine: null,
  captionEditor: null,
  captionStyle: {
    fontSize: 24,
    fontFamily: 'Inter',
    color: '#ffffff',
    highlightColor: '#3b82f6',
    position: 'bottom',
    animation: 'none',
  },
  exportSettings: {
    aspectRatio: '16:9',
    format: 'mp4',
    quality: 'medium',
  },
};

/**
 * Initialize the application
 */
async function initApp(): Promise<void> {
  // Initialize modules
  await clipStorage.init();
  aiAnalyzer.init();
  captionEngine.init();

  // Initialize video loader
  const mainVideo = document.getElementById('mainVideo') as HTMLVideoElement | null;
  if (!mainVideo) {
    console.error('Main video element not found');
    return;
  }
  videoLoader.init(mainVideo);

  // Initialize clip editor
  const waveformCanvas = document.getElementById('waveformCanvas') as HTMLCanvasElement | null;
  const clipRange = document.getElementById('clipRange') as HTMLElement | null;
  const playhead = document.getElementById('playhead') as HTMLElement | null;

  if (waveformCanvas && clipRange && playhead) {
    clipEditor.init(mainVideo, waveformCanvas, clipRange, playhead);
  }

  // Initialize caption editor
  App.captionEditor = new CaptionEditor((captions) => {
    App.captions = captions;
  });

  // Set up UI event listeners
  setupUIListeners();
  setupTitleInput();
  setupCursorGlow();

  // Load saved clips
  await loadSavedClips();

  // Restore view from URL hash
  restoreViewFromHash();

  // Restore video if one was loaded before refresh
  await restoreVideoFromStorage();

  console.log('⚡ ClipCraft v2.0 initialized with filters, aspect ratios & caption editor!');
}

/**
 * Cursor glow effect
 */
function setupCursorGlow(): void {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;

  document.addEventListener('mousemove', (e) => {
    glow.style.left = e.clientX - 10 + 'px';
    glow.style.top = e.clientY - 10 + 'px';
  });
}

/**
 * Set up UI event listeners
 */
function setupUIListeners(): void {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = (btn as HTMLElement).dataset.view;
      if (view) switchView(view as AppState['currentView']);
    });
  });

  // URL input
  document.getElementById('loadUrlBtn')?.addEventListener('click', loadVideoFromUrl);
  document.getElementById('urlInput')?.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void loadVideoFromUrl();
  });

  // File upload
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput') as HTMLInputElement | null;

  uploadZone?.addEventListener('click', () => fileInput?.click());
  uploadZone?.addEventListener('dragover', handleDragOver);
  uploadZone?.addEventListener('dragleave', handleDragLeave);
  uploadZone?.addEventListener('drop', handleFileDrop);
  fileInput?.addEventListener('change', handleFileSelect);

  // Video controls
  document.getElementById('playPauseBtn')?.addEventListener('click', togglePlayPause);
  document.getElementById('muteBtn')?.addEventListener('click', toggleMute);

  // Update time display
  const mainVideo = document.getElementById('mainVideo') as HTMLVideoElement | null;
  mainVideo?.addEventListener('timeupdate', updateTimeDisplay);
  mainVideo?.addEventListener('play', () => updatePlayPauseIcon(true));
  mainVideo?.addEventListener('pause', () => updatePlayPauseIcon(false));

  // Duration selector
  document.querySelectorAll('.duration-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const duration = parseInt((btn as HTMLElement).dataset.duration || '30');
      selectDuration(duration as 30 | 60);
    });
  });

  // Action buttons
  document.getElementById('analyzeBtn')?.addEventListener('click', () => void analyzeVideo());
  document.getElementById('generateCaptionsBtn')?.addEventListener('click', () => void generateCaptions());
  document.getElementById('previewClipBtn')?.addEventListener('click', () => void previewClip());

  // Preview modal
  document.getElementById('closePreviewBtn')?.addEventListener('click', closePreviewModal);
  document.getElementById('discardClipBtn')?.addEventListener('click', discardClip);
  document.getElementById('saveClipBtn')?.addEventListener('click', () => void saveClip());

  // Clip detail modal
  document.getElementById('closeDetailBtn')?.addEventListener('click', closeDetailModal);
  document.getElementById('deleteClipBtn')?.addEventListener('click', () => void deleteCurrentClip());
  document.getElementById('downloadClipBtn')?.addEventListener('click', () => void downloadCurrentClip());

  // Modal overlay click to close
  document.getElementById('previewModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'previewModal') closePreviewModal();
  });
  document.getElementById('clipDetailModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'clipDetailModal') closeDetailModal();
  });

  // Caption settings
  document.getElementById('captionSize')?.addEventListener('change', updateCaptionStyles);
  document.getElementById('captionFont')?.addEventListener('change', updateCaptionStyles);
  document.getElementById('captionPosition')?.addEventListener('change', updateCaptionStyles);
  document.getElementById('captionAnimation')?.addEventListener('change', updateCaptionStyles);
  document.getElementById('captionColor')?.addEventListener('input', updateCaptionStyles);
  document.getElementById('captionHighlight')?.addEventListener('input', updateCaptionStyles);
  document.getElementById('openCaptionEditorBtn')?.addEventListener('click', openCaptionEditor);

  // Filter presets
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = (btn as HTMLElement).dataset.preset;
      if (preset) applyFilterPreset(preset);
    });
  });

  // Filter sliders
  document.getElementById('filterBrightness')?.addEventListener('input', updateFilters);
  document.getElementById('filterContrast')?.addEventListener('input', updateFilters);
  document.getElementById('filterSaturation')?.addEventListener('input', updateFilters);
  document.getElementById('filterExposure')?.addEventListener('input', updateFilters);
  document.getElementById('filterTemperature')?.addEventListener('input', updateFilters);

  // Export settings
  document.getElementById('aspectRatio')?.addEventListener('change', updateExportSettings);
  document.getElementById('exportFormat')?.addEventListener('change', updateExportSettings);
  document.getElementById('exportQuality')?.addEventListener('change', updateExportSettings);

  // Caption editor modal
  document.getElementById('closeCaptionEditorBtn')?.addEventListener('click', closeCaptionEditor);
  document.getElementById('captionEditorModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'captionEditorModal') closeCaptionEditor();
  });
}

/**
 * Update caption styles
 */
function updateCaptionStyles(): void {
  const size = parseFloat(
    (document.getElementById('captionSize') as HTMLSelectElement | null)?.value || '0.9'
  );
  const font =
    (document.getElementById('captionFont') as HTMLSelectElement | null)?.value || 'Inter';
  const position =
    (document.getElementById('captionPosition') as HTMLSelectElement | null)?.value || 'bottom';
  const animation =
    (document.getElementById('captionAnimation') as HTMLSelectElement | null)?.value || 'none';
  const color =
    (document.getElementById('captionColor') as HTMLInputElement | null)?.value || '#ffffff';
  const highlight =
    (document.getElementById('captionHighlight') as HTMLInputElement | null)?.value || '#3b82f6';

  // Update app state
  App.captionStyle = {
    fontSize: Math.round(size * 24), // Convert rem to px (assuming base 24px)
    fontFamily: font,
    color,
    highlightColor: highlight,
    position: position as 'top' | 'middle' | 'bottom',
    animation: animation as 'fade' | 'slide' | 'bounce' | 'none',
  };

  // Update CSS variables
  document.documentElement.style.setProperty('--caption-color', color);
  document.documentElement.style.setProperty('--caption-highlight', highlight);
  document.documentElement.style.setProperty('--caption-font', font);

  // Update caption elements
  const captionOverlay = document.getElementById('captionOverlay');
  if (captionOverlay) {
    captionOverlay.style.fontFamily = font;

    // Position
    if (position === 'top') {
      captionOverlay.style.top = '10%';
      captionOverlay.style.bottom = 'auto';
    } else if (position === 'middle') {
      captionOverlay.style.top = '50%';
      captionOverlay.style.transform = 'translateY(-50%)';
      captionOverlay.style.bottom = 'auto';
    } else {
      captionOverlay.style.top = 'auto';
      captionOverlay.style.bottom = '10%';
      captionOverlay.style.transform = 'none';
    }

    // Add animation class
    captionOverlay.className = `caption-overlay caption-animation-${animation}`;
  }

  document.querySelectorAll('.caption-word').forEach((word) => {
    (word as HTMLElement).style.fontSize = `${size}rem`;
    (word as HTMLElement).style.fontFamily = font;
  });
}

/**
 * Update clip title overlay
 */
function setupTitleInput(): void {
  const titleInput = document.getElementById('clipTitle') as HTMLInputElement | null;
  const titleOverlay = document.getElementById('titleOverlay');

  if (titleInput && titleOverlay) {
    titleInput.addEventListener('input', () => {
      titleOverlay.textContent = titleInput.value;
    });
  }
}

/**
 * Switch between views
 */
function switchView(view: AppState['currentView']): void {
  App.currentView = view;

  // Save to URL hash
  window.location.hash = view;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view);
  });

  // Update view visibility
  const homeView = document.getElementById('homeView');
  const editView = document.getElementById('editView');
  const galleryView = document.getElementById('galleryView');

  homeView?.classList.toggle('active', view === 'home');
  editView?.classList.toggle('active', view === 'edit');
  galleryView?.classList.toggle('active', view === 'gallery');

  // Refresh gallery if switching to it
  if (view === 'gallery') {
    void loadSavedClips();
  }
}

/**
 * Restore view from URL hash
 */
function restoreViewFromHash(): void {
  const hash = window.location.hash.replace('#', '') as AppState['currentView'];
  if (hash === 'gallery' || hash === 'edit' || hash === 'home') {
    switchView(hash);
  }
}

/**
 * Restore video from localStorage
 */
async function restoreVideoFromStorage(): Promise<void> {
  const savedUrl = localStorage.getItem('clipcraft_video_url');
  const savedName = localStorage.getItem('clipcraft_video_name');

  if (savedUrl && savedName) {
    try {
      Utils.showLoading('Restoring video...');

      const response = await fetch(savedUrl);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], savedName, { type: 'video/mp4' });
        await videoLoader.loadFromFile(file);

        App.isVideoLoaded = true;
        switchView('edit');
        Utils.hideLoading();
        Utils.showToast('Video restored!', 'success');
      } else {
        localStorage.removeItem('clipcraft_video_url');
        localStorage.removeItem('clipcraft_video_name');
        Utils.hideLoading();
      }
    } catch (e) {
      console.log('Could not restore video:', e);
      localStorage.removeItem('clipcraft_video_url');
      localStorage.removeItem('clipcraft_video_name');
      Utils.hideLoading();
    }
  }
}

/**
 * File upload handlers
 */
function handleDragOver(e: Event): void {
  e.preventDefault();
  (e.currentTarget as HTMLElement).classList.add('dragover');
}

function handleDragLeave(e: Event): void {
  (e.currentTarget as HTMLElement).classList.remove('dragover');
}

function handleFileDrop(e: DragEvent): void {
  e.preventDefault();
  (e.currentTarget as HTMLElement).classList.remove('dragover');

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    void loadVideoFile(files[0]!);
  }
}

function handleFileSelect(e: Event): void {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    void loadVideoFile(files[0]!);
  }
}

/**
 * Load video from file
 */
async function loadVideoFile(file: File): Promise<void> {
  try {
    Utils.showLoading('Loading video...');

    const videoInfo = await videoLoader.loadFromFile(file);

    App.isVideoLoaded = true;
    switchView('edit');

    Utils.hideLoading();
    Utils.showToast(`Loaded: ${videoInfo.name}`, 'success');
  } catch (error) {
    Utils.hideLoading();
    Utils.showToast((error as Error).message, 'error');
  }
}

/**
 * Load video from URL
 */
async function loadVideoFromUrl(): Promise<void> {
  const urlInput = document.getElementById('urlInput') as HTMLInputElement | null;
  const url = urlInput?.value.trim() || '';

  if (!url) {
    Utils.showToast('Please enter a video URL', 'warning');
    return;
  }

  // Show progress panel
  const progressPanel = document.getElementById('downloadProgressPanel');
  const progressBar = document.getElementById('downloadProgressBar') as HTMLElement | null;
  const downloadTitle = document.getElementById('downloadTitle');
  const downloadPercent = document.getElementById('downloadPercent');

  progressPanel?.classList.remove('hidden');
  if (downloadTitle) downloadTitle.textContent = 'Starting download...';
  if (downloadPercent) downloadPercent.textContent = '0%';
  if (progressBar) progressBar.style.width = '0%';

  try {
    const serverUrl = '/api/download';

    const downloadPromise = fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    // Poll for progress
    let lastProgress = 0;
    const pollInterval = setInterval(() => {
      void fetch('/api/queue/status')
        .then((res) => res.json())
        .then((status: any) => {
          if (status.currentDownload) {
            const progress = status.currentDownload.progress || 0;
            if (progress > lastProgress) {
              lastProgress = progress;
              if (progressBar) progressBar.style.width = `${progress}%`;
              if (downloadPercent) downloadPercent.textContent = `${Math.round(progress)}%`;
              if (downloadTitle) downloadTitle.textContent = 'Downloading video...';
            }
          }
        })
        .catch(() => {});
    }, 500);

    const response = await downloadPromise;
    clearInterval(pollInterval);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Download failed');
    }

    const result = await response.json();

    // Update progress to 100%
    if (progressBar) progressBar.style.width = '100%';
    if (downloadPercent) downloadPercent.textContent = '100%';
    if (downloadTitle) downloadTitle.textContent = 'Loading video...';

    // Load the video
    const videoResponse = await fetch(result.url);
    const blob = await videoResponse.blob();
    const file = new File([blob], result.filename, { type: 'video/mp4' });

    await videoLoader.loadFromFile(file);

    // Save video URL for refresh persistence
    localStorage.setItem('clipcraft_video_url', result.url);
    localStorage.setItem('clipcraft_video_name', result.filename);

    App.isVideoLoaded = true;
    switchView('edit');
    progressPanel?.classList.add('hidden');

    Utils.showToast('Video ready for editing!', 'success');
  } catch (error) {
    progressPanel?.classList.add('hidden');
    Utils.showToast((error as Error).message, 'error');
  }
}

/**
 * Video controls
 */
function togglePlayPause(): void {
  videoLoader.togglePlay();
}

function updatePlayPauseIcon(isPlaying: boolean): void {
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');

  playIcon?.classList.toggle('hidden', isPlaying);
  pauseIcon?.classList.toggle('hidden', !isPlaying);
}

function toggleMute(): void {
  const video = videoLoader.getElement();
  if (!video) return;

  video.muted = !video.muted;

  const muteBtn = document.getElementById('muteBtn');
  muteBtn?.classList.toggle('muted', video.muted);
}

function updateTimeDisplay(): void {
  const video = videoLoader.getElement();
  if (!video) return;

  const timeDisplay = document.getElementById('timeDisplay');
  if (!timeDisplay) return;

  const current = Utils.formatTime(video.currentTime);
  const total = Utils.formatTime(video.duration);

  timeDisplay.textContent = `${current} / ${total}`;

  // Update caption overlay
  if (App.captions.length > 0) {
    const captionOverlay = document.getElementById('captionOverlay');
    if (captionOverlay) {
      captionEngine.renderCaptions(
        captionOverlay,
        App.captions,
        video.currentTime - clipEditor.clipStart
      );
    }
  }
}

/**
 * Clip duration selection
 */
function selectDuration(duration: 30 | 60): void {
  App.clipDuration = duration;

  document.querySelectorAll('.duration-btn').forEach((btn) => {
    btn.classList.toggle('active', parseInt((btn as HTMLElement).dataset.duration || '30') === duration);
  });

  clipEditor.setClipDuration(duration);
}

/**
 * AI analysis
 */
async function analyzeVideo(): Promise<void> {
  if (!App.isVideoLoaded) {
    Utils.showToast('Please load a video first', 'warning');
    return;
  }

  const video = videoLoader.getElement();
  if (!video) return;

  const suggestions = await aiAnalyzer.analyzeVideoSimple(video, App.clipDuration);

  clipEditor.displaySuggestions(suggestions);
  renderSuggestionsList(suggestions);

  Utils.showToast(`Found ${suggestions.length} potential clips`, 'success');
}

/**
 * Render suggestions list
 */
function renderSuggestionsList(suggestions: HighlightSuggestion[]): void {
  const container = document.getElementById('suggestionsList');
  if (!container) return;

  if (suggestions.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No suggestions found</p></div>';
    return;
  }

  container.innerHTML = suggestions
    .map(
      (s, i) => `
    <div class="suggestion-item" data-index="${i}">
      <div class="suggestion-thumbnail">
        <div style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;color:#666;">
          ${i + 1}
        </div>
      </div>
      <div class="suggestion-info">
        <div class="suggestion-time">${Utils.formatTime(s.startTime)} - ${Utils.formatTime(s.endTime)}</div>
        <div class="suggestion-score">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          ${s.score}% • ${s.reason}
        </div>
      </div>
    </div>
  `
    )
    .join('');

  // Add click handlers
  container.querySelectorAll('.suggestion-item').forEach((item, index) => {
    item.addEventListener('click', () => {
      clipEditor.setFromSuggestion(suggestions[index]!);
    });
  });
}

/**
 * Generate captions
 */
async function generateCaptions(): Promise<void> {
  if (!App.isVideoLoaded) {
    Utils.showToast('Please load a video first', 'warning');
    return;
  }

  const range = clipEditor.getClipRange();
  const video = videoLoader.getElement();
  if (!video) return;

  try {
    if (!captionEngine.supported) {
      App.captions = captionEngine.generateMockCaptions(range.duration);
      Utils.showToast('Demo captions generated (Speech API not available)', 'warning');
    } else {
      App.captions = await captionEngine.generateCaptions(video, range.start, range.end);
      Utils.showToast(`Generated ${App.captions.length} captions`, 'success');
    }
  } catch (error) {
    console.error('Caption generation error:', error);
    App.captions = captionEngine.generateMockCaptions(range.duration);
    Utils.showToast('Using demo captions', 'warning');
  }
}

/**
 * Preview clip
 */
async function previewClip(): Promise<void> {
  if (!App.isVideoLoaded) {
    Utils.showToast('Please load a video first', 'warning');
    return;
  }

  const range = clipEditor.getClipRange();
  const video = videoLoader.getElement();
  if (!video) return;

  Utils.showLoading('Preparing preview with filters and aspect ratio...');

  try {
    // Use VideoExporter with all the settings
    const clipBlob = await VideoExporter.exportClip(video, range.start, range.end, {
      format: App.exportSettings.format,
      aspectRatio: App.exportSettings.aspectRatio,
      quality: App.exportSettings.quality,
      includeCaptions: App.captions.length > 0,
      captionStyle: App.captionStyle,
      captions: App.captions,
      filters: App.filters,
    });

    const previewUrl = URL.createObjectURL(clipBlob);
    const previewVideo = document.getElementById('previewVideo') as HTMLVideoElement | null;
    if (previewVideo) {
      previewVideo.src = previewUrl;
    }

    App.currentClip = {
      blob: clipBlob,
      startTime: range.start,
      endTime: range.end,
      duration: range.duration,
      captions: App.captions,
    };

    document.getElementById('previewModal')?.classList.remove('hidden');
    void previewVideo?.play();

    Utils.hideLoading();
    Utils.showToast(
      `Preview ready! (${App.exportSettings.aspectRatio}, ${App.exportSettings.format.toUpperCase()})`,
      'success'
    );
  } catch (error) {
    Utils.hideLoading();
    Utils.showToast('Failed to create preview: ' + (error as Error).message, 'error');
    console.error(error);
  }
}

/**
 * Modal controls
 */
function closePreviewModal(): void {
  const modal = document.getElementById('previewModal');
  const previewVideo = document.getElementById('previewVideo') as HTMLVideoElement | null;

  previewVideo?.pause();
  if (previewVideo) previewVideo.src = '';
  modal?.classList.add('hidden');
}

function discardClip(): void {
  App.currentClip = null;
  closePreviewModal();
  Utils.showToast('Clip discarded', 'warning');
}

async function saveClip(): Promise<void> {
  if (!App.currentClip) {
    Utils.showToast('No clip to save', 'error');
    return;
  }

  Utils.showLoading('Saving clip...');

  try {
    const video = videoLoader.getElement();
    if (!video) throw new Error('Video element not found');

    const thumbnail = await Utils.createThumbnail(video, App.currentClip.startTime);

    await clipStorage.saveClip({
      videoBlob: App.currentClip.blob,
      thumbnail: thumbnail,
      duration: App.currentClip.duration,
      startTime: App.currentClip.startTime,
      endTime: App.currentClip.endTime,
      captions: App.currentClip.captions,
      sourceUrl: null,
    });

    Utils.hideLoading();
    closePreviewModal();
    Utils.showToast('Clip saved successfully!', 'success');

    await updateClipCount();
  } catch (error) {
    Utils.hideLoading();
    Utils.showToast('Failed to save clip: ' + (error as Error).message, 'error');
    console.error(error);
  }
}

/**
 * Gallery functions
 */
async function loadSavedClips(): Promise<void> {
  const clips = await clipStorage.getAllClips();
  const grid = document.getElementById('clipsGrid');
  if (!grid) return;

  await updateClipCount();

  if (clips.length === 0) {
    grid.innerHTML = `
      <div class="empty-gallery">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <p>No clips saved yet</p>
        <span>Create clips in the editor to see them here</span>
      </div>
    `;
    return;
  }

  grid.innerHTML = clips
    .map(
      (clip) => `
    <div class="clip-card" data-id="${clip.id}">
      <div class="clip-thumbnail">
        <img src="${clip.thumbnail}" alt="${clip.title}">
        <span class="clip-duration">${Utils.formatTime(clip.duration)}</span>
      </div>
      <div class="clip-info">
        <div class="clip-title">${clip.title}</div>
        <div class="clip-date">${Utils.formatRelativeTime(clip.createdAt)}</div>
      </div>
    </div>
  `
    )
    .join('');

  grid.querySelectorAll('.clip-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.id;
      if (id) void openClipDetail(id);
    });
  });
}

async function updateClipCount(): Promise<void> {
  const count = await clipStorage.getClipCount();
  const clipCountEl = document.getElementById('clipCount');
  if (clipCountEl) {
    clipCountEl.textContent = `${count} clip${count !== 1 ? 's' : ''}`;
  }
}

async function openClipDetail(clipId: string): Promise<void> {
  const clip = await clipStorage.getClip(clipId);
  if (!clip) {
    Utils.showToast('Clip not found', 'error');
    return;
  }

  App.currentClipId = clipId;

  const title = document.getElementById('clipDetailTitle');
  if (title) title.textContent = clip.title;

  const videoEl = document.getElementById('clipDetailVideo') as HTMLVideoElement | null;
  if (videoEl) {
    videoEl.src = URL.createObjectURL(clip.videoBlob);
  }

  document.getElementById('clipDetailModal')?.classList.remove('hidden');
}

function closeDetailModal(): void {
  const modal = document.getElementById('clipDetailModal');
  const video = document.getElementById('clipDetailVideo') as HTMLVideoElement | null;

  video?.pause();
  if (video) video.src = '';
  modal?.classList.add('hidden');
  App.currentClipId = undefined;
}

async function deleteCurrentClip(): Promise<void> {
  if (!App.currentClipId) return;

  const confirmed = confirm('Are you sure you want to delete this clip?');
  if (!confirmed) return;

  try {
    await clipStorage.deleteClip(App.currentClipId);
    closeDetailModal();
    await loadSavedClips();
    Utils.showToast('Clip deleted', 'success');
  } catch (error) {
    Utils.showToast('Failed to delete clip', 'error');
  }
}

async function downloadCurrentClip(): Promise<void> {
  if (!App.currentClipId) return;

  try {
    await clipStorage.exportClip(App.currentClipId);
    Utils.showToast('Download started', 'success');
  } catch (error) {
    Utils.showToast('Failed to download clip', 'error');
  }
}

/**
 * Caption Editor Functions
 */
function openCaptionEditor(): void {
  if (!App.captionEditor) return;

  if (App.captions.length === 0) {
    Utils.showToast('Generate captions first', 'warning');
    return;
  }

  App.captionEditor.loadCaptions(App.captions);

  const container = document.getElementById('captionEditorContainer');
  if (container) {
    const video = videoLoader.getElement();
    renderCaptionEditorUI(container, App.captionEditor, video?.currentTime || 0);
  }

  document.getElementById('captionEditorModal')?.classList.remove('hidden');
}

function closeCaptionEditor(): void {
  document.getElementById('captionEditorModal')?.classList.add('hidden');
}

/**
 * Filter Functions
 */
function applyFilterPreset(presetName: string): void {
  // Update active button
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.preset === presetName);
  });

  if (presetName === 'none') {
    App.filters = [];
    resetFilterSliders();
  } else {
    const preset = filterPresets.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === presetName);
    if (preset) {
      App.filters = [...preset.filters];
      updateFilterSlidersFromPreset(preset.filters);
    }
  }

  updateVideoFilters();
}

function updateFilters(): void {
  const brightness = parseInt(
    (document.getElementById('filterBrightness') as HTMLInputElement | null)?.value || '50'
  );
  const contrast = parseInt(
    (document.getElementById('filterContrast') as HTMLInputElement | null)?.value || '50'
  );
  const saturation = parseInt(
    (document.getElementById('filterSaturation') as HTMLInputElement | null)?.value || '50'
  );
  const exposure = parseInt(
    (document.getElementById('filterExposure') as HTMLInputElement | null)?.value || '50'
  );
  const temperature = parseInt(
    (document.getElementById('filterTemperature') as HTMLInputElement | null)?.value || '50'
  );

  // Update filter display values
  updateFilterValueDisplay('filterBrightness', brightness - 50);
  updateFilterValueDisplay('filterContrast', contrast);
  updateFilterValueDisplay('filterSaturation', saturation);
  updateFilterValueDisplay('filterExposure', exposure - 50);
  updateFilterValueDisplay('filterTemperature', temperature - 50);

  // Update filters
  App.filters = [
    { type: 'brightness', value: brightness, enabled: brightness !== 50 },
    { type: 'contrast', value: contrast, enabled: contrast !== 50 },
    { type: 'saturation', value: saturation, enabled: saturation !== 50 },
    { type: 'exposure', value: exposure, enabled: exposure !== 50 },
    { type: 'temperature', value: temperature, enabled: temperature !== 50 },
  ].filter((f) => f.enabled);

  // Reset preset button
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  updateVideoFilters();
}

function updateFilterValueDisplay(sliderId: string, value: number): void {
  const slider = document.getElementById(sliderId);
  const valueSpan = slider?.parentElement?.querySelector('.filter-value');
  if (valueSpan) {
    valueSpan.textContent = value.toString();
  }
}

function updateFilterSlidersFromPreset(filters: VideoFilter[]): void {
  // Reset all sliders first
  resetFilterSliders();

  // Apply preset values
  filters.forEach((filter) => {
    const sliderId = `filter${filter.type.charAt(0).toUpperCase() + filter.type.slice(1)}`;
    const slider = document.getElementById(sliderId) as HTMLInputElement | null;
    if (slider) {
      slider.value = filter.value.toString();
      updateFilterValueDisplay(
        sliderId,
        filter.type === 'brightness' || filter.type === 'exposure' || filter.type === 'temperature'
          ? filter.value - 50
          : filter.value
      );
    }
  });
}

function resetFilterSliders(): void {
  const sliders = [
    'filterBrightness',
    'filterContrast',
    'filterSaturation',
    'filterExposure',
    'filterTemperature',
  ];
  sliders.forEach((id) => {
    const slider = document.getElementById(id) as HTMLInputElement | null;
    if (slider) {
      slider.value = '50';
      updateFilterValueDisplay(id, id.includes('Contrast') || id.includes('Saturation') ? 50 : 0);
    }
  });
}

function updateVideoFilters(): void {
  const video = videoLoader.getElement();
  if (!video || !App.isVideoLoaded) return;

  // Create WebGL canvas overlay if needed
  if (!App.filterEngine) {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';

    const videoWrapper = video.parentElement;
    if (videoWrapper) {
      videoWrapper.style.position = 'relative';
      videoWrapper.appendChild(canvas);
      App.filterEngine = new VideoFilterEngine(canvas);

      // Start render loop
      startFilterRenderLoop();
    }
  }

  if (App.filterEngine) {
    App.filterEngine.setFilters(App.filters);
  }
}

/**
 * Render loop for real-time filters
 */
function startFilterRenderLoop(): void {
  const video = videoLoader.getElement();

  function render() {
    if (video && !video.paused && !video.ended && App.filterEngine) {
      App.filterEngine.renderFrame(video);
    }
    requestAnimationFrame(render);
  }

  render();
}

/**
 * Export Settings
 */
function updateExportSettings(): void {
  App.exportSettings.aspectRatio = (
    (document.getElementById('aspectRatio') as HTMLSelectElement | null)?.value || '16:9'
  ) as AspectRatio;
  App.exportSettings.format = (
    (document.getElementById('exportFormat') as HTMLSelectElement | null)?.value || 'mp4'
  ) as ExportFormat;
  App.exportSettings.quality = (
    (document.getElementById('exportQuality') as HTMLSelectElement | null)?.value || 'medium'
  ) as 'low' | 'medium' | 'high';
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => void initApp());

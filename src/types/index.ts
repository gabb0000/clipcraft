/**
 * ClipCraft - Shared Type Definitions
 */

// ============================================
// Video & Clip Types
// ============================================

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  name: string;
  size: number;
  source?: 'file' | 'youtube' | 'twitch';
  videoId?: string;
  vodId?: string;
  thumbnail?: string;
  limitation?: boolean;
  message?: string;
  originalUrl?: string;
}

export interface ClipRange {
  start: number;
  end: number;
  duration: number;
}

export interface ClipData {
  id?: string;
  title?: string;
  videoBlob: Blob;
  thumbnail?: string;
  duration: number;
  startTime: number;
  endTime: number;
  captions?: Caption[];
  sourceUrl?: string | null;
  createdAt?: string;
}

export interface SavedClip extends Required<ClipData> {
  id: string;
  createdAt: string;
}

// ============================================
// Caption Types
// ============================================

export interface CaptionWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface Caption {
  text: string;
  startTime: number;
  endTime: number;
  words?: CaptionWord[];
}

export interface CaptionStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  highlightColor: string;
  backgroundColor?: string;
  position: 'top' | 'middle' | 'bottom';
  animation?: 'fade' | 'slide' | 'bounce' | 'none';
}

// ============================================
// AI Analysis Types
// ============================================

export interface AudioSample {
  time: number;
  energy: number;
  bass: number;
  high: number;
}

export interface VisualSample {
  time: number;
  brightness: number;
  motion: number;
}

export interface AudioAnalysisData {
  samples: AudioSample[];
  duration: number;
  sampleRate: number;
}

export interface HighlightSuggestion {
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  reason: string;
}

// ============================================
// Server Types
// ============================================

export interface DownloadQueueItem {
  id: string;
  url: string;
  title: string;
  status: 'queued' | 'downloading' | 'complete' | 'error';
  progress: number;
  addedAt: string;
  filename?: string;
  error?: string;
}

export interface QueueStatus {
  currentDownload: DownloadQueueItem | null;
  queue: DownloadQueueItem[];
  isProcessing: boolean;
}

export interface DownloadResponse {
  success: boolean;
  filename: string;
  url: string;
  size: number;
}

export interface ClipRequest {
  startTime: number;
  endTime: number;
  sourceFile?: string;
}

export interface ClipResponse {
  success: boolean;
  filename: string;
  url: string;
  size: number;
}

export interface TranscriptionRequest {
  videoFile?: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptionResponse {
  success: boolean;
  text: string;
  captions: Caption[];
}

// ============================================
// Export Types
// ============================================

export type ExportFormat = 'mp4' | 'webm' | 'gif';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export interface ExportOptions {
  format: ExportFormat;
  aspectRatio: AspectRatio;
  quality: 'low' | 'medium' | 'high';
  includeCaptions: boolean;
  captionStyle?: CaptionStyle;
  filters?: VideoFilter[];
}

// ============================================
// Video Filter Types
// ============================================

export type FilterType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'blur'
  | 'sharpen'
  | 'grayscale'
  | 'sepia'
  | 'vignette'
  | 'exposure'
  | 'temperature';

export interface VideoFilter {
  type: FilterType;
  value: number; // 0-100 or -100 to 100 depending on filter
  enabled: boolean;
}

export interface FilterPreset {
  name: string;
  filters: VideoFilter[];
}

// ============================================
// App State Types
// ============================================

export interface AppState {
  currentView: 'home' | 'edit' | 'gallery';
  isVideoLoaded: boolean;
  currentClip: CurrentClipState | null;
  captions: Caption[];
  clipDuration: 30 | 60;
  currentClipId?: string;
}

export interface CurrentClipState {
  blob: Blob;
  startTime: number;
  endTime: number;
  duration: number;
  captions: Caption[];
}

// ============================================
// Utility Types
// ============================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================
// Web Worker Message Types
// ============================================

export interface AnalyzeVideoMessage {
  type: 'analyze';
  videoData: ArrayBuffer;
  duration: number;
  clipDuration: number;
}

export interface AnalyzeVideoResponse {
  type: 'complete' | 'error';
  highlights?: HighlightSuggestion[];
  error?: string;
}

export interface RenderFilterMessage {
  type: 'render';
  imageData: ImageData;
  filters: VideoFilter[];
}

export interface RenderFilterResponse {
  type: 'complete' | 'error';
  imageData?: ImageData;
  error?: string;
}

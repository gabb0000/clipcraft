/**
 * ClipCraft Download Server
 * Features: Download queue, progress tracking, clip creation, transcription
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import FormData from 'form-data';
import https from 'https';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Configuration
const PORT = parseInt(process.env.PORT || '3000');
const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');

// Platform-specific paths for yt-dlp and FFmpeg
const isWindows = process.platform === 'win32';
const YTDLP_PATH = process.env.YTDLP_PATH || (
  isWindows
    ? process.env.LOCALAPPDATA + '\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe'
    : '/usr/local/bin/yt-dlp'  // Linux/Render path
);
const FFMPEG_PATH = process.env.FFMPEG_PATH || (
  isWindows
    ? path.join(__dirname, '../../ffmpeg.exe')
    : 'ffmpeg'  // Use system FFmpeg on Linux
);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Validate configuration
if (!GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY not set in environment. Transcription will not work.');
}

// Create downloads directory
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../')));
app.use('/dist', express.static(path.join(__dirname, '../../dist')));

// ============================================
// Types
// ============================================

interface DownloadQueueItem {
  id: string;
  url: string;
  title: string;
  status: 'queued' | 'downloading' | 'complete' | 'error';
  progress: number;
  addedAt: string;
  filename?: string;
  error?: string;
}

interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionResponse {
  text: string;
  words?: TranscriptionWord[];
}

// ============================================
// Download Queue System
// ============================================

const downloadQueue: DownloadQueueItem[] = [];
let currentDownload: DownloadQueueItem | null = null;
let isProcessing = false;

/**
 * Add to download queue
 */
app.post('/queue/add', (req: Request, res: Response) => {
  const { url, title } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required and must be a string' });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const id = Date.now().toString();
  const item: DownloadQueueItem = {
    id,
    url,
    title: title || 'Video',
    status: 'queued',
    progress: 0,
    addedAt: new Date().toISOString(),
  };

  downloadQueue.push(item);
  console.log(`📋 Added to queue: ${url}`);

  // Start processing if not already
  if (!isProcessing) {
    void processQueue();
  }

  res.json({ success: true, id, queuePosition: downloadQueue.length });
});

/**
 * Get queue status
 */
app.get('/queue/status', (_req: Request, res: Response) => {
  res.json({
    currentDownload,
    queue: downloadQueue,
    isProcessing,
  });
});

/**
 * Cancel a download
 */
app.delete('/queue/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const index = downloadQueue.findIndex((d) => d.id === id);

  if (index !== -1) {
    downloadQueue.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Download not found' });
  }
});

/**
 * Process download queue
 */
async function processQueue(): Promise<void> {
  if (isProcessing || downloadQueue.length === 0) return;

  isProcessing = true;

  while (downloadQueue.length > 0) {
    const item = downloadQueue[0]!;
    currentDownload = item;
    item.status = 'downloading';

    console.log(`📥 Downloading: ${item.url}`);

    try {
      await downloadVideo(item);
      item.status = 'complete';
      item.progress = 100;
      console.log(`✅ Complete: ${item.filename}`);
    } catch (error) {
      item.status = 'error';
      item.error = (error as Error).message;
      console.log(`❌ Failed: ${(error as Error).message}`);
    }

    // Remove from queue
    downloadQueue.shift();
  }

  currentDownload = null;
  isProcessing = false;
}

/**
 * Download a video
 */
function downloadVideo(item: DownloadQueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(DOWNLOAD_DIR, `video_${item.id}.mp4`);

    const args = [
      '--ffmpeg-location',
      path.dirname(FFMPEG_PATH),
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
      '--merge-output-format',
      'mp4',
      '--newline',
      '-o',
      outputFile,
      item.url,
    ];

    const process = spawn(YTDLP_PATH, args);

    process.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      // Parse progress
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) {
        item.progress = parseFloat(match[1]!);
      }
      // Get filename
      if (line.includes('Destination:') || line.includes('Merging')) {
        item.filename = `video_${item.id}.mp4`;
      }
    });

    process.stderr.on('data', (data: Buffer) => {
      console.error('yt-dlp stderr:', data.toString());
    });

    process.on('close', (code) => {
      if (code === 0) {
        item.filename = `video_${item.id}.mp4`;
        item.url = `http://localhost:${PORT}/downloads/video_${item.id}.mp4`;
        resolve();
      } else {
        reject(new Error(`Download failed with code ${code}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================
// Legacy Download (for compatibility)
// ============================================

app.post('/download', (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required and must be a string' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const id = Date.now().toString();
  const item: DownloadQueueItem = {
    id,
    url,
    title: 'Video',
    status: 'downloading',
    progress: 0,
    addedAt: new Date().toISOString(),
  };

  currentDownload = item;

  console.log(`📥 Downloading: ${url}`);

  downloadVideo(item)
    .then(() => {
      currentDownload = null;
      const filePath = path.join(DOWNLOAD_DIR, item.filename!);
      res.json({
        success: true,
        filename: item.filename,
        url: `http://localhost:${PORT}/downloads/${item.filename}`,
        size: fs.statSync(filePath).size,
      });
    })
    .catch((error: Error) => {
      currentDownload = null;
      res.status(500).json({ error: error.message });
    });
});

// ============================================
// Clip Creation
// ============================================

app.post('/clip', (req: Request, res: Response) => {
  const { startTime, endTime } = req.body;

  // Validate inputs
  if (typeof startTime !== 'number' || typeof endTime !== 'number') {
    return res.status(400).json({ error: 'startTime and endTime must be numbers' });
  }

  if (startTime < 0 || endTime <= startTime) {
    return res.status(400).json({ error: 'Invalid time range' });
  }

  const duration = endTime - startTime;
  const timestamp = Date.now();
  const outputFile = path.join(DOWNLOAD_DIR, `clip_${timestamp}.mp4`);

  // Find video files
  const files = fs.readdirSync(DOWNLOAD_DIR);
  const videoFiles = files
    .filter((f) => f.endsWith('.mp4') && !f.startsWith('clip_'))
    .sort()
    .reverse();

  if (videoFiles.length === 0) {
    return res.status(404).json({ error: 'No video file found' });
  }

  const videoPath = path.join(DOWNLOAD_DIR, videoFiles[0]!);
  console.log(`✂️  Creating clip: ${startTime}s to ${endTime}s`);

  // Use FFmpeg to create clip
  const command = `"${FFMPEG_PATH}" -ss ${startTime} -i "${videoPath}" -t ${duration} -c copy -y "${outputFile}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, _stdout, stderr) => {
    if (error) {
      return res.status(500).json({
        error: 'Clip creation failed',
        details: stderr?.slice(-300),
      });
    }

    if (fs.existsSync(outputFile)) {
      console.log(`✅ Clip created`);
      res.json({
        success: true,
        filename: `clip_${timestamp}.mp4`,
        url: `http://localhost:${PORT}/downloads/clip_${timestamp}.mp4`,
        size: fs.statSync(outputFile).size,
      });
    } else {
      res.status(500).json({ error: 'Clip file not created' });
    }
  });
});

// ============================================
// Groq Whisper Transcription
// ============================================

app.post('/transcribe', async (req: Request, res: Response) => {
  const { startTime, endTime } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  // Validate inputs
  if (typeof startTime !== 'number' || typeof endTime !== 'number') {
    return res.status(400).json({ error: 'startTime and endTime must be numbers' });
  }

  try {
    // Find the video file
    const files = fs.readdirSync(DOWNLOAD_DIR);
    const videoFiles = files
      .filter((f) => f.endsWith('.mp4') && !f.startsWith('clip_'))
      .sort()
      .reverse();

    if (videoFiles.length === 0) {
      return res.status(404).json({ error: 'No video file found' });
    }

    const videoPath = path.join(DOWNLOAD_DIR, videoFiles[0]!);
    const audioPath = path.join(DOWNLOAD_DIR, `temp_audio_${Date.now()}.mp3`);

    console.log('🎤 Extracting audio for transcription...');

    // Extract audio from video segment
    const duration = endTime - startTime;
    const extractCmd = `"${FFMPEG_PATH}" -ss ${startTime} -i "${videoPath}" -t ${duration} -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`;

    await new Promise<void>((resolve, reject) => {
      exec(extractCmd, { maxBuffer: 1024 * 1024 * 50 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log('📤 Sending to Groq Whisper API...');

    // Send to Groq API
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await new Promise<TranscriptionResponse>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.groq.com',
          path: '/openai/v1/audio/transcriptions',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            ...formData.getHeaders(),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as TranscriptionResponse);
            } catch (e) {
              reject(new Error(data));
            }
          });
        }
      );

      req.on('error', reject);
      formData.pipe(req);
    });

    // Clean up temp audio
    fs.unlinkSync(audioPath);

    // Format captions
    const captions: any[] = [];
    if (response.words) {
      let currentCaption = { text: '', words: [], startTime: 0, endTime: 0 };

      response.words.forEach((word, i) => {
        (currentCaption.words as any[]).push({
          text: word.word,
          startTime: word.start,
          endTime: word.end,
        });
        currentCaption.text += (currentCaption.text ? ' ' : '') + word.word;

        if (i === 0) currentCaption.startTime = word.start;
        currentCaption.endTime = word.end;

        // Split into chunks of ~8 words
        if (currentCaption.words.length >= 8 || i === response.words!.length - 1) {
          captions.push({ ...currentCaption });
          currentCaption = { text: '', words: [], startTime: 0, endTime: 0 };
        }
      });
    }

    console.log(`✅ Transcription complete: ${captions.length} caption segments`);

    res.json({
      success: true,
      text: response.text,
      captions: captions,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================
// Utility Endpoints
// ============================================

app.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'running',
    currentDownload,
    queueLength: downloadQueue.length,
  });
});

app.get('/files', (_req: Request, res: Response) => {
  const files = fs.readdirSync(DOWNLOAD_DIR).map((filename) => ({
    filename,
    size: fs.statSync(path.join(DOWNLOAD_DIR, filename)).size,
    url: `http://localhost:${PORT}/downloads/${filename}`,
  }));
  res.json({ files });
});

app.delete('/file/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;

  // Validate filename (prevent path traversal)
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ============================================
// Error Handling
// ============================================

// Serve index.html for root route
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../index.html'));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`\n🎬 ClipCraft Download Server v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Downloads: ${DOWNLOAD_DIR}`);
  console.log(`   Transcription: ${GROQ_API_KEY ? 'Enabled' : 'Disabled (no API key)'}`);
  console.log(`\n   Ready!\n`);
});

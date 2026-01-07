# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClipCraft is an AI-powered video clipping tool that creates short-form clips (30s/60s) from YouTube videos and Twitch VODs. It features AI highlight detection, TikTok-style captions with word-by-word highlighting, and a browser-based editor with timeline controls.

## Architecture

### Client-Server Architecture

**Frontend (Browser-based):**
- Pure vanilla JavaScript with modular components (no framework)
- Each JS module is exposed as a global window object (e.g., `window.Utils`, `window.ClipEditor`)
- Single-page application with three main views: Home, Edit, Gallery
- IndexedDB for client-side clip storage (see `js/clipStorage.js`)

**Backend (Node.js/Express):**
- Download server (`server.js`) running on port 3000
- Handles video downloads via yt-dlp and clip creation via FFmpeg
- Download queue system for managing multiple concurrent video downloads
- Groq Whisper API integration for transcription

### Key Module Responsibilities

**js/utils.js** - Shared utility functions (time formatting, video URL parsing, toast notifications, debounce/throttle)

**js/clipStorage.js** - IndexedDB wrapper for saving/loading clips with metadata and thumbnails

**js/videoLoader.js** - Handles loading videos from files or URLs, downloads via server, clip extraction (server-side with FFmpeg or browser-based fallback)

**js/clipEditor.js** - Timeline editor with waveform visualization, clip range selection, keyboard shortcuts, and drag-to-adjust handles

**js/aiAnalyzer.js** - Two analysis modes:
- Simple mode (default): Visual analysis using canvas frame sampling, optimized to max 60 samples
- Audio mode: Web Audio API for energy-based peak detection
- Always returns 5 evenly distributed highlight suggestions

**js/captionEngine.js** - Caption generation with word-level timing, TikTok-style rendering with active word highlighting

**index.js** - Main application controller connecting all modules

**server.js** - Express server with endpoints:
- `/queue/add` - Add video to download queue
- `/queue/status` - Get queue status
- `/download` - Legacy single download endpoint
- `/clip` - Create clip using FFmpeg (preserves audio properly)
- `/transcribe` - Groq Whisper API transcription with word-level timestamps

### Critical Integration Points

**Video Download Flow:**
1. User pastes YouTube/Twitch URL
2. `VideoLoader.loadFromUrl()` calls server `/download` endpoint
3. Server spawns yt-dlp process with progress tracking
4. Downloaded file served from `/downloads` directory
5. Video loaded into `<video>` element via blob URL

**Clip Creation Flow:**
1. User sets clip range on timeline (default 30s, adjustable to 60s)
2. `VideoLoader.extractClip()` calls server `/clip` endpoint
3. Server uses FFmpeg to extract segment with proper audio
4. Fallback to browser MediaRecorder API if server unavailable (no audio)
5. Clip saved to IndexedDB with metadata via `ClipStorage.saveClip()`

**AI Analysis Flow:**
1. `AIAnalyzer.analyzeVideoSimple()` samples frames using canvas (160x90 resolution)
2. Calculates brightness and motion between frames
3. Returns 5 evenly distributed clips with motion-based scoring
4. Results displayed as markers on timeline

**Caption Generation:**
1. Server extracts audio segment to temp MP3
2. Sends to Groq Whisper API with word-level timestamps
3. Captions split into ~8 word chunks
4. Rendered with active word highlighting during playback

## Development Commands

### Server Operations

Start the download server (required for URL downloads):
```bash
npm start
```

Start with auto-reload during development:
```bash
npm run dev
```

### Opening the Application

Open `index.html` directly in browser (Chrome/Edge recommended). No build step required.

### External Dependencies

The application expects these to be available:

**yt-dlp:** Located at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\yt-dlp.exe`

**FFmpeg:** Expected at `./ffmpeg.exe` in the project root

**Groq API Key:** Hardcoded in server.js at line 313 (should be moved to environment variable)

## Important Implementation Details

### Audio Preservation in Clips

Always use server-side FFmpeg clip extraction (`/clip` endpoint) to preserve audio. Browser-based MediaRecorder fallback captures video only.

### Keyboard Shortcuts

The app has extensive keyboard controls (see `ClipEditor.onKeydown()` at js/clipEditor.js:255):
- Space/K: Play/Pause
- J/L: Seek backward/forward 5s
- I/O: Set in/out points
- Arrow keys: Frame-by-frame seeking

When adding features, avoid breaking these shortcuts.

### Module Loading Order

Scripts must load in this specific order (see index.html:322-328):
1. utils.js (dependencies for all other modules)
2. clipStorage.js
3. videoLoader.js
4. aiAnalyzer.js
5. captionEngine.js
6. clipEditor.js
7. index.js (main controller)

### Waveform Canvas Rendering

The waveform is pseudo-random but deterministic (see `ClipEditor.drawWaveform()` at js/clipEditor.js:102). It uses a seeded algorithm, not actual audio analysis. The visual highlight of the clip range is updated by redrawing with different colors for in-range bars.

### IndexedDB Schema

Database: `ClipCraftDB`, Store: `clips`
- Key: `id` (generated via `Utils.generateId()`)
- Indexes: `createdAt`, `title`
- Blob storage: `videoBlob` field stores entire clip file
- Metadata: title, duration, startTime, endTime, captions, sourceUrl, thumbnail, createdAt

### API Key Security Warning

The Groq API key is currently hardcoded in server.js. For production use, move to environment variable or secure configuration.

## Common Patterns

### Error Handling

All async operations use try-catch with user-friendly toast notifications via `Utils.showToast()`. Server errors should provide helpful messages about checking if server is running.

### Loading States

Use `Utils.showLoading()` / `Utils.hideLoading()` for async operations. The loading overlay blocks UI interaction.

### Time Formatting

Always use `Utils.formatTime()` for displaying seconds as MM:SS or HH:MM:SS format. Use `Utils.parseTime()` for the reverse.

### Canvas Operations

When working with video frames, use small canvas sizes (160x90 for analysis, 180x320 for thumbnails) to optimize performance.

# 🎬 ClipCraft - AI-Powered Video Clipping Tool

ClipCraft is a modern, browser-based video editing tool designed for creating short-form content for TikTok, Instagram Reels, and YouTube Shorts. It features AI-powered highlight detection, real-time WebGL video filters, multi-format export, and advanced caption editing.

![ClipCraft](https://img.shields.io/badge/version-2.0-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green)

## ✨ Features

### 🎨 Video Filters (WebGL-based, 60fps)
- **Real-time filters:** Brightness, Contrast, Saturation, Exposure, Temperature
- **5 Built-in presets:**
  - Vibrant (enhanced colors)
  - Cinematic (film-grade look)
  - Black & White
  - Vintage (sepia tone)
  - Bright & Airy

### 📐 Multi-Format Export
- **MP4** - Server-side with FFmpeg (preserves audio)
- **WebM** - Browser fallback
- **GIF** - Client-side encoding with optimization

### 📱 Aspect Ratio Support
- **16:9** (YouTube/Landscape)
- **9:16** (TikTok/Instagram Reels)
- **1:1** (Instagram Square)
- **4:5** (Instagram Feed)

### 💬 Advanced Caption System
- **AI-powered transcription** using Groq Whisper API
- **Caption Editor:**
  - Split/merge captions
  - Edit text and timing
  - Export as SRT/VTT
  - Import from SRT
- **Styling options:**
  - Font selection (Inter, Arial, Impact, Comic Sans)
  - Position (Top, Middle, Bottom)
  - Animations (Fade, Slide, Bounce)
  - Custom colors and highlights

### 🤖 AI Highlight Detection
- Visual analysis using canvas frame sampling
- Audio energy-based peak detection
- Returns 5 evenly distributed highlight suggestions

### 🎞️ Timeline Editor
- Waveform visualization
- Drag-to-adjust clip handles
- Keyboard shortcuts (Space, J/L, I/O, Arrow keys)
- 30s/60s clip duration support

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **FFmpeg** - Required for video processing
  - Windows: Place `ffmpeg.exe` in project root or install via winget
  - Mac: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **yt-dlp** (optional) - For downloading YouTube/Twitch videos
  - Windows: `winget install yt-dlp`
  - Mac/Linux: `pip install yt-dlp`

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/clipcraft.git
cd clipcraft
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` and add your Groq API key:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Get your Groq API key from: https://console.groq.com/keys

4. **Start the development server:**
```bash
npm run dev
```

5. **Open the application:**
   - Open `index.html` in your browser (Chrome/Edge recommended)
   - Or navigate to `http://localhost:5173` if using Vite dev server

## 📖 Usage

1. **Load a video:**
   - Drag & drop a video file
   - Upload from your computer
   - Paste a YouTube or Twitch URL

2. **Apply filters (optional):**
   - Click preset buttons for instant looks
   - Or adjust individual sliders manually

3. **Select aspect ratio:**
   - Choose from dropdown (16:9, 9:16, 1:1, 4:5)

4. **AI analyze (optional):**
   - Click "AI Analyze" to find highlights
   - Click suggested clips to jump to them

5. **Generate captions (optional):**
   - Click "Generate Captions" for AI transcription
   - Click "Edit" to open caption editor
   - Customize font, position, and animations

6. **Preview & Export:**
   - Click "Preview Clip" to see the final result
   - Choose export format (MP4, WebM, GIF)
   - Click "Save Clip" to download

## 🔧 Development

### Project Structure

```
clipcraft/
├── src/
│   ├── client/
│   │   ├── main.ts              # Main application
│   │   └── modules/
│   │       ├── videoFilters.ts  # WebGL filters
│   │       ├── videoExporter.ts # Multi-format export
│   │       ├── captionEditor.ts # Caption editing
│   │       ├── captionEngine.ts # Caption generation
│   │       ├── clipEditor.ts    # Timeline editor
│   │       ├── aiAnalyzer.ts    # AI highlights
│   │       └── utils.ts         # Utilities
│   ├── server/
│   │   └── server.ts            # Express server
│   └── types/
│       └── index.ts             # TypeScript types
├── index.html                   # Main HTML
├── index.css                    # Styles
├── server.js                    # Legacy server (being phased out)
└── package.json
```

### Available Scripts

```bash
npm start        # Start production server
npm run dev      # Start development server with auto-reload
npm run build    # Build TypeScript to JavaScript
npm run type-check # Check TypeScript types
```

## 🔒 Security

### Important Security Notes

1. **API Keys:** Never commit your `.env` file. Always use environment variables for sensitive data.

2. **Video Files:** Downloaded videos are stored locally in `/downloads`. These are gitignored by default.

3. **User Data:** Clips are stored in browser IndexedDB. No data is sent to external servers except:
   - Groq API for transcription (if enabled)
   - YouTube/Twitch for video downloads (if using URL input)

### Best Practices

- Keep your Groq API key private
- Rotate API keys regularly
- Review `.gitignore` before committing
- Don't commit large video files

## 🛠️ Technologies

- **Frontend:**
  - Vanilla TypeScript (no framework)
  - WebGL for real-time filters
  - IndexedDB for storage
  - Canvas API for video processing

- **Backend:**
  - Node.js + Express
  - FFmpeg for video processing
  - yt-dlp for video downloads
  - Groq Whisper API for transcription

- **Build Tools:**
  - Vite for development
  - TypeScript compiler

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Issues

Found a bug? Have a feature request? Please open an issue on GitHub.

## 📧 Contact

For questions or support, please open an issue or contact [your-email@example.com]

## 🙏 Acknowledgments

- [Groq](https://groq.com/) for the Whisper API
- [FFmpeg](https://ffmpeg.org/) for video processing
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for video downloads
- [gifenc](https://github.com/mattdesl/gifenc) for GIF encoding

---

Made with ❤️ by [Your Name]

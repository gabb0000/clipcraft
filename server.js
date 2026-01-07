/**
 * ClipCraft Download Server
 * Features: Download queue, progress tracking, clip creation
 */

const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Create downloads directory
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

app.use(cors());
app.use(express.json());
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Paths
const YTDLP_PATH = process.env.LOCALAPPDATA + '\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe';
const FFMPEG_PATH = path.join(__dirname, 'ffmpeg.exe');

// ============================================
// DOWNLOAD QUEUE SYSTEM
// ============================================

const downloadQueue = [];
let currentDownload = null;
let isProcessing = false;

/**
 * Add to download queue
 */
app.post('/queue/add', (req, res) => {
    const { url, title } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const id = Date.now().toString();
    const item = {
        id,
        url,
        title: title || 'Video',
        status: 'queued',
        progress: 0,
        addedAt: new Date().toISOString()
    };

    downloadQueue.push(item);
    console.log(`📋 Added to queue: ${url}`);

    // Start processing if not already
    if (!isProcessing) {
        processQueue();
    }

    res.json({ success: true, id, queuePosition: downloadQueue.length });
});

/**
 * Get queue status
 */
app.get('/queue/status', (req, res) => {
    res.json({
        currentDownload,
        queue: downloadQueue,
        isProcessing
    });
});

/**
 * Cancel a download
 */
app.delete('/queue/:id', (req, res) => {
    const id = req.params.id;
    const index = downloadQueue.findIndex(d => d.id === id);

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
async function processQueue() {
    if (isProcessing || downloadQueue.length === 0) return;

    isProcessing = true;

    while (downloadQueue.length > 0) {
        const item = downloadQueue[0];
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
            item.error = error.message;
            console.log(`❌ Failed: ${error.message}`);
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
function downloadVideo(item) {
    return new Promise((resolve, reject) => {
        const outputFile = path.join(DOWNLOAD_DIR, `video_${item.id}.mp4`);

        const args = [
            '--ffmpeg-location', __dirname,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4',
            '--newline',
            '-o', outputFile,
            item.url
        ];

        const process = spawn(YTDLP_PATH, args);

        process.stdout.on('data', (data) => {
            const line = data.toString();
            // Parse progress
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
                item.progress = parseFloat(match[1]);
            }
            // Get filename
            if (line.includes('Destination:') || line.includes('Merging')) {
                item.filename = `video_${item.id}.mp4`;
            }
        });

        process.stderr.on('data', (data) => {
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
// LEGACY DOWNLOAD (for compatibility)
// ============================================

app.post('/download', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const id = Date.now().toString();
    const item = {
        id,
        url,
        title: 'Video',
        status: 'downloading',
        progress: 0
    };

    currentDownload = item;

    console.log(`📥 Downloading: ${url}`);

    downloadVideo(item)
        .then(() => {
            currentDownload = null;
            res.json({
                success: true,
                filename: item.filename,
                url: `http://localhost:${PORT}/downloads/${item.filename}`,
                size: fs.statSync(path.join(DOWNLOAD_DIR, item.filename)).size
            });
        })
        .catch((error) => {
            currentDownload = null;
            res.status(500).json({ error: error.message });
        });
});

// ============================================
// CLIP CREATION
// ============================================

app.post('/clip', (req, res) => {
    const { startTime, endTime } = req.body;

    if (startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const duration = endTime - startTime;
    const timestamp = Date.now();
    const outputFile = path.join(DOWNLOAD_DIR, `clip_${timestamp}.mp4`);

    // Find video and audio files
    const files = fs.readdirSync(DOWNLOAD_DIR);
    const videoFiles = files.filter(f => f.endsWith('.mp4') && !f.startsWith('clip_')).sort().reverse();
    const audioFiles = files.filter(f => f.endsWith('.m4a')).sort().reverse();

    if (videoFiles.length === 0) {
        return res.status(404).json({ error: 'No video file found' });
    }

    const videoPath = path.join(DOWNLOAD_DIR, videoFiles[0]);
    console.log(`✂️ Creating clip: ${startTime}s to ${endTime}s`);

    let command;

    // Check if we have matching audio
    const videoPrefix = videoFiles[0].split('.')[0];
    const matchingAudio = audioFiles.find(a => a.startsWith(videoPrefix));

    if (matchingAudio) {
        const audioPath = path.join(DOWNLOAD_DIR, matchingAudio);
        command = `"${FFMPEG_PATH}" -ss ${startTime} -i "${videoPath}" -ss ${startTime} -i "${audioPath}" -t ${duration} -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest -y "${outputFile}"`;
    } else {
        command = `"${FFMPEG_PATH}" -ss ${startTime} -i "${videoPath}" -t ${duration} -c copy -y "${outputFile}"`;
    }

    exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: 'Clip creation failed', details: stderr?.slice(-300) });
        }

        if (fs.existsSync(outputFile)) {
            console.log(`✅ Clip created`);
            res.json({
                success: true,
                filename: `clip_${timestamp}.mp4`,
                url: `http://localhost:${PORT}/downloads/clip_${timestamp}.mp4`,
                size: fs.statSync(outputFile).size
            });
        } else {
            res.status(500).json({ error: 'Clip file not created' });
        }
    });
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        currentDownload,
        queueLength: downloadQueue.length
    });
});

app.get('/files', (req, res) => {
    const files = fs.readdirSync(DOWNLOAD_DIR).map(filename => ({
        filename,
        size: fs.statSync(path.join(DOWNLOAD_DIR, filename)).size,
        url: `http://localhost:${PORT}/downloads/${filename}`
    }));
    res.json({ files });
});

app.delete('/file/:filename', (req, res) => {
    const filePath = path.join(DOWNLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// ============================================
// GROQ WHISPER TRANSCRIPTION
// ============================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY not set in environment. Transcription will not work.');
    console.warn('   Set it in .env file: GROQ_API_KEY=your_api_key_here');
}

/**
 * Transcribe audio using Groq Whisper API
 */
app.post('/transcribe', async (req, res) => {
    const { videoFile, startTime, endTime } = req.body;

    try {
        // Find the video file
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const videoFiles = files.filter(f => f.endsWith('.mp4') && !f.startsWith('clip_')).sort().reverse();

        if (videoFiles.length === 0) {
            return res.status(404).json({ error: 'No video file found' });
        }

        const videoPath = path.join(DOWNLOAD_DIR, videoFiles[0]);
        const audioPath = path.join(DOWNLOAD_DIR, `temp_audio_${Date.now()}.mp3`);

        console.log('🎤 Extracting audio for transcription...');

        // Extract audio from video segment
        const duration = endTime - startTime;
        const extractCmd = `"${FFMPEG_PATH}" -ss ${startTime} -i "${videoPath}" -t ${duration} -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`;

        await new Promise((resolve, reject) => {
            exec(extractCmd, { maxBuffer: 1024 * 1024 * 50 }, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        console.log('📤 Sending to Groq Whisper API...');

        // Send to Groq API
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-large-v3');
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');

        const https = require('https');
        const response = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.groq.com',
                path: '/openai/v1/audio/transcriptions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    ...formData.getHeaders()
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(data));
                    }
                });
            });

            req.on('error', reject);
            formData.pipe(req);
        });

        // Clean up temp audio
        fs.unlinkSync(audioPath);

        // Format captions
        const captions = [];
        if (response.words) {
            let currentCaption = { text: '', words: [], startTime: 0, endTime: 0 };

            response.words.forEach((word, i) => {
                currentCaption.words.push({
                    text: word.word,
                    startTime: word.start,
                    endTime: word.end
                });
                currentCaption.text += (currentCaption.text ? ' ' : '') + word.word;

                if (i === 0) currentCaption.startTime = word.start;
                currentCaption.endTime = word.end;

                // Split into chunks of ~8 words
                if (currentCaption.words.length >= 8 || i === response.words.length - 1) {
                    captions.push({ ...currentCaption });
                    currentCaption = { text: '', words: [], startTime: 0, endTime: 0 };
                }
            });
        }

        console.log(`✅ Transcription complete: ${captions.length} caption segments`);

        res.json({
            success: true,
            text: response.text,
            captions: captions
        });

    } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`\n🎬 ClipCraft Download Server`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Queue: POST /queue/add`);
    console.log(`   Transcribe: POST /transcribe`);
    console.log(`\n   Ready!\n`);
});

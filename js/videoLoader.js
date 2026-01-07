/**
 * ClipCraft - Video Loader Module
 * Handles loading videos from files and URLs
 */

const VideoLoader = {
    videoElement: null,
    currentSource: null,
    sourceType: null, // 'file', 'youtube', 'twitch'

    /**
     * Initialize video loader
     */
    init(videoElement) {
        this.videoElement = videoElement;
    },

    /**
     * Load video from file
     */
    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('video/')) {
                reject(new Error('Invalid file type. Please select a video file.'));
                return;
            }

            const url = URL.createObjectURL(file);
            this.videoElement.src = url;
            this.currentSource = file;
            this.sourceType = 'file';

            this.videoElement.onloadedmetadata = () => {
                resolve({
                    duration: this.videoElement.duration,
                    width: this.videoElement.videoWidth,
                    height: this.videoElement.videoHeight,
                    name: file.name,
                    size: file.size
                });
            };

            this.videoElement.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video file.'));
            };
        });
    },

    /**
     * Load video from URL (YouTube/Twitch)
     * Uses local download server with yt-dlp
     */
    async loadFromUrl(url) {
        const youtubeId = Utils.extractYouTubeId(url);
        const twitchId = Utils.extractTwitchVodId(url);

        if (!youtubeId && !twitchId) {
            throw new Error('Invalid URL. Please enter a valid YouTube or Twitch VOD URL.');
        }

        // Try to download using local server
        try {
            return await this.downloadFromServer(url);
        } catch (error) {
            console.error('Server download failed:', error);
            throw new Error('Failed to download video. Make sure the download server is running (npm start).');
        }
    },

    /**
     * Download video using local yt-dlp server
     */
    async downloadFromServer(url) {
        const serverUrl = 'http://localhost:3000/download';

        Utils.showLoading('Downloading video with yt-dlp...');

        try {
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Download failed');
            }

            const result = await response.json();

            // Load the downloaded video
            const videoResponse = await fetch(result.url);
            const blob = await videoResponse.blob();
            const file = new File([blob], result.filename, { type: 'video/mp4' });

            return await this.loadFromFile(file);

        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Download server not running. Start it with: npm start');
            }
            throw error;
        }
    },

    /**
     * Load YouTube embed (fallback - deprecated)
     * Note: This is limited - recommend using download server
     */
    async loadYouTubeEmbed(videoId, originalUrl) {
        return new Promise((resolve, reject) => {
            // Create info message
            this.sourceType = 'youtube';
            this.currentSource = originalUrl;

            // For full functionality, we'll show a message about downloading
            // But also try to load via a proxy if available

            // Try direct video loading (may fail due to CORS)
            const proxyUrls = [
                `https://www.youtube.com/embed/${videoId}?enablejsapi=1`,
            ];

            // For now, show limitation message and suggest download
            Utils.showToast('YouTube videos work best when downloaded first. Use yt-dlp or similar tool.', 'warning');

            // We'll create a placeholder that shows the thumbnail
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

            resolve({
                duration: 0, // Unknown until loaded
                source: 'youtube',
                videoId: videoId,
                thumbnail: thumbnailUrl,
                limitation: true,
                message: 'For full features, download the video and upload it.',
                originalUrl: originalUrl
            });
        });
    },

    /**
     * Load Twitch VOD embed
     */
    async loadTwitchEmbed(vodId, originalUrl) {
        return new Promise((resolve) => {
            this.sourceType = 'twitch';
            this.currentSource = originalUrl;

            Utils.showToast('Twitch VODs work best when downloaded first. Use yt-dlp or similar tool.', 'warning');

            resolve({
                duration: 0,
                source: 'twitch',
                vodId: vodId,
                limitation: true,
                message: 'For full features, download the video and upload it.',
                originalUrl: originalUrl
            });
        });
    },

    /**
     * Get current video duration
     */
    getDuration() {
        return this.videoElement?.duration || 0;
    },

    /**
     * Get current time
     */
    getCurrentTime() {
        return this.videoElement?.currentTime || 0;
    },

    /**
     * Set current time
     */
    setCurrentTime(time) {
        if (this.videoElement) {
            this.videoElement.currentTime = Utils.clamp(time, 0, this.getDuration());
        }
    },

    /**
     * Play video
     */
    play() {
        return this.videoElement?.play();
    },

    /**
     * Pause video
     */
    pause() {
        this.videoElement?.pause();
    },

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (this.videoElement?.paused) {
            return this.play();
        } else {
            this.pause();
        }
    },

    /**
     * Check if video is loaded
     */
    isLoaded() {
        return this.videoElement?.readyState >= 2;
    },

    /**
     * Get video element for direct access
     */
    getElement() {
        return this.videoElement;
    },

    /**
     * Extract a clip from the video using server-side FFmpeg
     * This properly preserves audio!
     */
    async extractClip(startTime, endTime, includeCaptions = false, captions = []) {
        // Use server-side FFmpeg for proper audio extraction
        const serverUrl = 'http://localhost:3000/clip';

        try {
            console.log(`Requesting clip from ${startTime}s to ${endTime}s via server`);

            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sourceFile: 'auto', // Server will find the latest video
                    startTime: startTime,
                    endTime: endTime
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Clip creation failed');
            }

            const result = await response.json();
            console.log('Clip created:', result);

            // Fetch the clip file as blob
            const clipResponse = await fetch(result.url);
            const blob = await clipResponse.blob();

            return blob;

        } catch (error) {
            console.error('Server clip extraction failed:', error);

            // Fallback to browser-based extraction (no audio)
            console.log('Falling back to browser extraction (no audio)');
            return this.extractClipBrowser(startTime, endTime);
        }
    },

    /**
     * Browser-based clip extraction (fallback, no audio)
     */
    async extractClipBrowser(startTime, endTime) {
        return new Promise((resolve, reject) => {
            if (!this.videoElement || !this.isLoaded()) {
                reject(new Error('No video loaded'));
                return;
            }

            const stream = this.videoElement.captureStream();

            let mimeType = 'video/webm';
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 8000000
            });

            const chunks = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                resolve(blob);
            };

            this.videoElement.currentTime = startTime;
            this.videoElement.muted = false;

            this.videoElement.onseeked = () => {
                mediaRecorder.start(100);
                this.videoElement.play();

                const checkTime = setInterval(() => {
                    if (this.videoElement.currentTime >= endTime) {
                        clearInterval(checkTime);
                        mediaRecorder.stop();
                        this.videoElement.pause();
                    }
                }, 100);
            };
        });
    },

    /**
     * Draw captions on canvas
     */
    drawCaptions(ctx, captions, currentTime, width, height) {
        const activeCaption = captions.find(c =>
            currentTime >= c.startTime && currentTime <= c.endTime
        );

        if (!activeCaption) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const words = activeCaption.words || [{ text: activeCaption.text, startTime: activeCaption.startTime }];
        const y = height * 0.85;

        let totalWidth = 0;
        const fontSize = 72;
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;

        words.forEach(word => {
            totalWidth += ctx.measureText(word.text + ' ').width;
        });

        let x = (width - totalWidth) / 2;

        words.forEach(word => {
            const isActive = currentTime >= word.startTime && currentTime < (word.endTime || word.startTime + 0.5);

            // Shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            if (isActive) {
                // Active word - highlighted
                ctx.fillStyle = '#3b82f6';
                ctx.font = `bold ${fontSize * 1.1}px Inter, sans-serif`;
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            }

            const wordWidth = ctx.measureText(word.text + ' ').width;
            ctx.fillText(word.text, x + wordWidth / 2, y);
            x += wordWidth;
        });

        ctx.restore();
    },

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.sourceType === 'file' && this.videoElement?.src) {
            URL.revokeObjectURL(this.videoElement.src);
        }
        this.videoElement.src = '';
        this.currentSource = null;
        this.sourceType = null;
    }
};

// Export for use in other modules
window.VideoLoader = VideoLoader;

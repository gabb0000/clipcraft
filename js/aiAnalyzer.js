/**
 * ClipCraft - AI Analyzer Module
 * Analyzes audio to detect highlight moments for clipping
 */

const AIAnalyzer = {
    audioContext: null,
    audioBuffer: null,
    analysisData: null,

    /**
     * Initialize audio context
     */
    init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    },

    /**
     * Analyze video audio for highlight moments
     */
    async analyzeVideo(videoElement, clipDuration = 30) {
        Utils.showLoading('Analyzing audio for highlights...');

        try {
            // Get audio data from video
            const audioData = await this.extractAudioData(videoElement);

            // Analyze for peaks and patterns
            const highlights = this.findHighlights(audioData, videoElement.duration, clipDuration);

            Utils.hideLoading();
            return highlights;
        } catch (error) {
            Utils.hideLoading();
            console.error('Analysis error:', error);

            // Fallback: return evenly distributed suggestions
            return this.generateFallbackSuggestions(videoElement.duration, clipDuration);
        }
    },

    /**
     * Extract audio data from video element
     */
    async extractAudioData(videoElement) {
        return new Promise((resolve, reject) => {
            // Create a media element source
            const source = this.audioContext.createMediaElementSource(videoElement);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;

            source.connect(analyser);
            analyser.connect(this.audioContext.destination);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const samples = [];
            const sampleRate = 10; // samples per second
            const duration = videoElement.duration;

            let currentTime = 0;
            const interval = 1000 / sampleRate;

            const collectSample = () => {
                if (currentTime >= duration) {
                    resolve({
                        samples,
                        duration,
                        sampleRate
                    });
                    return;
                }

                analyser.getByteFrequencyData(dataArray);

                // Calculate average energy
                const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

                // Calculate bass energy (lower frequencies)
                const bassSum = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;

                // Calculate high frequency energy
                const highSum = dataArray.slice(-20).reduce((a, b) => a + b, 0) / 20;

                samples.push({
                    time: currentTime,
                    energy: avg,
                    bass: bassSum,
                    high: highSum
                });

                currentTime += 1 / sampleRate;
                setTimeout(collectSample, interval);
            };

            videoElement.currentTime = 0;
            videoElement.play().then(() => {
                collectSample();
            }).catch(reject);
        });
    },

    /**
     * Find highlight moments based on audio analysis
     */
    findHighlights(audioData, totalDuration, clipDuration) {
        const { samples } = audioData;
        if (!samples || samples.length === 0) {
            return this.generateFallbackSuggestions(totalDuration, clipDuration);
        }

        // Calculate statistics
        const energies = samples.map(s => s.energy);
        const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
        const maxEnergy = Math.max(...energies);
        const threshold = avgEnergy + (maxEnergy - avgEnergy) * 0.3;

        // Find peaks (moments above threshold)
        const peaks = [];
        for (let i = 1; i < samples.length - 1; i++) {
            const sample = samples[i];
            const prev = samples[i - 1];
            const next = samples[i + 1];

            // Local maximum and above threshold
            if (sample.energy > prev.energy &&
                sample.energy > next.energy &&
                sample.energy > threshold) {
                peaks.push({
                    time: sample.time,
                    score: sample.energy / maxEnergy,
                    energy: sample.energy
                });
            }
        }

        // Sort by score and filter to non-overlapping clips
        peaks.sort((a, b) => b.score - a.score);

        const highlights = [];
        const minGap = clipDuration * 1.5; // Minimum gap between suggestions

        for (const peak of peaks) {
            // Check if this peak overlaps with existing highlights
            const overlaps = highlights.some(h =>
                Math.abs(h.startTime - (peak.time - clipDuration / 2)) < minGap
            );

            if (!overlaps && highlights.length < 5) {
                const startTime = Math.max(0, peak.time - clipDuration / 2);
                const endTime = Math.min(totalDuration, startTime + clipDuration);

                highlights.push({
                    startTime,
                    endTime,
                    duration: endTime - startTime,
                    score: Math.round(peak.score * 100),
                    reason: this.getHighlightReason(peak)
                });
            }
        }

        // Sort by time
        highlights.sort((a, b) => a.startTime - b.startTime);

        // If no highlights found, return fallback
        if (highlights.length === 0) {
            return this.generateFallbackSuggestions(totalDuration, clipDuration);
        }

        return highlights;
    },

    /**
     * Get reason for why this moment is a highlight
     */
    getHighlightReason(peak) {
        if (peak.score > 0.8) return 'Peak energy moment';
        if (peak.score > 0.6) return 'High activity';
        if (peak.score > 0.4) return 'Interesting moment';
        return 'Potential clip';
    },

    /**
     * Generate fallback suggestions when audio analysis fails
     */
    generateFallbackSuggestions(totalDuration, clipDuration) {
        const suggestions = [];
        const numSuggestions = Math.min(5, Math.floor(totalDuration / clipDuration));

        // Evenly distribute suggestions
        for (let i = 0; i < numSuggestions; i++) {
            const startTime = (totalDuration / (numSuggestions + 1)) * (i + 1) - clipDuration / 2;
            const endTime = startTime + clipDuration;

            suggestions.push({
                startTime: Math.max(0, startTime),
                endTime: Math.min(totalDuration, endTime),
                duration: clipDuration,
                score: 50 + Math.random() * 30, // Random score for demo
                reason: 'Auto-distributed clip'
            });
        }

        return suggestions;
    },

    /**
     * Analyze video using simpler volume-based method
     * This works without Web Audio API source connection issues
     * OPTIMIZED: Limits samples to max 60 for fast analysis
     */
    async analyzeVideoSimple(videoElement, clipDuration = 30) {
        Utils.showLoading('Analyzing video for highlights...');

        try {
            const totalDuration = videoElement.duration;
            const samples = [];

            // OPTIMIZED: Max 60 samples total, minimum 3 seconds apart
            const maxSamples = 60;
            const sampleInterval = Math.max(3, totalDuration / maxSamples);

            console.log(`Analyzing ${totalDuration}s video with ${Math.ceil(totalDuration / sampleInterval)} samples`);

            // Store original video state
            const originalTime = videoElement.currentTime;
            const wasMuted = videoElement.muted;
            const wasPlaying = !videoElement.paused;

            if (wasPlaying) videoElement.pause();
            videoElement.muted = true;

            // Sample brightness/motion at different points
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');

            for (let time = 0; time < totalDuration; time += sampleInterval) {
                await this.seekAndCapture(videoElement, time, ctx, canvas, samples);
            }

            // Restore video state
            videoElement.currentTime = originalTime;
            videoElement.muted = wasMuted;
            if (wasPlaying) videoElement.play();

            // Analyze samples for highlights
            const highlights = this.findVisualHighlights(samples, totalDuration, clipDuration);

            Utils.hideLoading();
            return highlights;
        } catch (error) {
            Utils.hideLoading();
            console.error('Simple analysis error:', error);
            return this.generateFallbackSuggestions(videoElement.duration, clipDuration);
        }
    },

    /**
     * Seek to time and capture frame data
     */
    async seekAndCapture(video, time, ctx, canvas, samples) {
        return new Promise((resolve) => {
            video.currentTime = time;
            video.onseeked = () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Calculate average brightness
                let brightness = 0;
                let motion = 0;

                for (let i = 0; i < data.length; i += 4) {
                    brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
                }
                brightness /= (data.length / 4);

                // Calculate motion by comparing to previous sample
                if (samples.length > 0) {
                    const prevBrightness = samples[samples.length - 1].brightness;
                    motion = Math.abs(brightness - prevBrightness);
                }

                samples.push({
                    time,
                    brightness,
                    motion
                });

                resolve();
            };
        });
    },

    /**
     * Find highlights based on visual analysis
     * IMPROVED: Always returns 5 clips, uses motion as bonus scoring
     */
    findVisualHighlights(samples, totalDuration, clipDuration) {
        // Always generate 5 evenly distributed clips
        const numClips = 5;
        const highlights = [];

        // Calculate motion scores for bonus points
        const motions = samples.map(s => s.motion || 0);
        const maxMotion = Math.max(...motions, 1);

        // Create 5 evenly spaced clips
        for (let i = 0; i < numClips; i++) {
            // Distribute clips evenly across the video
            const centerTime = (totalDuration / (numClips + 1)) * (i + 1);
            const startTime = Math.max(0, centerTime - clipDuration / 2);
            const endTime = Math.min(totalDuration, startTime + clipDuration);

            // Find motion score near this time
            let motionScore = 50; // Base score
            const nearbysamples = samples.filter(s =>
                Math.abs(s.time - centerTime) < clipDuration
            );

            if (nearbysamples.length > 0) {
                const avgMotion = nearbysamples.reduce((a, b) => a + (b.motion || 0), 0) / nearbysamples.length;
                motionScore = 50 + Math.round((avgMotion / maxMotion) * 50);
            }

            highlights.push({
                startTime,
                endTime,
                duration: endTime - startTime,
                score: motionScore,
                reason: motionScore > 70 ? 'High activity moment' : 'Potential highlight'
            });
        }

        // Sort by score (best first) then by time
        highlights.sort((a, b) => b.score - a.score);

        return highlights;
    }
};

// Export for use in other modules
window.AIAnalyzer = AIAnalyzer;

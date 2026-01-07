/**
 * ClipCraft - Caption Engine Module
 * Handles speech-to-text and TikTok-style caption generation
 */

const CaptionEngine = {
    recognition: null,
    isSupported: false,
    captions: [],
    isRecording: false,

    /**
     * Initialize speech recognition
     */
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            this.isSupported = true;
        } else {
            console.warn('Speech recognition not supported in this browser');
            this.isSupported = false;
        }
    },

    /**
     * Generate captions using server-side Groq Whisper API
     */
    async generateCaptions(videoElement, startTime, endTime) {
        Utils.showLoading('Generating captions with AI...');

        try {
            // Call server-side transcription
            const response = await fetch('http://localhost:3000/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    startTime: startTime,
                    endTime: endTime
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Transcription failed');
            }

            const result = await response.json();
            this.captions = result.captions || [];

            Utils.hideLoading();
            return this.captions;

        } catch (error) {
            console.error('Transcription error:', error);
            Utils.hideLoading();

            // Fallback to mock captions
            Utils.showToast('Using demo captions (transcription failed)', 'warning');
            return this.generateMockCaptions(endTime - startTime);
        }
    },

    /**
     * Parse words from transcript with timing
     */
    parseWords(transcript, startTime, endTime) {
        const words = transcript.split(/\s+/);
        const duration = endTime - startTime;
        const wordDuration = duration / words.length;

        return words.map((word, index) => ({
            text: word,
            startTime: startTime + (index * wordDuration),
            endTime: startTime + ((index + 1) * wordDuration)
        }));
    },

    /**
     * Post-process captions to improve quality
     */
    postProcessCaptions(captions) {
        // Merge very short captions
        const merged = [];
        let current = null;

        for (const caption of captions) {
            if (!current) {
                current = { ...caption };
            } else if (caption.startTime - current.endTime < 0.3) {
                // Merge with previous
                current.text += ' ' + caption.text;
                current.endTime = caption.endTime;
                current.words = [...current.words, ...caption.words];
            } else {
                merged.push(current);
                current = { ...caption };
            }
        }

        if (current) merged.push(current);

        // Limit words per caption for better display
        const processed = [];
        for (const caption of merged) {
            const words = caption.words;
            const maxWordsPerCaption = 8;

            for (let i = 0; i < words.length; i += maxWordsPerCaption) {
                const chunk = words.slice(i, i + maxWordsPerCaption);
                processed.push({
                    text: chunk.map(w => w.text).join(' '),
                    startTime: chunk[0].startTime,
                    endTime: chunk[chunk.length - 1].endTime,
                    words: chunk
                });
            }
        }

        return processed;
    },

    /**
     * Stop recording
     */
    stopRecording() {
        this.isRecording = false;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped
            }
        }
    },

    /**
     * Render TikTok-style captions - shows 2-4 words at a time
     */
    renderCaptions(overlayElement, captions, currentTime) {
        // Find all words across all captions with their timing
        const allWords = [];
        captions.forEach(caption => {
            if (caption.words) {
                caption.words.forEach(word => {
                    allWords.push(word);
                });
            }
        });

        if (allWords.length === 0) {
            overlayElement.innerHTML = '';
            return;
        }

        // Find current word index
        let currentIndex = allWords.findIndex(w =>
            currentTime >= w.startTime && currentTime < w.endTime
        );

        if (currentIndex === -1) {
            // Check if we're past all words
            const lastWord = allWords[allWords.length - 1];
            if (currentTime >= lastWord.endTime) {
                overlayElement.innerHTML = '';
            }
            return;
        }

        // Show 3 words at a time, centered on current
        const wordsToShow = 3;
        const start = Math.max(0, currentIndex - 1);
        const end = Math.min(allWords.length, start + wordsToShow);

        const visibleWords = allWords.slice(start, end);

        // Render visible words
        const wordsHtml = visibleWords.map(word => {
            const isActive = currentTime >= word.startTime && currentTime < word.endTime;
            return `<span class="caption-word ${isActive ? 'active' : ''}">${word.text}</span>`;
        }).join(' ');

        overlayElement.innerHTML = wordsHtml;
    },

    /**
     * Generate mock captions for demo purposes
     */
    generateMockCaptions(duration) {
        const samplePhrases = [
            "This is an amazing moment",
            "Check this out",
            "Wait for it",
            "Here we go",
            "That was incredible",
            "No way this just happened",
            "This is the best part",
            "You won't believe this"
        ];

        const captions = [];
        let time = 0;
        const phraseInterval = 3; // seconds per phrase

        while (time < duration) {
            const phrase = samplePhrases[Math.floor(Math.random() * samplePhrases.length)];
            const words = phrase.split(' ');
            const phraseDuration = Math.min(phraseInterval, duration - time);
            const wordDuration = phraseDuration / words.length;

            captions.push({
                text: phrase,
                startTime: time,
                endTime: time + phraseDuration,
                words: words.map((word, i) => ({
                    text: word,
                    startTime: time + (i * wordDuration),
                    endTime: time + ((i + 1) * wordDuration)
                }))
            });

            time += phraseInterval + 0.5; // Gap between phrases
        }

        return captions;
    },

    /**
     * Get saved captions
     */
    getCaptions() {
        return this.captions;
    },

    /**
     * Set captions manually
     */
    setCaptions(captions) {
        this.captions = captions;
    },

    /**
     * Clear captions
     */
    clearCaptions() {
        this.captions = [];
    },

    /**
     * Export captions as SRT format
     */
    exportAsSRT(captions) {
        let srt = '';
        captions.forEach((caption, index) => {
            const startTime = this.formatSRTTime(caption.startTime);
            const endTime = this.formatSRTTime(caption.endTime);

            srt += `${index + 1}\n`;
            srt += `${startTime} --> ${endTime}\n`;
            srt += `${caption.text}\n\n`;
        });
        return srt;
    },

    /**
     * Format time for SRT (HH:MM:SS,mmm)
     */
    formatSRTTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }
};

// Export for use in other modules
window.CaptionEngine = CaptionEngine;

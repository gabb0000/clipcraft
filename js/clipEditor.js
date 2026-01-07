/**
 * ClipCraft - Clip Editor Module
 * Handles timeline, waveform, and clip range selection
 */

const ClipEditor = {
    videoElement: null,
    waveformCanvas: null,
    waveformCtx: null,
    clipRange: null,
    playhead: null,

    // State
    duration: 0,
    clipStart: 0,
    clipEnd: 30,
    clipDuration: 30,
    isDragging: false,
    dragTarget: null,
    suggestions: [],

    /**
     * Initialize clip editor
     */
    init(videoElement, waveformCanvas, clipRange, playhead) {
        this.videoElement = videoElement;
        this.waveformCanvas = waveformCanvas;
        this.waveformCtx = waveformCanvas.getContext('2d');
        this.clipRange = clipRange;
        this.playhead = playhead;

        this.setupEventListeners();
        this.resizeCanvas();

        // Handle window resize
        window.addEventListener('resize', Utils.debounce(() => this.resizeCanvas(), 200));
    },

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Video time update
        this.videoElement.addEventListener('timeupdate', () => this.updatePlayhead());
        this.videoElement.addEventListener('loadedmetadata', () => this.onVideoLoaded());

        // Waveform click to seek
        this.waveformCanvas.addEventListener('click', (e) => this.onWaveformClick(e));

        // Range handle dragging
        const startHandle = document.getElementById('rangeStart');
        const endHandle = document.getElementById('rangeEnd');

        startHandle.addEventListener('mousedown', (e) => this.startDrag(e, 'start'));
        endHandle.addEventListener('mousedown', (e) => this.startDrag(e, 'end'));
        this.clipRange.addEventListener('mousedown', (e) => {
            if (e.target === this.clipRange) this.startDrag(e, 'range');
        });

        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // Touch support
        startHandle.addEventListener('touchstart', (e) => this.startDrag(e, 'start'));
        endHandle.addEventListener('touchstart', (e) => this.startDrag(e, 'end'));
        document.addEventListener('touchmove', (e) => this.onDrag(e));
        document.addEventListener('touchend', () => this.endDrag());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeydown(e));
    },

    /**
     * Resize canvas to container
     */
    resizeCanvas() {
        const container = this.waveformCanvas.parentElement;
        const rect = container.getBoundingClientRect();

        this.waveformCanvas.width = rect.width;
        this.waveformCanvas.height = rect.height;

        this.drawWaveform();
        this.updateClipRangeUI();
    },

    /**
     * Called when video metadata is loaded
     */
    onVideoLoaded() {
        this.duration = this.videoElement.duration;
        this.clipStart = 0;
        this.clipEnd = Math.min(this.clipDuration, this.duration);

        this.drawWaveform();
        this.updateClipRangeUI();
    },

    /**
     * Draw waveform visualization
     */
    async drawWaveform() {
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;

        // Clear canvas
        ctx.fillStyle = '#242424';
        ctx.fillRect(0, 0, width, height);

        if (!this.videoElement || this.duration === 0) return;

        // Generate fake waveform data based on video frames
        // (Real waveform would require audio decoding)
        const bars = Math.floor(width / 4);
        const barWidth = 2;
        const gap = 2;

        ctx.fillStyle = '#3b82f6';

        for (let i = 0; i < bars; i++) {
            // Generate pseudo-random heights for visual effect
            const seed = (i * 1234567) % 100;
            const baseHeight = 20 + (seed / 100) * (height - 40);
            const variation = Math.sin(i * 0.1) * 10 + Math.cos(i * 0.05) * 15;
            const barHeight = Math.max(10, baseHeight + variation);

            const x = i * (barWidth + gap);
            const y = (height - barHeight) / 2;

            // Color gradient based on position
            const progress = i / bars;
            const inClip = progress >= (this.clipStart / this.duration) &&
                progress <= (this.clipEnd / this.duration);

            ctx.fillStyle = inClip ? '#60a5fa' : '#404040';
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    },

    /**
     * Update playhead position
     */
    updatePlayhead() {
        if (this.duration === 0) return;

        const progress = this.videoElement.currentTime / this.duration;
        const containerWidth = this.waveformCanvas.parentElement.offsetWidth;

        this.playhead.style.left = `${progress * containerWidth}px`;
    },

    /**
     * Update clip range UI position
     */
    updateClipRangeUI() {
        if (this.duration === 0) return;

        const containerWidth = this.waveformCanvas.parentElement.offsetWidth;
        const startPercent = this.clipStart / this.duration;
        const endPercent = this.clipEnd / this.duration;

        this.clipRange.style.left = `${startPercent * containerWidth}px`;
        this.clipRange.style.width = `${(endPercent - startPercent) * containerWidth}px`;

        // Redraw waveform to update highlight
        this.drawWaveform();
    },

    /**
     * Handle waveform click to seek
     */
    onWaveformClick(e) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progress = x / rect.width;

        const newTime = progress * this.duration;
        this.videoElement.currentTime = Utils.clamp(newTime, 0, this.duration);
    },

    /**
     * Start dragging a handle or range
     */
    startDrag(e, target) {
        e.preventDefault();
        this.isDragging = true;
        this.dragTarget = target;
        this.dragStartX = e.clientX || e.touches?.[0]?.clientX;
        this.dragStartClipStart = this.clipStart;
        this.dragStartClipEnd = this.clipEnd;
    },

    /**
     * Handle drag movement
     */
    onDrag(e) {
        if (!this.isDragging) return;

        const currentX = e.clientX || e.touches?.[0]?.clientX;
        const containerWidth = this.waveformCanvas.parentElement.offsetWidth;
        const deltaX = currentX - this.dragStartX;
        const deltaTime = (deltaX / containerWidth) * this.duration;

        switch (this.dragTarget) {
            case 'start':
                this.clipStart = Utils.clamp(
                    this.dragStartClipStart + deltaTime,
                    0,
                    this.clipEnd - 5 // Minimum 5 seconds
                );
                break;

            case 'end':
                this.clipEnd = Utils.clamp(
                    this.dragStartClipEnd + deltaTime,
                    this.clipStart + 5, // Minimum 5 seconds
                    this.duration
                );
                break;

            case 'range':
                const rangeDuration = this.dragStartClipEnd - this.dragStartClipStart;
                let newStart = this.dragStartClipStart + deltaTime;
                let newEnd = this.dragStartClipEnd + deltaTime;

                if (newStart < 0) {
                    newStart = 0;
                    newEnd = rangeDuration;
                }
                if (newEnd > this.duration) {
                    newEnd = this.duration;
                    newStart = this.duration - rangeDuration;
                }

                this.clipStart = newStart;
                this.clipEnd = newEnd;
                break;
        }

        this.updateClipRangeUI();
    },

    /**
     * End drag operation
     */
    endDrag() {
        this.isDragging = false;
        this.dragTarget = null;
    },

    /**
     * Handle keyboard shortcuts
     */
    onKeydown(e) {
        // Only handle when not typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                VideoLoader.togglePlay();
                break;
            case 'j':
                // Seek backward 5 seconds
                this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 5);
                break;
            case 'l':
                // Seek forward 5 seconds
                this.videoElement.currentTime = Math.min(this.duration, this.videoElement.currentTime + 5);
                break;
            case 'k':
                VideoLoader.togglePlay();
                break;
            case 'i':
                // Set in point
                this.setInPoint(this.videoElement.currentTime);
                break;
            case 'o':
                // Set out point
                this.setOutPoint(this.videoElement.currentTime);
                break;
            case 'arrowleft':
                this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 1);
                break;
            case 'arrowright':
                this.videoElement.currentTime = Math.min(this.duration, this.videoElement.currentTime + 1);
                break;
        }
    },

    /**
     * Set clip in point
     */
    setInPoint(time) {
        this.clipStart = Utils.clamp(time, 0, this.clipEnd - 5);
        this.updateClipRangeUI();
        Utils.showToast(`In point set: ${Utils.formatTime(this.clipStart)}`, 'success');
    },

    /**
     * Set clip out point
     */
    setOutPoint(time) {
        this.clipEnd = Utils.clamp(time, this.clipStart + 5, this.duration);
        this.updateClipRangeUI();
        Utils.showToast(`Out point set: ${Utils.formatTime(this.clipEnd)}`, 'success');
    },

    /**
     * Set clip duration and update end point
     */
    setClipDuration(duration) {
        this.clipDuration = duration;
        this.clipEnd = Math.min(this.clipStart + duration, this.duration);
        this.updateClipRangeUI();
    },

    /**
     * Set clip range from suggestion
     */
    setFromSuggestion(suggestion) {
        this.clipStart = suggestion.startTime;
        this.clipEnd = suggestion.endTime;
        this.videoElement.currentTime = suggestion.startTime;
        this.updateClipRangeUI();
        Utils.showToast(`Clip range set: ${Utils.formatTime(this.clipStart)} - ${Utils.formatTime(this.clipEnd)}`, 'success');
    },

    /**
     * Display AI suggestions on timeline
     */
    displaySuggestions(suggestions) {
        this.suggestions = suggestions;
        const container = document.getElementById('aiMarkers');
        container.innerHTML = '';

        suggestions.forEach((suggestion, index) => {
            const marker = document.createElement('div');
            marker.className = 'ai-marker';
            marker.title = `${suggestion.reason} (${suggestion.score}%)`;

            const position = (suggestion.startTime / this.duration) * 100;
            marker.style.left = `${position}%`;

            marker.addEventListener('click', () => {
                this.setFromSuggestion(suggestion);
            });

            container.appendChild(marker);
        });
    },

    /**
     * Get current clip range
     */
    getClipRange() {
        return {
            start: this.clipStart,
            end: this.clipEnd,
            duration: this.clipEnd - this.clipStart
        };
    },

    /**
     * Preview clip in the video player
     */
    previewClip() {
        this.videoElement.currentTime = this.clipStart;
        this.videoElement.play();

        const checkEnd = setInterval(() => {
            if (this.videoElement.currentTime >= this.clipEnd) {
                this.videoElement.pause();
                clearInterval(checkEnd);
            }
        }, 100);
    },

    /**
     * Reset editor state
     */
    reset() {
        this.clipStart = 0;
        this.clipEnd = this.clipDuration;
        this.suggestions = [];
        document.getElementById('aiMarkers').innerHTML = '';
        this.updateClipRangeUI();
    }
};

// Export for use in other modules
window.ClipEditor = ClipEditor;

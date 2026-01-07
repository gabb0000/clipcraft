/**
 * ClipCraft - Clip Storage Module
 * Handles saving and loading clips using IndexedDB
 */

const ClipStorage = {
    dbName: 'ClipCraftDB',
    dbVersion: 1,
    storeName: 'clips',
    db: null,

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('title', 'title', { unique: false });
                }
            };
        });
    },

    /**
     * Save a clip
     */
    async saveClip(clipData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const clip = {
                id: Utils.generateId(),
                title: clipData.title || `Clip ${new Date().toLocaleTimeString()}`,
                videoBlob: clipData.videoBlob,
                thumbnail: clipData.thumbnail,
                duration: clipData.duration,
                startTime: clipData.startTime,
                endTime: clipData.endTime,
                captions: clipData.captions || [],
                sourceUrl: clipData.sourceUrl || null,
                createdAt: new Date().toISOString()
            };

            const request = store.add(clip);

            request.onsuccess = () => resolve(clip);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get all clips
     */
    async getAllClips() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('createdAt');
            const request = index.openCursor(null, 'prev');

            const clips = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    clips.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(clips);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a single clip by ID
     */
    async getClip(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Delete a clip
     */
    async deleteClip(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Update a clip
     */
    async updateClip(id, updates) {
        const clip = await this.getClip(id);
        if (!clip) throw new Error('Clip not found');

        const updatedClip = { ...clip, ...updates };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(updatedClip);

            request.onsuccess = () => resolve(updatedClip);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get clip count
     */
    async getClipCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Export clip as downloadable file
     */
    async exportClip(id) {
        const clip = await this.getClip(id);
        if (!clip || !clip.videoBlob) {
            throw new Error('Clip not found or no video data');
        }

        const url = URL.createObjectURL(clip.videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${clip.title.replace(/[^a-z0-9]/gi, '_')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Clear all clips
     */
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// Export for use in other modules
window.ClipStorage = ClipStorage;

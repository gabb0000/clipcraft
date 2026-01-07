/**
 * ClipCraft - Clip Storage Module
 * Handles saving and loading clips using IndexedDB
 */

import type { ClipData, SavedClip } from '@types/index';
import { Utils } from './utils';

export class ClipStorage {
  private dbName = 'ClipCraftDB';
  private dbVersion = 1;
  private storeName = 'clips';
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('title', 'title', { unique: false });
        }
      };
    });
  }

  /**
   * Save a clip
   */
  async saveClip(clipData: ClipData): Promise<SavedClip> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const clip: SavedClip = {
        id: Utils.generateId(),
        title: clipData.title || `Clip ${new Date().toLocaleTimeString()}`,
        videoBlob: clipData.videoBlob,
        thumbnail: clipData.thumbnail || '',
        duration: clipData.duration,
        startTime: clipData.startTime,
        endTime: clipData.endTime,
        captions: clipData.captions || [],
        sourceUrl: clipData.sourceUrl || null,
        createdAt: new Date().toISOString(),
      };

      const request = store.add(clip);

      request.onsuccess = () => resolve(clip);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all clips with pagination
   */
  async getAllClips(limit = 100, offset = 0): Promise<SavedClip[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'prev');

      const clips: SavedClip[] = [];
      let count = 0;
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }

          if (count < limit) {
            clips.push(cursor.value as SavedClip);
            count++;
            cursor.continue();
          } else {
            resolve(clips);
          }
        } else {
          resolve(clips);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a single clip by ID
   */
  async getClip(id: string): Promise<SavedClip | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result as SavedClip | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a clip
   */
  async deleteClip(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update a clip
   */
  async updateClip(id: string, updates: Partial<ClipData>): Promise<SavedClip> {
    const clip = await this.getClip(id);
    if (!clip) throw new Error('Clip not found');

    const updatedClip = { ...clip, ...updates };

    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(updatedClip);

      request.onsuccess = () => resolve(updatedClip);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get clip count
   */
  async getClipCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export clip as downloadable file
   */
  async exportClip(id: string): Promise<void> {
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
  }

  /**
   * Clear all clips
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Stream large video blob (for performance optimization)
   */
  async getClipBlob(id: string): Promise<Blob | null> {
    const clip = await this.getClip(id);
    return clip?.videoBlob || null;
  }

  /**
   * Search clips by title
   */
  async searchClips(query: string): Promise<SavedClip[]> {
    const allClips = await this.getAllClips();
    const lowerQuery = query.toLowerCase();
    return allClips.filter((clip) => clip.title.toLowerCase().includes(lowerQuery));
  }

  /**
   * Get clips within date range
   */
  async getClipsByDateRange(startDate: Date, endDate: Date): Promise<SavedClip[]> {
    const allClips = await this.getAllClips();
    return allClips.filter((clip) => {
      const clipDate = new Date(clip.createdAt);
      return clipDate >= startDate && clipDate <= endDate;
    });
  }
}

// Create singleton instance
export const clipStorage = new ClipStorage();

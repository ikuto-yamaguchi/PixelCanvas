// IndexedDB管理
/**
 * IndexedDB管理クラス
 * 大量データの永続化を担当
 */
export class IndexedDBManager {
    constructor(storageCore) {
        this.core = storageCore;
        this.indexedDBName = 'PixelCanvasDB';
        this.indexedDBVersion = 1;
        this.db = null;
        this.isAvailable = false;
    }
    
    /**
     * IndexedDB初期化
     */
    async initialize() {
        if (!this.core.useIndexedDB) {
            return false;
        }
        
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.indexedDBName, this.indexedDBVersion);
            
            request.onerror = () => {
                console.warn('💿 IndexedDB not available, falling back to localStorage');
                this.isAvailable = false;
                this.core.useIndexedDB = false;
                resolve(false);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isAvailable = true;
                console.log('💿 IndexedDB initialized');
                resolve(true);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.setupObjectStores(db);
            };
        });
    }
    
    /**
     * オブジェクトストア設定
     */
    setupObjectStores(db) {
        // ピクセルデータストア
        if (!db.objectStoreNames.contains('pixels')) {
            const pixelStore = db.createObjectStore('pixels', { keyPath: 'key' });
            pixelStore.createIndex('sectorIndex', 'sector', { unique: false });
            pixelStore.createIndex('timestampIndex', 'timestamp', { unique: false });
        }
        
        // 設定ストア
        if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        // キャッシュストア
        if (!db.objectStoreNames.contains('cache')) {
            const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
            cacheStore.createIndex('timestampIndex', 'timestamp', { unique: false });
            cacheStore.createIndex('expiryIndex', 'expiry', { unique: false });
        }
        
        // セクターストア
        if (!db.objectStoreNames.contains('sectors')) {
            const sectorStore = db.createObjectStore('sectors', { keyPath: 'key' });
            sectorStore.createIndex('coordinateIndex', ['sectorX', 'sectorY'], { unique: true });
        }
    }
    
    /**
     * データ保存
     */
    async setItem(key, value, storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const data = {
                key,
                value: this.core.compressData(value),
                timestamp: Date.now(),
                expiry: Date.now() + (24 * 60 * 60 * 1000) // 24時間後
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * データ取得
     */
    async getItem(key, storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // 有効期限チェック
                    if (result.expiry && Date.now() > result.expiry) {
                        this.removeItem(key, storeName);
                        resolve(null);
                    } else {
                        resolve(result.value);
                    }
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * データ削除
     */
    async removeItem(key, storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            return false;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 複数データ保存
     */
    async setMultipleItems(items, storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const promises = items.map(({ key, value }) => {
                return new Promise((itemResolve, itemReject) => {
                    const data = {
                        key,
                        value: this.core.compressData(value),
                        timestamp: Date.now(),
                        expiry: Date.now() + (24 * 60 * 60 * 1000)
                    };
                    
                    const request = store.put(data);
                    request.onsuccess = () => itemResolve(data);
                    request.onerror = () => itemReject(request.error);
                });
            });
            
            Promise.all(promises)
                .then(resolve)
                .catch(reject);
        });
    }
    
    /**
     * インデックス検索
     */
    async getByIndex(indexName, value, storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            return [];
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            
            request.onsuccess = () => {
                const results = request.result || [];
                const validResults = results.filter(item => {
                    if (item.expiry && Date.now() > item.expiry) {
                        this.removeItem(item.key, storeName);
                        return false;
                    }
                    return true;
                });
                
                resolve(validResults.map(item => ({
                    key: item.key,
                    value: item.value,
                    timestamp: item.timestamp
                })));
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * セクターデータ保存
     */
    async saveSectorData(sectorX, sectorY, pixelData) {
        const key = this.core.generateSectorKey(sectorX, sectorY);
        const data = {
            sectorX,
            sectorY,
            pixels: pixelData,
            lastModified: Date.now()
        };
        
        return this.setItem(key, data, 'sectors');
    }
    
    /**
     * セクターデータ取得
     */
    async getSectorData(sectorX, sectorY) {
        const key = this.core.generateSectorKey(sectorX, sectorY);
        return this.getItem(key, 'sectors');
    }
    
    /**
     * 期限切れデータクリーンアップ
     */
    async cleanupExpiredData(storeName = 'cache') {
        if (!this.isAvailable || !this.db) {
            return 0;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const index = store.index('expiryIndex');
            const now = Date.now();
            
            const range = window.IDBKeyRange.upperBound(now);
            const request = index.openCursor(range);
            
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * ストレージ使用量取得
     */
    async getStorageUsage() {
        if (!this.isAvailable || !this.db) {
            return { total: 0, stores: {} };
        }
        
        const storeNames = ['pixels', 'settings', 'cache', 'sectors'];
        const usage = { total: 0, stores: {} };
        
        for (const storeName of storeNames) {
            try {
                const count = await this.getStoreCount(storeName);
                usage.stores[storeName] = count;
                usage.total += count;
            } catch (error) {
                usage.stores[storeName] = 0;
            }
        }
        
        return usage;
    }
    
    /**
     * ストア内アイテム数取得
     */
    async getStoreCount(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * データベースクリア
     */
    async clear(storeName = null) {
        if (!this.isAvailable || !this.db) {
            return false;
        }
        
        const storeNames = storeName ? [storeName] : ['pixels', 'settings', 'cache', 'sectors'];
        
        for (const store of storeNames) {
            try {
                await new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([store], 'readwrite');
                    const objectStore = transaction.objectStore(store);
                    const request = objectStore.clear();
                    
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            } catch (error) {
                console.error(`💿 Failed to clear store ${store}:`, error);
            }
        }
        
        return true;
    }
    
    /**
     * 解放処理
     */
    destroy() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        this.isAvailable = false;
        console.log('💿 IndexedDBManager destroyed');
    }
}
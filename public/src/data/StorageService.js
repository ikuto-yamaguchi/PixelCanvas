// ローカルストレージ統合管理サービス
import { StorageCore } from './storage/StorageCore.js';
import { IndexedDBManager } from './storage/IndexedDBManager.js';
import { LocalStorageManager } from './storage/LocalStorageManager.js';
import { MemoryCacheManager } from './storage/MemoryCacheManager.js';

/**
 * ローカルストレージ統合管理クラス
 * 各ストレージタイプを統合して最適な保存方法を選択
 */
export class StorageService {
    constructor() {
        // コンポーネント初期化
        this.core = new StorageCore();
        this.indexedDB = new IndexedDBManager(this.core);
        this.localStorage = new LocalStorageManager(this.core);
        this.memoryCache = new MemoryCacheManager(this.core);
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    async initialize() {
        try {
            // 各ストレージの初期化
            await this.indexedDB.initialize();
            this.localStorage.checkAvailability();
            
            // ストレージ可用性チェック
            this.core.checkStorageAvailability();
            
            console.log('💿 StorageService initialized');
        } catch (error) {
            console.error('💿 StorageService initialization failed:', error);
        }
    }
    
    /**
     * 最適なストレージ選択
     */
    selectOptimalStorage(dataSize, isPersistent = true) {
        // 大容量データはIndexedDB
        if (dataSize > 1024 * 1024 && this.indexedDB.isAvailable && isPersistent) {
            return 'indexedDB';
        }
        
        // 中容量の永続データはlocalStorage
        if (dataSize <= 5 * 1024 * 1024 && this.localStorage.isAvailable && isPersistent) {
            return 'localStorage';
        }
        
        // 一時データまたは高速アクセスが必要な場合はメモリキャッシュ
        if (!isPersistent || dataSize <= 1024 * 1024) {
            return 'memoryCache';
        }
        
        // フォールバック
        const priority = this.core.getStoragePriority();
        return priority[0] || 'memoryCache';
    }
    
    /**
     * データ保存
     */
    async setItem(key, value, options = {}) {
        const {
            persistent = true,
            preferredStorage = null,
            ttl = null
        } = options;
        
        try {
            // データサイズ計算
            const dataSize = this.core.calculateDataSize(value);
            
            // データ検証
            if (!this.core.validateData(value)) {
                throw new Error('Invalid data format');
            }
            
            // ストレージ選択
            const storageType = preferredStorage || this.selectOptimalStorage(dataSize, persistent);
            
            let result = null;
            
            switch (storageType) {
                case 'indexedDB':
                    if (this.indexedDB.isAvailable) {
                        result = await this.indexedDB.setItem(key, value);
                    } else {
                        result = await this.localStorage.setItem(key, value);
                    }
                    break;
                
                case 'localStorage':
                    if (this.localStorage.isAvailable) {
                        result = await this.localStorage.setItem(key, value);
                    } else {
                        result = await this.memoryCache.setItem(key, value, ttl);
                    }
                    break;
                
                case 'memoryCache':
                default:
                    result = await this.memoryCache.setItem(key, value, ttl);
                    break;
            }
            
            return result;
        } catch (error) {
            return this.core.handleError('setItem', error);
        }
    }
    
    /**
     * データ取得
     */
    async getItem(key) {
        try {
            // メモリキャッシュから優先取得
            let value = await this.memoryCache.getItem(key);
            if (value !== null) {
                return value;
            }
            
            // IndexedDBから取得
            if (this.indexedDB.isAvailable) {
                value = await this.indexedDB.getItem(key);
                if (value !== null) {
                    // メモリキャッシュにも保存
                    await this.memoryCache.setItem(key, value);
                    return value;
                }
            }
            
            // localStorageから取得
            if (this.localStorage.isAvailable) {
                value = await this.localStorage.getItem(key);
                if (value !== null) {
                    // メモリキャッシュにも保存
                    await this.memoryCache.setItem(key, value);
                    return value;
                }
            }
            
            return null;
        } catch (error) {
            this.core.handleError('getItem', error);
            return null;
        }
    }
    
    /**
     * データ削除
     */
    async removeItem(key) {
        const results = await Promise.allSettled([
            this.memoryCache.removeItem(key),
            this.indexedDB.isAvailable ? this.indexedDB.removeItem(key) : Promise.resolve(false),
            this.localStorage.isAvailable ? this.localStorage.removeItem(key) : Promise.resolve(false)
        ]);
        
        return results.some(result => result.status === 'fulfilled' && result.value);
    }
    
    /**
     * セクターデータ保存
     */
    async saveSectorData(sectorX, sectorY, pixelData) {
        const key = this.core.generateSectorKey(sectorX, sectorY);
        
        // 大容量データなのでIndexedDBを優先
        if (this.indexedDB.isAvailable) {
            return await this.indexedDB.saveSectorData(sectorX, sectorY, pixelData);
        } else {
            return await this.setItem(key, pixelData, { persistent: true });
        }
    }
    
    /**
     * セクターデータ取得
     */
    async getSectorData(sectorX, sectorY) {
        if (this.indexedDB.isAvailable) {
            return await this.indexedDB.getSectorData(sectorX, sectorY);
        } else {
            const key = this.core.generateSectorKey(sectorX, sectorY);
            return await this.getItem(key);
        }
    }
    
    /**
     * 設定保存
     */
    async saveSettings(settings) {
        const key = this.core.keys.settings;
        return await this.setItem(key, settings, { persistent: true, preferredStorage: 'localStorage' });
    }
    
    /**
     * 設定取得
     */
    async getSettings() {
        const key = this.core.keys.settings;
        return await this.getItem(key);
    }
    
    /**
     * キャッシュデータ保存
     */
    async setCacheItem(key, value, ttl = 3600000) { // 1時間デフォルト
        return await this.setItem(key, value, { persistent: false, ttl });
    }
    
    /**
     * 複数データ保存
     */
    async setMultipleItems(items, options = {}) {
        const results = [];
        
        for (const { key, value } of items) {
            try {
                const result = await this.setItem(key, value, options);
                results.push({ key, success: true, result });
            } catch (error) {
                results.push({ key, success: false, error: error.message });
            }
        }
        
        return results;
    }
    
    /**
     * パターンマッチングによる取得
     */
    async getItemsByPattern(pattern) {
        const results = new Map();
        
        // メモリキャッシュから取得
        const memoryKeys = this.memoryCache.getKeys();
        const regex = new RegExp(pattern);
        
        for (const key of memoryKeys) {
            if (regex.test(key)) {
                const value = await this.memoryCache.getItem(key);
                if (value !== null) {
                    results.set(key, value);
                }
            }
        }
        
        // localStorageから取得
        if (this.localStorage.isAvailable) {
            const localItems = await this.localStorage.getItemsByPattern(pattern);
            for (const { key, value } of localItems) {
                if (!results.has(key)) {
                    results.set(key, value);
                }
            }
        }
        
        return Array.from(results.entries()).map(([key, value]) => ({ key, value }));
    }
    
    /**
     * ストレージクリーンアップ
     */
    async cleanup() {
        const results = {
            memoryCache: 0,
            localStorage: 0,
            indexedDB: 0
        };
        
        // メモリキャッシュクリーンアップ
        results.memoryCache = this.memoryCache.cleanup();
        
        // localStorageクリーンアップ
        if (this.localStorage.isAvailable) {
            results.localStorage = await this.localStorage.cleanup();
        }
        
        // IndexedDBクリーンアップ
        if (this.indexedDB.isAvailable) {
            results.indexedDB = await this.indexedDB.cleanupExpiredData();
        }
        
        console.log('💿 Storage cleanup completed:', results);
        return results;
    }
    
    /**
     * ストレージ使用量取得
     */
    async getStorageUsage() {
        const usage = {
            memoryCache: this.memoryCache.getStats(),
            localStorage: this.localStorage.getStats(),
            indexedDB: { isAvailable: false, usage: { total: 0, stores: {} } }
        };
        
        if (this.indexedDB.isAvailable) {
            usage.indexedDB = {
                isAvailable: true,
                usage: await this.indexedDB.getStorageUsage()
            };
        }
        
        return usage;
    }
    
    /**
     * パフォーマンステスト
     */
    async performanceTest() {
        const testData = { test: true, timestamp: Date.now(), data: 'x'.repeat(1000) };
        const testKey = '__perf_test_' + Date.now();
        
        const results = {};
        
        // メモリキャッシュテスト
        const memStart = performance.now();
        await this.memoryCache.setItem(testKey, testData);
        await this.memoryCache.getItem(testKey);
        await this.memoryCache.removeItem(testKey);
        results.memoryCache = performance.now() - memStart;
        
        // localStorageテスト
        if (this.localStorage.isAvailable) {
            const localStart = performance.now();
            await this.localStorage.setItem(testKey, testData);
            await this.localStorage.getItem(testKey);
            await this.localStorage.removeItem(testKey);
            results.localStorage = performance.now() - localStart;
        }
        
        // IndexedDBテスト
        if (this.indexedDB.isAvailable) {
            const idbStart = performance.now();
            await this.indexedDB.setItem(testKey, testData);
            await this.indexedDB.getItem(testKey);
            await this.indexedDB.removeItem(testKey);
            results.indexedDB = performance.now() - idbStart;
        }
        
        return results;
    }
    
    /**
     * 全データクリア
     */
    async clearAll() {
        const results = await Promise.allSettled([
            this.memoryCache.clear(),
            this.localStorage.isAvailable ? this.localStorage.clearAppData() : Promise.resolve(0),
            this.indexedDB.isAvailable ? this.indexedDB.clear() : Promise.resolve(false)
        ]);
        
        console.log('💿 All storage cleared');
        return results;
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            core: this.core.getStats(),
            memoryCache: this.memoryCache.getStats(),
            localStorage: this.localStorage.getStats(),
            indexedDB: {
                isAvailable: this.indexedDB.isAvailable
            }
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.memoryCache.clear();
        this.indexedDB.destroy();
        
        console.log('💿 StorageService destroyed');
    }
}
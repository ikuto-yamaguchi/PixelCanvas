// ストレージコア機能
import { CONFIG } from '../../../Config.js';

/**
 * ストレージコア管理クラス
 * 基本的なストレージ操作とキー管理を担当
 */
export class StorageCore {
    constructor() {
        this.storagePrefix = 'pixelcanvas_';
        
        // キーネームス
        this.keys = {
            pixels: `${this.storagePrefix}pixels`,
            settings: `${this.storagePrefix}settings`,
            cache: `${this.storagePrefix}cache`,
            userStats: `${this.storagePrefix}user_stats`,
            sectors: `${this.storagePrefix}sectors`
        };
        
        // 設定
        this.useIndexedDB = true;
        this.useLocalStorage = true;
        this.useMemoryCache = true;
        
        console.log('💿 StorageCore initialized');
    }
    
    /**
     * ストレージ可用性チェック
     */
    checkStorageAvailability() {
        const availability = {
            localStorage: false,
            indexedDB: false,
            sessionStorage: false
        };
        
        // localStorage テスト
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            availability.localStorage = true;
            this.useLocalStorage = true;
        } catch (error) {
            console.warn('💿 localStorage not available:', error);
            this.useLocalStorage = false;
        }
        
        // IndexedDB テスト
        try {
            if (window.indexedDB) {
                availability.indexedDB = true;
            } else {
                this.useIndexedDB = false;
            }
        } catch (error) {
            console.warn('💿 IndexedDB not available:', error);
            this.useIndexedDB = false;
        }
        
        // sessionStorage テスト
        try {
            const testKey = '__session_test__';
            window.sessionStorage.setItem(testKey, 'test');
            window.sessionStorage.removeItem(testKey);
            availability.sessionStorage = true;
        } catch (error) {
            console.warn('💿 sessionStorage not available:', error);
        }
        
        console.log('💿 Storage availability:', availability);
        return availability;
    }
    
    /**
     * キー生成
     */
    generateKey(namespace, identifier) {
        return `${this.storagePrefix}${namespace}_${identifier}`;
    }
    
    /**
     * セクターキー生成
     */
    generateSectorKey(sectorX, sectorY) {
        return `${this.keys.sectors}_${sectorX}_${sectorY}`;
    }
    
    /**
     * ピクセルキー生成
     */
    generatePixelKey(sectorX, sectorY, localX, localY) {
        return `${this.keys.pixels}_${sectorX}_${sectorY}_${localX}_${localY}`;
    }
    
    /**
     * キーから情報を抽出
     */
    parseKey(key) {
        if (!key.startsWith(this.storagePrefix)) {
            return null;
        }
        
        const parts = key.replace(this.storagePrefix, '').split('_');
        return {
            namespace: parts[0],
            identifier: parts.slice(1).join('_'),
            parts: parts
        };
    }
    
    /**
     * データのサイズ計算
     */
    calculateDataSize(data) {
        try {
            return JSON.stringify(data).length;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * データの圧縮（簡易版）
     */
    compressData(data) {
        try {
            // 簡易的なデータ圧縮（JSONの冗長性を除去）
            if (typeof data === 'object' && data !== null) {
                const compressed = {};
                for (const key in data) {
                    if (data[key] !== null && data[key] !== undefined) {
                        compressed[key] = data[key];
                    }
                }
                return compressed;
            }
            return data;
        } catch (error) {
            return data;
        }
    }
    
    /**
     * データの検証
     */
    validateData(data, schema = null) {
        try {
            // 基本検証
            if (data === null || data === undefined) {
                return false;
            }
            
            // サイズ制限チェック
            const size = this.calculateDataSize(data);
            const maxSize = CONFIG.MAX_STORAGE_ITEM_SIZE || 1024 * 1024; // 1MB default
            
            if (size > maxSize) {
                console.warn('💿 Data size exceeds limit:', size, 'bytes');
                return false;
            }
            
            // スキーマ検証（簡易版）
            if (schema) {
                return this.validateSchema(data, schema);
            }
            
            return true;
        } catch (error) {
            console.error('💿 Data validation error:', error);
            return false;
        }
    }
    
    /**
     * スキーマ検証（簡易版）
     */
    validateSchema(data, schema) {
        try {
            if (schema.type) {
                if (typeof data !== schema.type) {
                    return false;
                }
            }
            
            if (schema.required && Array.isArray(schema.required)) {
                for (const field of schema.required) {
                    if (!(field in data)) {
                        return false;
                    }
                }
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * エラーハンドリング
     */
    handleError(operation, error, fallback = null) {
        console.error(`💿 Storage ${operation} error:`, error);
        
        // クォータ超過エラーの場合
        if (error.name === 'QuotaExceededError') {
            console.warn('💿 Storage quota exceeded, attempting cleanup');
            return 'quota_exceeded';
        }
        
        // データベースエラーの場合
        if (error.name === 'DatabaseError') {
            console.warn('💿 Database error, falling back to alternative storage');
            return 'database_error';
        }
        
        return fallback;
    }
    
    /**
     * ストレージタイプ優先順位取得
     */
    getStoragePriority() {
        const priority = [];
        
        if (this.useIndexedDB) priority.push('indexedDB');
        if (this.useLocalStorage) priority.push('localStorage');
        if (this.useMemoryCache) priority.push('memoryCache');
        
        return priority;
    }
    
    /**
     * 設定取得
     */
    getSettings() {
        return {
            storagePrefix: this.storagePrefix,
            useIndexedDB: this.useIndexedDB,
            useLocalStorage: this.useLocalStorage,
            useMemoryCache: this.useMemoryCache,
            keys: { ...this.keys }
        };
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            keyCount: Object.keys(this.keys).length,
            storageAvailability: this.checkStorageAvailability(),
            settings: this.getSettings()
        };
    }
}
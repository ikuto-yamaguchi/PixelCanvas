// localStorage管理
/**
 * localStorage管理クラス
 * 簡易データの永続化を担当
 */
export class LocalStorageManager {
    constructor(storageCore) {
        this.core = storageCore;
        this.isAvailable = false;
        this.maxItemSize = 5 * 1024 * 1024; // 5MB
        
        this.checkAvailability();
    }
    
    /**
     * 可用性チェック
     */
    checkAvailability() {
        try {
            const testKey = '__test_localStorage__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this.isAvailable = true;
        } catch (error) {
            console.warn('💿 localStorage not available:', error);
            this.isAvailable = false;
            this.core.useLocalStorage = false;
        }
    }
    
    /**
     * データ保存
     */
    async setItem(key, value) {
        if (!this.isAvailable) {
            throw new Error('localStorage not available');
        }
        
        try {
            const data = {
                value: this.core.compressData(value),
                timestamp: Date.now(),
                version: 1
            };
            
            const serialized = JSON.stringify(data);
            
            // サイズチェック
            if (serialized.length > this.maxItemSize) {
                throw new Error(`Item too large for localStorage: ${serialized.length} bytes`);
            }
            
            localStorage.setItem(key, serialized);
            return data;
        } catch (error) {
            return this.core.handleError('setItem', error);
        }
    }
    
    /**
     * データ取得
     */
    async getItem(key) {
        if (!this.isAvailable) {
            return null;
        }
        
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return null;
            }
            
            const data = JSON.parse(stored);
            
            // バージョンチェック
            if (data.version !== 1) {
                console.warn('💿 Outdated localStorage format, removing item');
                this.removeItem(key);
                return null;
            }
            
            return data.value;
        } catch (error) {
            console.error('💿 localStorage getItem error:', error);
            // 壊れたデータを削除
            this.removeItem(key);
            return null;
        }
    }
    
    /**
     * データ削除
     */
    async removeItem(key) {
        if (!this.isAvailable) {
            return false;
        }
        
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('💿 localStorage removeItem error:', error);
            return false;
        }
    }
    
    /**
     * 複数データ保存
     */
    async setMultipleItems(items) {
        if (!this.isAvailable) {
            throw new Error('localStorage not available');
        }
        
        const results = [];
        
        for (const { key, value } of items) {
            try {
                const result = await this.setItem(key, value);
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
        if (!this.isAvailable) {
            return [];
        }
        
        const results = [];
        const regex = new RegExp(pattern);
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && regex.test(key)) {
                    const value = await this.getItem(key);
                    if (value !== null) {
                        results.push({ key, value });
                    }
                }
            }
        } catch (error) {
            console.error('💿 Error getting items by pattern:', error);
        }
        
        return results;
    }
    
    /**
     * キー一覧取得
     */
    getKeys(prefix = null) {
        if (!this.isAvailable) {
            return [];
        }
        
        const keys = [];
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (!prefix || key.startsWith(prefix))) {
                    keys.push(key);
                }
            }
        } catch (error) {
            console.error('💿 Error getting keys:', error);
        }
        
        return keys;
    }
    
    /**
     * ストレージサイズ取得
     */
    getStorageSize() {
        if (!this.isAvailable) {
            return { total: 0, used: 0, items: 0 };
        }
        
        let totalSize = 0;
        let itemCount = 0;
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key);
                    totalSize += key.length + (value ? value.length : 0);
                    itemCount++;
                }
            }
        } catch (error) {
            console.error('💿 Error calculating storage size:', error);
        }
        
        return {
            total: Math.round(totalSize / 1024), // KB
            used: Math.round(totalSize / 1024), // KB
            items: itemCount
        };
    }
    
    /**
     * アプリ専用データサイズ取得
     */
    getAppStorageSize() {
        if (!this.isAvailable) {
            return { size: 0, items: 0 };
        }
        
        let appSize = 0;
        let appItems = 0;
        
        try {
            const appKeys = this.getKeys(this.core.storagePrefix);
            for (const key of appKeys) {
                const value = localStorage.getItem(key);
                appSize += key.length + (value ? value.length : 0);
                appItems++;
            }
        } catch (error) {
            console.error('💿 Error calculating app storage size:', error);
        }
        
        return {
            size: Math.round(appSize / 1024), // KB
            items: appItems
        };
    }
    
    /**
     * クリーンアップ
     */
    async cleanup() {
        if (!this.isAvailable) {
            return 0;
        }
        
        let cleanedItems = 0;
        const appKeys = this.getKeys(this.core.storagePrefix);
        
        for (const key of appKeys) {
            try {
                const stored = localStorage.getItem(key);
                if (stored) {
                    const data = JSON.parse(stored);
                    
                    // 古いバージョンのデータを削除
                    if (!data.version || data.version < 1) {
                        await this.removeItem(key);
                        cleanedItems++;
                    }
                    
                    // 1週間以上古いキャッシュデータを削除
                    if (data.timestamp && (Date.now() - data.timestamp) > 7 * 24 * 60 * 60 * 1000) {
                        if (key.includes('cache')) {
                            await this.removeItem(key);
                            cleanedItems++;
                        }
                    }
                }
            } catch (error) {
                // 壊れたデータを削除
                await this.removeItem(key);
                cleanedItems++;
            }
        }
        
        console.log(`💿 localStorage cleanup: ${cleanedItems} items removed`);
        return cleanedItems;
    }
    
    /**
     * アプリデータクリア
     */
    async clearAppData() {
        if (!this.isAvailable) {
            return 0;
        }
        
        const appKeys = this.getKeys(this.core.storagePrefix);
        let removedCount = 0;
        
        for (const key of appKeys) {
            if (await this.removeItem(key)) {
                removedCount++;
            }
        }
        
        console.log(`💿 Cleared ${removedCount} app items from localStorage`);
        return removedCount;
    }
    
    /**
     * ストレージテスト
     */
    async testStorage() {
        if (!this.isAvailable) {
            return { success: false, error: 'localStorage not available' };
        }
        
        const testKey = '__storage_test_' + Date.now();
        const testData = { test: true, timestamp: Date.now() };
        
        try {
            await this.setItem(testKey, testData);
            const retrieved = await this.getItem(testKey);
            await this.removeItem(testKey);
            
            const success = JSON.stringify(retrieved) === JSON.stringify(testData);
            
            return {
                success,
                error: success ? null : 'Data mismatch'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            isAvailable: this.isAvailable,
            maxItemSize: this.maxItemSize,
            storageSize: this.getStorageSize(),
            appStorageSize: this.getAppStorageSize()
        };
    }
}
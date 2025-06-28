// メモリキャッシュ管理
/**
 * メモリキャッシュ管理クラス
 * 高速アクセス用の一時データ保存を担当
 */
export class MemoryCacheManager {
    constructor(storageCore) {
        this.core = storageCore;
        this.cache = new Map();
        this.accessTimes = new Map(); // LRU用
        this.maxCacheSize = 10000; // 最大キャッシュエントリ数
        this.maxMemorySize = 50 * 1024 * 1024; // 50MB
        this.currentMemorySize = 0;
        
        // 統計情報
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0
        };
        
        console.log('💿 MemoryCacheManager initialized');
    }
    
    /**
     * データ保存
     */
    async setItem(key, value, ttl = null) {
        try {
            const dataSize = this.core.calculateDataSize(value);
            
            // メモリサイズ制限チェック
            if (dataSize > this.maxMemorySize / 10) {
                console.warn('💿 Item too large for memory cache:', dataSize, 'bytes');
                return false;
            }
            
            // 既存データがある場合は削除
            if (this.cache.has(key)) {
                const oldData = this.cache.get(key);
                this.currentMemorySize -= oldData.size;
            }
            
            const cacheData = {
                value: this.core.compressData(value),
                timestamp: Date.now(),
                expiry: ttl ? Date.now() + ttl : null,
                size: dataSize,
                accessCount: 0
            };
            
            // メモリ容量チェックと必要に応じて古いデータを削除
            while (this.currentMemorySize + dataSize > this.maxMemorySize && this.cache.size > 0) {
                this.evictOldest();
            }
            
            // キャッシュサイズ制限チェック
            while (this.cache.size >= this.maxCacheSize) {
                this.evictOldest();
            }
            
            this.cache.set(key, cacheData);
            this.accessTimes.set(key, Date.now());
            this.currentMemorySize += dataSize;
            this.stats.sets++;
            
            return true;
        } catch (error) {
            console.error('💿 Memory cache setItem error:', error);
            return false;
        }
    }
    
    /**
     * データ取得
     */
    async getItem(key) {
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return null;
        }
        
        const cacheData = this.cache.get(key);
        
        // 有効期限チェック
        if (cacheData.expiry && Date.now() > cacheData.expiry) {
            this.removeItem(key);
            this.stats.misses++;
            return null;
        }
        
        // アクセス時間更新
        this.accessTimes.set(key, Date.now());
        cacheData.accessCount++;
        
        this.stats.hits++;
        return cacheData.value;
    }
    
    /**
     * データ削除
     */
    async removeItem(key) {
        if (this.cache.has(key)) {
            const cacheData = this.cache.get(key);
            this.currentMemorySize -= cacheData.size;
            this.cache.delete(key);
            this.accessTimes.delete(key);
            return true;
        }
        return false;
    }
    
    /**
     * 最も古いデータを削除（LRU）
     */
    evictOldest() {
        if (this.cache.size === 0) {
            return;
        }
        
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, accessTime] of this.accessTimes.entries()) {
            if (accessTime < oldestTime) {
                oldestTime = accessTime;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.removeItem(oldestKey);
            this.stats.evictions++;
        }
    }
    
    /**
     * 期限切れデータクリーンアップ
     */
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, cacheData] of this.cache.entries()) {
            if (cacheData.expiry && now > cacheData.expiry) {
                this.removeItem(key);
                cleanedCount++;
            }
        }
        
        console.log(`💿 Memory cache cleanup: ${cleanedCount} expired items removed`);
        return cleanedCount;
    }
    
    /**
     * パターンマッチングによる削除
     */
    removeByPattern(pattern) {
        const regex = new RegExp(pattern);
        let removedCount = 0;
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.removeItem(key);
                removedCount++;
            }
        }
        
        return removedCount;
    }
    
    /**
     * キャッシュサイズ制限設定
     */
    setMaxCacheSize(size) {
        this.maxCacheSize = Math.max(100, size);
        
        // 現在のサイズが制限を超えている場合は削除
        while (this.cache.size > this.maxCacheSize) {
            this.evictOldest();
        }
    }
    
    /**
     * メモリ制限設定
     */
    setMaxMemorySize(sizeInBytes) {
        this.maxMemorySize = Math.max(1024 * 1024, sizeInBytes); // 最小1MB
        
        // 現在のメモリ使用量が制限を超えている場合は削除
        while (this.currentMemorySize > this.maxMemorySize && this.cache.size > 0) {
            this.evictOldest();
        }
    }
    
    /**
     * キー一覧取得
     */
    getKeys(prefix = null) {
        const keys = Array.from(this.cache.keys());
        
        if (prefix) {
            return keys.filter(key => key.startsWith(prefix));
        }
        
        return keys;
    }
    
    /**
     * キャッシュ統計取得
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : '0';
        
        return {
            ...this.stats,
            hitRate: parseFloat(hitRate),
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            memoryUsage: Math.round(this.currentMemorySize / 1024), // KB
            maxMemoryUsage: Math.round(this.maxMemorySize / 1024), // KB
            memoryUtilization: ((this.currentMemorySize / this.maxMemorySize) * 100).toFixed(2)
        };
    }
    
    /**
     * ホットデータ取得（最もアクセスされているデータ）
     */
    getHotData(limit = 10) {
        const hotData = Array.from(this.cache.entries())
            .map(([key, data]) => ({
                key,
                accessCount: data.accessCount,
                lastAccess: this.accessTimes.get(key),
                size: data.size
            }))
            .sort((a, b) => b.accessCount - a.accessCount)
            .slice(0, limit);
        
        return hotData;
    }
    
    /**
     * メモリ使用量詳細取得
     */
    getMemoryBreakdown() {
        const breakdown = {
            totalItems: this.cache.size,
            totalMemory: this.currentMemorySize,
            averageItemSize: this.cache.size > 0 ? Math.round(this.currentMemorySize / this.cache.size) : 0,
            categories: {}
        };
        
        // カテゴリ別分析
        for (const [key, data] of this.cache.entries()) {
            const keyInfo = this.core.parseKey(key);
            const category = keyInfo ? keyInfo.namespace : 'unknown';
            
            if (!breakdown.categories[category]) {
                breakdown.categories[category] = {
                    items: 0,
                    memory: 0,
                    averageSize: 0
                };
            }
            
            breakdown.categories[category].items++;
            breakdown.categories[category].memory += data.size;
        }
        
        // 平均サイズ計算
        for (const category in breakdown.categories) {
            const cat = breakdown.categories[category];
            cat.averageSize = cat.items > 0 ? Math.round(cat.memory / cat.items) : 0;
        }
        
        return breakdown;
    }
    
    /**
     * 全キャッシュクリア
     */
    clear() {
        const clearedItems = this.cache.size;
        this.cache.clear();
        this.accessTimes.clear();
        this.currentMemorySize = 0;
        
        console.log(`💿 Memory cache cleared: ${clearedItems} items removed`);
        return clearedItems;
    }
    
    /**
     * 統計リセット
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0
        };
    }
    
    /**
     * 最適化実行
     */
    optimize() {
        // 期限切れデータクリーンアップ
        const expiredCount = this.cleanup();
        
        // メモリ使用量が80%を超えている場合、LRU削除
        let evictedCount = 0;
        while (this.currentMemorySize > this.maxMemorySize * 0.8 && this.cache.size > 0) {
            this.evictOldest();
            evictedCount++;
        }
        
        console.log(`💿 Memory cache optimized: ${expiredCount} expired, ${evictedCount} evicted`);
        return { expiredCount, evictedCount };
    }
}
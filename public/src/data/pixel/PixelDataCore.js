// ピクセルデータコア管理
// Configuration imported as needed

/**
 * ピクセルデータコア管理クラス
 * 基本的なピクセル操作とストレージを担当
 */
export class PixelDataCore {
    constructor() {
        // データストア
        this.pixels = new Map(); // key: "sectorX,sectorY,localX,localY", value: color
        this.sectorCounts = new Map(); // key: "sectorX,sectorY", value: count
        this.activeSectors = new Set(); // アクティブセクター一覧
        
        // データ変更追跡
        this.changeListeners = new Set();
        this.dirtyPixels = new Set(); // 未保存のピクセル
        this.lastSaveTime = Date.now();
        
        // パフォーマンス設定
        this.maxCacheSize = 100000; // 最大キャッシュサイズ
        
        console.log('💾 PixelDataCore initialized');
    }
    
    /**
     * ピクセルキー生成
     */
    generatePixelKey(sectorX, sectorY, localX, localY) {
        return `${sectorX},${sectorY},${localX},${localY}`;
    }
    
    /**
     * セクターキー生成
     */
    generateSectorKey(sectorX, sectorY) {
        return `${sectorX},${sectorY}`;
    }
    
    /**
     * ピクセル設定
     */
    setPixel(sectorX, sectorY, localX, localY, color) {
        const key = this.generatePixelKey(sectorX, sectorY, localX, localY);
        const oldColor = this.pixels.get(key);
        
        // 同じ色の場合は何もしない
        if (oldColor === color) {
            return false;
        }
        
        // ピクセル設定
        this.pixels.set(key, color);
        this.dirtyPixels.add(key);
        
        // セクターカウント更新
        this.updateSectorCount(sectorX, sectorY, oldColor === undefined ? 1 : 0);
        
        // セクターをアクティブに設定
        this.activeSectors.add(this.generateSectorKey(sectorX, sectorY));
        
        // 変更通知
        this.notifyPixelChange({
            sectorX, sectorY, localX, localY, color, oldColor,
            action: oldColor === undefined ? 'add' : 'update'
        });
        
        return true;
    }
    
    /**
     * ピクセル取得
     */
    getPixel(sectorX, sectorY, localX, localY) {
        const key = this.generatePixelKey(sectorX, sectorY, localX, localY);
        return this.pixels.get(key) || null;
    }
    
    /**
     * ピクセル削除
     */
    removePixel(sectorX, sectorY, localX, localY) {
        const key = this.generatePixelKey(sectorX, sectorY, localX, localY);
        const oldColor = this.pixels.get(key);
        
        if (oldColor === undefined) {
            return false;
        }
        
        this.pixels.delete(key);
        this.dirtyPixels.add(key);
        
        // セクターカウント更新
        this.updateSectorCount(sectorX, sectorY, -1);
        
        // 変更通知
        this.notifyPixelChange({
            sectorX, sectorY, localX, localY, color: null, oldColor,
            action: 'remove'
        });
        
        return true;
    }
    
    /**
     * セクターカウント更新
     */
    updateSectorCount(sectorX, sectorY, delta) {
        const sectorKey = this.generateSectorKey(sectorX, sectorY);
        const currentCount = this.sectorCounts.get(sectorKey) || 0;
        const newCount = Math.max(0, currentCount + delta);
        
        if (newCount > 0) {
            this.sectorCounts.set(sectorKey, newCount);
        } else {
            this.sectorCounts.delete(sectorKey);
            this.activeSectors.delete(sectorKey);
        }
    }
    
    /**
     * セクター内ピクセル取得
     */
    getSectorPixels(sectorX, sectorY) {
        const sectorPixels = new Map();
        const sectorPrefix = `${sectorX},${sectorY},`;
        
        for (const [key, color] of this.pixels.entries()) {
            if (key.startsWith(sectorPrefix)) {
                const parts = key.split(',');
                const localX = parseInt(parts[2]);
                const localY = parseInt(parts[3]);
                sectorPixels.set(`${localX},${localY}`, color);
            }
        }
        
        return sectorPixels;
    }
    
    /**
     * セクター範囲内ピクセル取得
     */
    getPixelsInRange(minSectorX, minSectorY, maxSectorX, maxSectorY) {
        const pixels = new Map();
        
        for (let sectorX = minSectorX; sectorX <= maxSectorX; sectorX++) {
            for (let sectorY = minSectorY; sectorY <= maxSectorY; sectorY++) {
                const sectorPixels = this.getSectorPixels(sectorX, sectorY);
                for (const [localKey, color] of sectorPixels.entries()) {
                    const pixelKey = `${sectorX},${sectorY},${localKey}`;
                    pixels.set(pixelKey, color);
                }
            }
        }
        
        return pixels;
    }
    
    /**
     * 複数ピクセル一括設定
     */
    setMultiplePixels(pixelData) {
        const changes = [];
        
        for (const { sectorX, sectorY, localX, localY, color } of pixelData) {
            const changed = this.setPixel(sectorX, sectorY, localX, localY, color);
            if (changed) {
                changes.push({ sectorX, sectorY, localX, localY, color });
            }
        }
        
        return changes;
    }
    
    /**
     * セクターデータ設定
     */
    setSectorData(sectorX, sectorY, pixelData) {
        let changeCount = 0;
        
        for (const [localKey, color] of pixelData.entries()) {
            const [localX, localY] = localKey.split(',').map(Number);
            if (this.setPixel(sectorX, sectorY, localX, localY, color)) {
                changeCount++;
            }
        }
        
        return changeCount;
    }
    
    /**
     * 変更リスナー追加
     */
    addChangeListener(listener) {
        this.changeListeners.add(listener);
    }
    
    /**
     * 変更リスナー削除
     */
    removeChangeListener(listener) {
        this.changeListeners.delete(listener);
    }
    
    /**
     * ピクセル変更通知
     */
    notifyPixelChange(changeData) {
        for (const listener of this.changeListeners) {
            try {
                listener(changeData);
            } catch (error) {
                console.error('💾 Change listener error:', error);
            }
        }
    }
    
    /**
     * 未保存変更取得
     */
    getDirtyPixels() {
        const dirtyData = [];
        
        for (const key of this.dirtyPixels) {
            const parts = key.split(',');
            const sectorX = parseInt(parts[0]);
            const sectorY = parseInt(parts[1]);
            const localX = parseInt(parts[2]);
            const localY = parseInt(parts[3]);
            const color = this.pixels.get(key);
            
            dirtyData.push({
                sectorX, sectorY, localX, localY, color,
                key, removed: color === undefined
            });
        }
        
        return dirtyData;
    }
    
    /**
     * 変更をクリーンとしてマーク
     */
    markClean(pixelKeys = null) {
        if (pixelKeys) {
            for (const key of pixelKeys) {
                this.dirtyPixels.delete(key);
            }
        } else {
            this.dirtyPixels.clear();
        }
        
        this.lastSaveTime = Date.now();
    }
    
    /**
     * セクター統計取得
     */
    getSectorStats(sectorX, sectorY) {
        const sectorKey = this.generateSectorKey(sectorX, sectorY);
        return {
            pixelCount: this.sectorCounts.get(sectorKey) || 0,
            isActive: this.activeSectors.has(sectorKey),
            pixels: this.getSectorPixels(sectorX, sectorY)
        };
    }
    
    /**
     * 全体統計取得
     */
    getStats() {
        return {
            totalPixels: this.pixels.size,
            activeSectors: this.activeSectors.size,
            dirtyPixels: this.dirtyPixels.size,
            lastSaveTime: this.lastSaveTime,
            changeListeners: this.changeListeners.size,
            memoryUsage: this.estimateMemoryUsage()
        };
    }
    
    /**
     * メモリ使用量推定
     */
    estimateMemoryUsage() {
        // 大まかな推定値（バイト）
        const pixelEntrySize = 50; // キー + 値の推定サイズ
        const sectorEntrySize = 30;
        
        return {
            pixels: this.pixels.size * pixelEntrySize,
            sectors: this.sectorCounts.size * sectorEntrySize,
            total: (this.pixels.size * pixelEntrySize) + (this.sectorCounts.size * sectorEntrySize)
        };
    }
    
    /**
     * キャッシュ最適化
     */
    optimizeCache() {
        // メモリ使用量が制限を超えている場合
        if (this.pixels.size > this.maxCacheSize) {
            // 非アクティブセクターの古いピクセルを削除
            const pixelsToRemove = this.pixels.size - this.maxCacheSize;
            let removedCount = 0;
            
            for (const [key, color] of this.pixels.entries()) {
                if (removedCount >= pixelsToRemove) break;
                
                const parts = key.split(',');
                const sectorKey = `${parts[0]},${parts[1]}`;
                
                // アクティブでないセクターのピクセルを削除
                if (!this.activeSectors.has(sectorKey) && !this.dirtyPixels.has(key)) {
                    this.pixels.delete(key);
                    removedCount++;
                }
            }
            
            console.log(`💾 Cache optimized: removed ${removedCount} pixels`);
        }
    }
    
    /**
     * データクリア
     */
    clear() {
        this.pixels.clear();
        this.sectorCounts.clear();
        this.activeSectors.clear();
        this.dirtyPixels.clear();
        this.lastSaveTime = Date.now();
        
        console.log('💾 PixelDataCore cleared');
    }
    
    /**
     * デバッグ情報
     */
    debugInfo() {
        const stats = this.getStats();
        console.log('💾 PixelDataCore Debug Info:', {
            stats,
            activeSectors: Array.from(this.activeSectors).slice(0, 10),
            dirtyPixelSample: Array.from(this.dirtyPixels).slice(0, 10)
        });
    }
}
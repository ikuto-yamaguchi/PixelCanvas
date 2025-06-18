// 画面範囲データベース一括取得システム
import { CONFIG } from './Config.js';

export class ViewportDataLoader {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        
        // キャッシュシステム
        this.sectorCache = new Map(); // セクター別ピクセルデータ
        this.sectorTimestamps = new Map(); // キャッシュタイムスタンプ
        this.pendingRequests = new Map(); // 重複リクエスト防止
        
        // 設定
        this.CACHE_DURATION = 30000; // 30秒キャッシュ
        this.MAX_PIXELS_PER_REQUEST = 10000; // 1回のリクエスト上限
        this.BATCH_SIZE = 16; // セクター単位のバッチサイズ
    }
    
    /**
     * 画面範囲のピクセルデータを効率的に取得
     */
    async loadViewportData(bounds) {
        const startTime = performance.now();
        
        try {
            // 描画モードに応じた最適化戦略
            const priority = this.calculateLoadPriority(bounds);
            
            let result;
            switch (priority.strategy) {
                case 'pixel_direct':
                    result = await this.loadPixelsDirect(bounds);
                    break;
                case 'sector_batch':
                    result = await this.loadSectorsBatch(bounds);
                    break;
                case 'tile_aggregated':
                    result = await this.loadTilesAggregated(bounds);
                    break;
                default:
                    result = await this.loadSectorsBatch(bounds);
            }
            
            const loadTime = performance.now() - startTime;
            console.error(`📊 Data loaded in ${loadTime.toFixed(1)}ms:`, {
                strategy: priority.strategy,
                pixelsLoaded: result.totalPixels,
                sectorsLoaded: result.sectorsLoaded,
                cacheHits: result.cacheHits
            });
            
            return result;
            
        } catch (error) {
            console.error('❌ Failed to load viewport data:', error);
            return { pixels: new Map(), sectors: new Map(), totalPixels: 0 };
        }
    }
    
    /**
     * 読み込み戦略の決定
     */
    calculateLoadPriority(bounds) {
        const estimatedPixels = bounds.world.width * bounds.world.height;
        const sectorCount = bounds.sectors.total;
        
        if (bounds.scale.isHighDetail && estimatedPixels <= this.MAX_PIXELS_PER_REQUEST) {
            return { strategy: 'pixel_direct', priority: 'high' };
        } else if (bounds.scale.isMediumDetail && sectorCount <= this.BATCH_SIZE) {
            return { strategy: 'sector_batch', priority: 'medium' };
        } else {
            return { strategy: 'tile_aggregated', priority: 'low' };
        }
    }
    
    /**
     * 高詳細: ピクセル直接読み込み
     */
    async loadPixelsDirect(bounds) {
        const cacheKey = `pixels_${bounds.world.left}_${bounds.world.top}_${bounds.world.right}_${bounds.world.bottom}`;
        
        // キャッシュチェック
        if (this.isCacheValid(cacheKey)) {
            return this.getCachedResult(cacheKey);
        }
        
        // 重複リクエスト防止
        if (this.pendingRequests.has(cacheKey)) {
            return await this.pendingRequests.get(cacheKey);
        }
        
        const requestPromise = this.executePixelQuery(bounds);
        this.pendingRequests.set(cacheKey, requestPromise);
        
        try {
            const result = await requestPromise;
            this.cacheResult(cacheKey, result);
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }
    
    /**
     * 中詳細: セクターバッチ読み込み
     */
    async loadSectorsBatch(bounds) {
        const neededSectors = [];
        const cachedPixels = new Map();
        let cacheHits = 0;
        
        // キャッシュされたセクターと未キャッシュセクターを分離
        for (let sx = bounds.sectors.left; sx <= bounds.sectors.right; sx++) {
            for (let sy = bounds.sectors.top; sy <= bounds.sectors.bottom; sy++) {
                const sectorKey = `${sx},${sy}`;
                
                if (this.isSectorCached(sectorKey)) {
                    // キャッシュヒット
                    const sectorPixels = this.sectorCache.get(sectorKey);
                    for (const [pixelKey, pixelData] of sectorPixels) {
                        cachedPixels.set(pixelKey, pixelData);
                    }
                    cacheHits++;
                } else {
                    // 読み込み必要
                    neededSectors.push({ sectorX: sx, sectorY: sy, sectorKey });
                }
            }
        }
        
        let newPixels = new Map();
        
        // 未キャッシュセクターの並列読み込み
        if (neededSectors.length > 0) {
            newPixels = await this.loadSectorsParallel(neededSectors);
        }
        
        // 結果統合
        const allPixels = new Map([...cachedPixels, ...newPixels]);
        
        return {
            pixels: allPixels,
            totalPixels: allPixels.size,
            sectorsLoaded: neededSectors.length,
            cacheHits: cacheHits
        };
    }
    
    /**
     * 低詳細: タイル集約読み込み
     */
    async loadTilesAggregated(bounds) {
        // タイルベースの集約データ読み込み
        // セクター統計データのみ取得（個別ピクセルは読み込まない）
        
        const sectorStats = await this.loadSectorStatistics(bounds);
        
        return {
            pixels: new Map(), // 個別ピクセルは読み込まない
            sectorStats: sectorStats,
            totalPixels: 0,
            sectorsLoaded: sectorStats.size,
            cacheHits: 0,
            renderMode: 'tile'
        };
    }
    
    /**
     * ピクセルクエリの実行
     */
    async executePixelQuery(bounds) {
        const { data, error } = await this.supabase
            .from('pixels')
            .select('sector_x, sector_y, local_x, local_y, color')
            .gte('sector_x', bounds.sectors.left)
            .lte('sector_x', bounds.sectors.right)
            .gte('sector_y', bounds.sectors.top)
            .lte('sector_y', bounds.sectors.bottom)
            .limit(this.MAX_PIXELS_PER_REQUEST);
        
        if (error) throw error;
        
        const pixels = new Map();
        for (const pixel of data) {
            const pixelKey = `${pixel.sector_x},${pixel.sector_y},${pixel.local_x},${pixel.local_y}`;
            pixels.set(pixelKey, pixel);
        }
        
        return {
            pixels: pixels,
            totalPixels: pixels.size,
            sectorsLoaded: bounds.sectors.total,
            cacheHits: 0
        };
    }
    
    /**
     * セクター並列読み込み
     */
    async loadSectorsParallel(sectors) {
        const batchPromises = [];
        
        // セクターをバッチに分割
        for (let i = 0; i < sectors.length; i += this.BATCH_SIZE) {
            const batch = sectors.slice(i, i + this.BATCH_SIZE);
            batchPromises.push(this.loadSectorBatch(batch));
        }
        
        // 並列実行
        const batchResults = await Promise.all(batchPromises);
        
        // 結果統合とキャッシュ
        const allPixels = new Map();
        for (const batchPixels of batchResults) {
            for (const [pixelKey, pixelData] of batchPixels) {
                allPixels.set(pixelKey, pixelData);
            }
        }
        
        return allPixels;
    }
    
    /**
     * セクターバッチ読み込み
     */
    async loadSectorBatch(sectorBatch) {
        const sectorConditions = sectorBatch.map(s => 
            `(sector_x.eq.${s.sectorX},sector_y.eq.${s.sectorY})`
        ).join(',');
        
        const { data, error } = await this.supabase
            .from('pixels')
            .select('sector_x, sector_y, local_x, local_y, color')
            .or(sectorConditions);
        
        if (error) throw error;
        
        // セクター別にグループ化してキャッシュ
        const sectorPixels = new Map();
        const allPixels = new Map();
        
        for (const pixel of data) {
            const sectorKey = `${pixel.sector_x},${pixel.sector_y}`;
            const pixelKey = `${pixel.sector_x},${pixel.sector_y},${pixel.local_x},${pixel.local_y}`;
            
            if (!sectorPixels.has(sectorKey)) {
                sectorPixels.set(sectorKey, new Map());
            }
            
            sectorPixels.get(sectorKey).set(pixelKey, pixel);
            allPixels.set(pixelKey, pixel);
        }
        
        // セクターキャッシュ更新
        for (const sector of sectorBatch) {
            const sectorData = sectorPixels.get(sector.sectorKey) || new Map();
            this.cacheSector(sector.sectorKey, sectorData);
        }
        
        return allPixels;
    }
    
    /**
     * セクター統計読み込み
     */
    async loadSectorStatistics(bounds) {
        const { data, error } = await this.supabase
            .from('sectors')
            .select('sector_x, sector_y, pixel_count, is_active')
            .gte('sector_x', bounds.sectors.left)
            .lte('sector_x', bounds.sectors.right)
            .gte('sector_y', bounds.sectors.top)
            .lte('sector_y', bounds.sectors.bottom);
        
        if (error) throw error;
        
        const stats = new Map();
        for (const sector of data) {
            const sectorKey = `${sector.sector_x},${sector.sector_y}`;
            stats.set(sectorKey, sector);
        }
        
        return stats;
    }
    
    /**
     * キャッシュ管理
     */
    isCacheValid(key) {
        const timestamp = this.sectorTimestamps.get(key);
        return timestamp && (Date.now() - timestamp < this.CACHE_DURATION);
    }
    
    isSectorCached(sectorKey) {
        return this.isCacheValid(sectorKey) && this.sectorCache.has(sectorKey);
    }
    
    cacheSector(sectorKey, pixelData) {
        this.sectorCache.set(sectorKey, pixelData);
        this.sectorTimestamps.set(sectorKey, Date.now());
    }
    
    cacheResult(key, result) {
        this.sectorTimestamps.set(key, Date.now());
    }
    
    getCachedResult(key) {
        // 実装省略（キャッシュから結果取得）
        return { pixels: new Map(), totalPixels: 0, cacheHits: 1 };
    }
    
    /**
     * キャッシュクリア
     */
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, timestamp] of this.sectorTimestamps) {
            if (now - timestamp > this.CACHE_DURATION) {
                this.sectorCache.delete(key);
                this.sectorTimestamps.delete(key);
            }
        }
    }
}
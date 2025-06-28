// ピクセルデータローダー
/**
 * ピクセルデータローダークラス
 * データベースとストレージからのデータ読み込みを担当
 */
export class PixelDataLoader {
    constructor(pixelDataCore) {
        this.core = pixelDataCore;
        this.networkClient = null;
        this.storageService = null;
        
        // ローディング状態
        this.isLoading = false;
        this.loadingProgress = 0;
        this.loadingSessions = new Map();
        
        console.log('📥 PixelDataLoader initialized');
    }
    
    /**
     * サービス設定
     */
    setServices(networkClient, storageService) {
        this.networkClient = networkClient;
        this.storageService = storageService;
    }
    
    /**
     * データロード
     */
    async loadData(options = {}) {
        const {
            source = 'auto',
            progressive = true,
            batchSize = 1000,
            maxPixels = 50000
        } = options;
        
        if (this.isLoading) {
            console.warn('📥 Already loading data');
            return;
        }
        
        this.isLoading = true;
        this.loadingProgress = 0;
        
        try {
            let loadedPixels = 0;
            
            if (source === 'storage' || source === 'auto') {
                loadedPixels = await this.loadFromStorage();
                console.log(`📥 Loaded ${loadedPixels} pixels from storage`);
            }
            
            if ((source === 'network' || source === 'auto') && loadedPixels < maxPixels) {
                const networkPixels = await this.loadFromNetwork({
                    progressive,
                    batchSize,
                    maxPixels: maxPixels - loadedPixels
                });
                loadedPixels += networkPixels;
                console.log(`📥 Loaded ${networkPixels} pixels from network`);
            }
            
            console.log(`📥 Total loaded: ${loadedPixels} pixels`);
            return loadedPixels;
            
        } catch (error) {
            console.error('📥 Data loading failed:', error);
            throw error;
        } finally {
            this.isLoading = false;
            this.loadingProgress = 100;
        }
    }
    
    /**
     * ストレージからロード
     */
    async loadFromStorage() {
        if (!this.storageService) {
            return 0;
        }
        
        try {
            let loadedCount = 0;
            
            // アクティブセクターをロード
            for (const sectorKey of this.core.activeSectors) {
                const [sectorX, sectorY] = sectorKey.split(',').map(Number);
                const sectorData = await this.storageService.getSectorData(sectorX, sectorY);
                
                if (sectorData) {
                    const pixelCount = this.core.setSectorData(sectorX, sectorY, sectorData);
                    loadedCount += pixelCount;
                }
            }
            
            // セクター情報もロード
            const savedSectors = await this.storageService.getItem('active_sectors');
            if (savedSectors) {
                for (const sectorKey of savedSectors) {
                    this.core.activeSectors.add(sectorKey);
                }
            }
            
            return loadedCount;
        } catch (error) {
            console.error('📥 Storage loading error:', error);
            return 0;
        }
    }
    
    /**
     * ネットワークからロード
     */
    async loadFromNetwork(options = {}) {
        if (!this.networkClient) {
            return 0;
        }
        
        const {
            progressive = true,
            batchSize = 1000,
            maxPixels = 50000
        } = options;
        
        let totalLoaded = 0;
        let offset = 0;
        
        try {
            while (totalLoaded < maxPixels) {
                const currentBatchSize = Math.min(batchSize, maxPixels - totalLoaded);
                
                console.log(`📥 Loading batch: offset=${offset}, size=${currentBatchSize}`);
                
                const batch = await this.networkClient.getPixelsBatch(offset, currentBatchSize);
                
                if (!batch || batch.length === 0) {
                    console.log('📥 No more data available');
                    break;
                }
                
                // バッチをピクセルデータに変換
                const batchLoaded = this.processBatch(batch);
                totalLoaded += batchLoaded;
                offset += currentBatchSize;
                
                // プログレス更新
                this.loadingProgress = Math.min(95, (totalLoaded / maxPixels) * 100);
                
                // プログレッシブモードでない場合は一括読み込み
                if (!progressive) {
                    break;
                }
                
                // 過負荷防止のための待機
                await this.delay(10);
            }
            
            return totalLoaded;
        } catch (error) {
            console.error('📥 Network loading error:', error);
            return totalLoaded;
        }
    }
    
    /**
     * バッチ処理
     */
    processBatch(batch) {
        let processedCount = 0;
        
        for (const pixel of batch) {
            try {
                const { sector_x, sector_y, local_x, local_y, color } = pixel;
                
                if (this.core.setPixel(sector_x, sector_y, local_x, local_y, color)) {
                    processedCount++;
                }
            } catch (error) {
                console.warn('📥 Invalid pixel data:', pixel, error);
            }
        }
        
        return processedCount;
    }
    
    /**
     * セクター範囲ロード
     */
    async loadSectorRange(minSectorX, minSectorY, maxSectorX, maxSectorY) {
        const sessionId = `range_${Date.now()}`;
        this.loadingSessions.set(sessionId, {
            type: 'range',
            progress: 0,
            total: (maxSectorX - minSectorX + 1) * (maxSectorY - minSectorY + 1)
        });
        
        let loadedCount = 0;
        let processedSectors = 0;
        
        try {
            for (let sectorX = minSectorX; sectorX <= maxSectorX; sectorX++) {
                for (let sectorY = minSectorY; sectorY <= maxSectorY; sectorY++) {
                    const sectorLoaded = await this.loadSector(sectorX, sectorY);
                    loadedCount += sectorLoaded;
                    processedSectors++;
                    
                    // プログレス更新
                    const session = this.loadingSessions.get(sessionId);
                    if (session) {
                        session.progress = (processedSectors / session.total) * 100;
                    }
                }
            }
            
            return loadedCount;
        } finally {
            this.loadingSessions.delete(sessionId);
        }
    }
    
    /**
     * 単一セクターロード
     */
    async loadSector(sectorX, sectorY) {
        // まずストレージから試行
        if (this.storageService) {
            const sectorData = await this.storageService.getSectorData(sectorX, sectorY);
            if (sectorData) {
                return this.core.setSectorData(sectorX, sectorY, sectorData);
            }
        }
        
        // ネットワークから取得
        if (this.networkClient) {
            try {
                const sectorPixels = await this.networkClient.getSectorPixels(sectorX, sectorY);
                if (sectorPixels && sectorPixels.length > 0) {
                    return this.processBatch(sectorPixels);
                }
            } catch (error) {
                console.warn(`📥 Failed to load sector ${sectorX},${sectorY}:`, error);
            }
        }
        
        return 0;
    }
    
    /**
     * プリロード
     */
    async preloadSectors(sectorList) {
        const sessionId = `preload_${Date.now()}`;
        this.loadingSessions.set(sessionId, {
            type: 'preload',
            progress: 0,
            total: sectorList.length
        });
        
        let loadedCount = 0;
        
        try {
            for (let i = 0; i < sectorList.length; i++) {
                const { sectorX, sectorY } = sectorList[i];
                const sectorLoaded = await this.loadSector(sectorX, sectorY);
                loadedCount += sectorLoaded;
                
                // プログレス更新
                const session = this.loadingSessions.get(sessionId);
                if (session) {
                    session.progress = ((i + 1) / session.total) * 100;
                }
                
                // 負荷軽減
                if (i % 10 === 0) {
                    await this.delay(1);
                }
            }
            
            return loadedCount;
        } finally {
            this.loadingSessions.delete(sessionId);
        }
    }
    
    /**
     * 遅延読み込み
     */
    async lazyLoadSector(sectorX, sectorY) {
        const sectorKey = this.core.generateSectorKey(sectorX, sectorY);
        
        // 既にロード済みかチェック
        if (this.core.activeSectors.has(sectorKey)) {
            return true;
        }
        
        const loadedCount = await this.loadSector(sectorX, sectorY);
        
        if (loadedCount > 0) {
            this.core.activeSectors.add(sectorKey);
            return true;
        }
        
        return false;
    }
    
    /**
     * ローディング状態取得
     */
    getLoadingState() {
        return {
            isLoading: this.isLoading,
            progress: this.loadingProgress,
            activeSessions: this.loadingSessions.size,
            sessions: Object.fromEntries(this.loadingSessions)
        };
    }
    
    /**
     * 優先度付きロード
     */
    async loadWithPriority(requests) {
        // 優先度順にソート
        const sortedRequests = requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        let totalLoaded = 0;
        
        for (const request of sortedRequests) {
            const { type, sectorX, sectorY, range } = request;
            let loaded = 0;
            
            switch (type) {
                case 'sector':
                    loaded = await this.loadSector(sectorX, sectorY);
                    break;
                
                case 'range':
                    loaded = await this.loadSectorRange(
                        range.minX, range.minY, range.maxX, range.maxY
                    );
                    break;
            }
            
            totalLoaded += loaded;
        }
        
        return totalLoaded;
    }
    
    /**
     * ユーティリティ: 遅延
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            isLoading: this.isLoading,
            progress: this.loadingProgress,
            activeSessions: this.loadingSessions.size,
            hasNetworkClient: !!this.networkClient,
            hasStorageService: !!this.storageService
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.isLoading = false;
        this.loadingSessions.clear();
        console.log('📥 PixelDataLoader destroyed');
    }
}
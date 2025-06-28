// ピクセルデータ同期管理
/**
 * ピクセルデータ同期管理クラス
 * リアルタイム同期と自動保存を担当
 */
export class PixelDataSync {
    constructor(pixelDataCore) {
        this.core = pixelDataCore;
        this.realtimeService = null;
        this.storageService = null;
        
        // 自動保存設定
        this.autosaveInterval = 30000; // 30秒間隔
        this.autosaveTimer = null;
        this.isSaving = false;
        
        // 同期状態
        this.lastSyncTime = Date.now();
        this.syncQueue = [];
        this.isOnline = navigator.onLine;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        // オンライン状態監視
        this.setupOnlineMonitoring();
        
        console.log('🔄 PixelDataSync initialized');
    }
    
    /**
     * サービス設定
     */
    setServices(realtimeService, storageService) {
        this.realtimeService = realtimeService;
        this.storageService = storageService;
        
        // リアルタイム更新のリスナー設定
        if (this.realtimeService) {
            this.realtimeService.addPixelListener((pixelData) => {
                this.handleRemotePixelUpdate(pixelData);
            });
        }
    }
    
    /**
     * 自動保存設定
     */
    setupAutosave() {
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer);
        }
        
        this.autosaveTimer = setInterval(() => {
            this.autosave();
        }, this.autosaveInterval);
        
        console.log(`🔄 Autosave enabled: ${this.autosaveInterval}ms interval`);
    }
    
    /**
     * オンライン状態監視
     */
    setupOnlineMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🔄 Network online - resuming sync');
            this.processSyncQueue();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('🔄 Network offline - queuing changes');
        });
    }
    
    /**
     * 自動保存実行
     */
    async autosave() {
        if (this.isSaving) {
            return;
        }
        
        const dirtyPixels = this.core.getDirtyPixels();
        if (dirtyPixels.length === 0) {
            return;
        }
        
        try {
            await this.saveChanges(dirtyPixels);
            console.log(`🔄 Autosave completed: ${dirtyPixels.length} pixels`);
        } catch (error) {
            console.error('🔄 Autosave failed:', error);
        }
    }
    
    /**
     * 変更保存
     */
    async saveChanges(dirtyPixels = null) {
        if (this.isSaving) {
            console.warn('🔄 Save already in progress');
            return false;
        }
        
        this.isSaving = true;
        
        try {
            const pixelsToSave = dirtyPixels || this.core.getDirtyPixels();
            
            if (pixelsToSave.length === 0) {
                return true;
            }
            
            // ローカルストレージに保存
            if (this.storageService) {
                await this.saveToStorage(pixelsToSave);
            }
            
            // ネットワークに送信（オンラインの場合）
            if (this.isOnline && this.realtimeService) {
                await this.syncToNetwork(pixelsToSave);
            } else {
                // オフラインの場合はキューに追加
                this.addToSyncQueue(pixelsToSave);
            }
            
            // 保存済みとしてマーク
            const savedKeys = pixelsToSave.map(p => p.key);
            this.core.markClean(savedKeys);
            
            this.lastSyncTime = Date.now();
            return true;
            
        } catch (error) {
            console.error('🔄 Save failed:', error);
            return false;
        } finally {
            this.isSaving = false;
        }
    }
    
    /**
     * ストレージに保存
     */
    async saveToStorage(pixelsToSave) {
        if (!this.storageService) {
            return;
        }
        
        // セクター別にグループ化
        const sectorGroups = new Map();
        
        for (const pixel of pixelsToSave) {
            const sectorKey = `${pixel.sectorX},${pixel.sectorY}`;
            if (!sectorGroups.has(sectorKey)) {
                sectorGroups.set(sectorKey, []);
            }
            sectorGroups.get(sectorKey).push(pixel);
        }
        
        // セクターごとに保存
        for (const [sectorKey, pixels] of sectorGroups.entries()) {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            const sectorData = this.core.getSectorPixels(sectorX, sectorY);
            
            await this.storageService.saveSectorData(sectorX, sectorY, sectorData);
        }
        
        // アクティブセクター情報も保存
        await this.storageService.setItem('active_sectors', Array.from(this.core.activeSectors));
    }
    
    /**
     * ネットワークに同期
     */
    async syncToNetwork(pixelsToSave) {
        if (!this.realtimeService) {
            return;
        }
        
        // バッチサイズで分割
        const batchSize = 100;
        const batches = [];
        
        for (let i = 0; i < pixelsToSave.length; i += batchSize) {
            batches.push(pixelsToSave.slice(i, i + batchSize));
        }
        
        // バッチごとに送信
        for (const batch of batches) {
            try {
                await this.realtimeService.sendPixelUpdates(batch);
            } catch (error) {
                console.warn('🔄 Network sync failed for batch:', error);
                // 失敗したバッチはキューに追加
                this.addToSyncQueue(batch);
            }
        }
    }
    
    /**
     * 同期キューに追加
     */
    addToSyncQueue(pixels) {
        this.syncQueue.push(...pixels);
        
        // キューサイズ制限
        if (this.syncQueue.length > 10000) {
            this.syncQueue = this.syncQueue.slice(-5000); // 最新5000件のみ保持
        }
    }
    
    /**
     * 同期キュー処理
     */
    async processSyncQueue() {
        if (!this.isOnline || this.syncQueue.length === 0) {
            return;
        }
        
        const queueToProcess = [...this.syncQueue];
        this.syncQueue = [];
        
        try {
            await this.syncToNetwork(queueToProcess);
            console.log(`🔄 Sync queue processed: ${queueToProcess.length} pixels`);
        } catch (error) {
            console.error('🔄 Sync queue processing failed:', error);
            // 失敗した場合は再度キューに戻す
            this.syncQueue.unshift(...queueToProcess);
        }
    }
    
    /**
     * リモートピクセル更新処理
     */
    handleRemotePixelUpdate(pixelData) {
        const { sectorX, sectorY, localX, localY, color, userId, timestamp } = pixelData;
        
        // 自分の更新でない場合のみ適用
        if (userId !== this.getCurrentUserId()) {
            // リモート更新として設定（ダーティマークしない）
            const oldColor = this.core.getPixel(sectorX, sectorY, localX, localY);
            
            if (oldColor !== color) {
                // 直接設定（変更通知は送信しない）
                const key = this.core.generatePixelKey(sectorX, sectorY, localX, localY);
                this.core.pixels.set(key, color);
                
                // セクターカウント更新
                this.core.updateSectorCount(sectorX, sectorY, oldColor === undefined ? 1 : 0);
                
                // セクターをアクティブに設定
                this.core.activeSectors.add(this.core.generateSectorKey(sectorX, sectorY));
                
                // UI更新通知
                this.core.notifyPixelChange({
                    sectorX, sectorY, localX, localY, color, oldColor,
                    action: 'remote_update',
                    userId, timestamp
                });
            }
        }
    }
    
    /**
     * 現在のユーザーID取得
     */
    getCurrentUserId() {
        // 実装は環境に依存
        return localStorage.getItem('pixelcanvas_user_id') || 'anonymous';
    }
    
    /**
     * 強制同期
     */
    async forceSync() {
        console.log('🔄 Starting force sync...');
        
        const dirtyPixels = this.core.getDirtyPixels();
        const success = await this.saveChanges(dirtyPixels);
        
        if (success) {
            await this.processSyncQueue();
        }
        
        console.log(`🔄 Force sync completed: ${success ? 'success' : 'failed'}`);
        return success;
    }
    
    /**
     * 自動保存間隔設定
     */
    setAutosaveInterval(interval) {
        this.autosaveInterval = Math.max(5000, interval); // 最小5秒
        this.setupAutosave();
        console.log(`🔄 Autosave interval set to ${this.autosaveInterval}ms`);
    }
    
    /**
     * 自動保存停止
     */
    stopAutosave() {
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer);
            this.autosaveTimer = null;
            console.log('🔄 Autosave stopped');
        }
    }
    
    /**
     * 同期状態取得
     */
    getSyncState() {
        return {
            isOnline: this.isOnline,
            isSaving: this.isSaving,
            lastSyncTime: this.lastSyncTime,
            queueSize: this.syncQueue.length,
            dirtyPixelCount: this.core.dirtyPixels.size,
            autosaveEnabled: !!this.autosaveTimer
        };
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            ...this.getSyncState(),
            autosaveInterval: this.autosaveInterval,
            hasRealtimeService: !!this.realtimeService,
            hasStorageService: !!this.storageService
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.stopAutosave();
        this.syncQueue = [];
        
        // イベントリスナー削除
        window.removeEventListener('online', this.setupOnlineMonitoring);
        window.removeEventListener('offline', this.setupOnlineMonitoring);
        
        console.log('🔄 PixelDataSync destroyed');
    }
}
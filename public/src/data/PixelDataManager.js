// ピクセルデータ統合管理システム
import { PixelDataCore } from './pixel/PixelDataCore.js';
import { PixelDataLoader } from './pixel/PixelDataLoader.js';
import { PixelDataSync } from './pixel/PixelDataSync.js';

/**
 * ピクセルデータの統合管理クラス
 * コア、ローダー、同期機能を統合して管理
 */
export class PixelDataManager {
    constructor() {
        // コンポーネント初期化
        this.core = new PixelDataCore();
        this.loader = new PixelDataLoader(this.core);
        this.sync = new PixelDataSync(this.core);
        
        // 依存サービス（遅延初期化）
        this.networkClient = null;
        this.storageService = null;
        this.realtimeService = null;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    async initialize() {
        try {
            // 依存サービスの遅延読み込み
            await this.initializeServices();
            
            // 自動保存設定
            this.sync.setupAutosave();
            
            console.log('💾 PixelDataManager initialized');
        } catch (error) {
            console.error('💾 PixelDataManager initialization failed:', error);
        }
    }
    
    /**
     * 依存サービス初期化
     */
    async initializeServices() {
        try {
            const { NetworkClient } = await import('./NetworkClient.js');
            this.networkClient = new NetworkClient();
            
            const { StorageService } = await import('./StorageService.js');
            this.storageService = new StorageService();
            
            const { RealtimeService } = await import('./RealtimeService.js');
            this.realtimeService = new RealtimeService();
            
            // サービスを各コンポーネントに設定
            this.loader.setServices(this.networkClient, this.storageService);
            this.sync.setServices(this.realtimeService, this.storageService);
            
        } catch (error) {
            console.error('💾 Service initialization failed:', error);
        }
    }
    
    /**
     * ピクセル設定
     */
    setPixel(sectorX, sectorY, localX, localY, color) {
        return this.core.setPixel(sectorX, sectorY, localX, localY, color);
    }
    
    /**
     * ピクセル取得
     */
    getPixel(sectorX, sectorY, localX, localY) {
        return this.core.getPixel(sectorX, sectorY, localX, localY);
    }
    
    /**
     * ピクセル削除
     */
    removePixel(sectorX, sectorY, localX, localY) {
        return this.core.removePixel(sectorX, sectorY, localX, localY);
    }
    
    /**
     * セクター内ピクセル取得
     */
    getSectorPixels(sectorX, sectorY) {
        return this.core.getSectorPixels(sectorX, sectorY);
    }
    
    /**
     * セクター範囲内ピクセル取得
     */
    getPixelsInRange(minSectorX, minSectorY, maxSectorX, maxSectorY) {
        return this.core.getPixelsInRange(minSectorX, minSectorY, maxSectorX, maxSectorY);
    }
    
    /**
     * 複数ピクセル一括設定
     */
    setMultiplePixels(pixelData) {
        return this.core.setMultiplePixels(pixelData);
    }
    
    /**
     * 変更リスナー追加
     */
    addChangeListener(listener) {
        return this.core.addChangeListener(listener);
    }
    
    /**
     * 変更リスナー削除
     */
    removeChangeListener(listener) {
        return this.core.removeChangeListener(listener);
    }
    
    /**
     * データロード
     */
    async loadData(options = {}) {
        return await this.loader.loadData(options);
    }
    
    /**
     * セクター範囲ロード
     */
    async loadSectorRange(minSectorX, minSectorY, maxSectorX, maxSectorY) {
        return await this.loader.loadSectorRange(minSectorX, minSectorY, maxSectorX, maxSectorY);
    }
    
    /**
     * 単一セクターロード
     */
    async loadSector(sectorX, sectorY) {
        return await this.loader.loadSector(sectorX, sectorY);
    }
    
    /**
     * 遅延読み込み
     */
    async lazyLoadSector(sectorX, sectorY) {
        return await this.loader.lazyLoadSector(sectorX, sectorY);
    }
    
    /**
     * プリロード
     */
    async preloadSectors(sectorList) {
        return await this.loader.preloadSectors(sectorList);
    }
    
    /**
     * 変更保存
     */
    async saveChanges() {
        return await this.sync.saveChanges();
    }
    
    /**
     * 強制同期
     */
    async forceSync() {
        return await this.sync.forceSync();
    }
    
    /**
     * 自動保存間隔設定
     */
    setAutosaveInterval(interval) {
        return this.sync.setAutosaveInterval(interval);
    }
    
    /**
     * 自動保存停止
     */
    stopAutosave() {
        return this.sync.stopAutosave();
    }
    
    /**
     * セクター統計取得
     */
    getSectorStats(sectorX, sectorY) {
        return this.core.getSectorStats(sectorX, sectorY);
    }
    
    /**
     * ローディング状態取得
     */
    getLoadingState() {
        return this.loader.getLoadingState();
    }
    
    /**
     * 同期状態取得
     */
    getSyncState() {
        return this.sync.getSyncState();
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            core: this.core.getStats(),
            loader: this.loader.getStats(),
            sync: this.sync.getStats()
        };
    }
    
    /**
     * キャッシュ最適化
     */
    optimizeCache() {
        return this.core.optimizeCache();
    }
    
    /**
     * データクリア
     */
    clear() {
        this.core.clear();
    }
    
    /**
     * デバッグ情報
     */
    debugInfo() {
        this.core.debugInfo();
        
        const stats = this.getStats();
        console.log('💾 PixelDataManager Additional Info:', {
            loader: stats.loader,
            sync: stats.sync
        });
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.loader.destroy();
        this.sync.destroy();
        this.core.clear();
        
        console.log('💾 PixelDataManager destroyed');
    }
}
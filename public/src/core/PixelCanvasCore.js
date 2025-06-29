// PixelCanvas コアアプリケーション
import { CONFIG } from '../../Config.js';

/**
 * PixelCanvas メインアプリケーションクラス
 * 統合管理とオーケストレーション担当
 */
export class PixelCanvasCore {
    constructor() {
        // DOM要素
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.container = document.getElementById('canvasContainer');
        
        // コアサービス（遅延初期化）
        this.stateManager = null;
        this.renderStrategy = null;
        this.pixelDataManager = null;
        this.viewportManager = null;
        this.eventManager = null;
        
        // アプリケーション状態
        this.isInitialized = false;
        this.isDestroyed = false;
        
        // 初期化状態追跡
        this.initializationSteps = {
            services: false,
            rendering: false,
            data: false,
            events: false,
            ui: false
        };
        
        console.log('🎯 PixelCanvasCore constructor completed');
    }
    
    /**
     * アプリケーション初期化
     */
    async initialize() {
        if (this.isInitialized || this.isDestroyed) {
            return;
        }
        
        try {
            console.log('🎯 Starting PixelCanvas initialization...');
            
            // 段階的初期化
            await this.initializeServices();
            await this.initializeRendering();
            await this.initializeData();
            await this.initializeEvents();
            await this.initializeUI();
            
            this.isInitialized = true;
            console.log('🎯 PixelCanvas initialization completed successfully');
            
            // 初期レンダリング
            this.render();
            
        } catch (error) {
            console.error('🎯 PixelCanvas initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * コアサービス初期化
     */
    async initializeServices() {
        try {
            console.log('🎯 Initializing core services...');
            
            // StateManager初期化
            const { StateManager } = await import('./StateManager.js');
            this.stateManager = new StateManager();
            await this.stateManager.initialize();
            
            // ViewportManager初期化
            const { ViewportManager } = await import('../render/ViewportManager.js');
            this.viewportManager = new ViewportManager();
            this.viewportManager.setCanvasSize(
                this.container.clientWidth,
                this.container.clientHeight
            );
            
            // デフォルトビューに設定（セクター0,0を中央に）
            this.viewportManager.initializeDefaultView();
            
            // PixelDataManager初期化
            const { PixelDataManager } = await import('../data/PixelDataManager.js');
            this.pixelDataManager = new PixelDataManager();
            await this.pixelDataManager.initialize();
            
            this.initializationSteps.services = true;
            console.log('✅ Core services initialized');
            
        } catch (error) {
            console.error('❌ Core services initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * レンダリング初期化
     */
    async initializeRendering() {
        try {
            console.log('🎯 Initializing rendering system...');
            
            // RenderStrategy初期化
            const { RenderStrategy } = await import('../render/RenderStrategy.js');
            this.renderStrategy = new RenderStrategy(this.canvas, this.pixelDataManager.core);
            await this.renderStrategy.initialize();
            
            // キャンバス設定
            this.setupCanvas();
            
            // ビューポート変更リスナー
            this.viewportManager.addChangeListener((viewport) => {
                this.render();
            });
            
            this.initializationSteps.rendering = true;
            console.log('✅ Rendering system initialized');
            
        } catch (error) {
            console.error('❌ Rendering initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * データ初期化
     */
    async initializeData() {
        try {
            console.log('🎯 Initializing data systems...');
            
            // ピクセルデータ変更リスナー
            this.pixelDataManager.addChangeListener((changeData) => {
                this.handlePixelChange(changeData);
            });
            
            // 初期データロード
            const loadedCount = await this.pixelDataManager.loadData({
                source: 'auto',
                progressive: true,
                maxPixels: 50000
            });
            
            console.log(`📊 Loaded ${loadedCount} pixels`);
            console.log(`📊 Total pixels in memory: ${this.pixelDataManager.getStats().core.totalPixels}`);
            
            // テスト用ピクセル注入（確実に何かが表示されるように）
            this.injectTestPixels();
            
            // 初回レンダリング実行
            this.render();
            console.log(`🎨 Initial render completed`);
            
            this.initializationSteps.data = true;
            console.log('✅ Data systems initialized');
            
        } catch (error) {
            console.error('❌ Data initialization failed:', error);
            // データロード失敗は非致命的
            this.initializationSteps.data = true;
        }
    }
    
    /**
     * イベント初期化
     */
    async initializeEvents() {
        try {
            console.log('🎯 Initializing event systems...');
            
            // EventManager初期化
            const { EventManager } = await import('../ui/EventManager.js');
            this.eventManager = new EventManager(this.canvas, this.viewportManager);
            
            // イベントリスナー設定
            this.eventManager.addPixelClickListener((worldX, worldY) => {
                this.handlePixelClick(worldX, worldY);
            });
            
            // ウィンドウリサイズ
            window.addEventListener('resize', () => {
                this.handleResize();
            });
            
            this.initializationSteps.events = true;
            console.log('✅ Event systems initialized');
            
        } catch (error) {
            console.error('❌ Event initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * UI初期化
     */
    async initializeUI() {
        try {
            console.log('🎯 Initializing UI systems...');
            
            // ControlsManager初期化
            const { ControlsManager } = await import('../ui/ControlsManager.js');
            this.controlsManager = new ControlsManager(this.stateManager);
            
            // DebugManager初期化（開発モード時のみ）
            if (CONFIG.DEBUG_MODE) {
                const { DebugManager } = await import('../ui/DebugManager.js');
                this.debugManager = new DebugManager(this);
            }
            
            // UI状態同期
            this.stateManager.addChangeListener((state) => {
                this.handleStateChange(state);
            });
            
            this.initializationSteps.ui = true;
            console.log('✅ UI systems initialized');
            
        } catch (error) {
            console.error('❌ UI initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * キャンバス設定
     */
    setupCanvas() {
        this.resizeCanvas();
        
        // キャンバス属性設定
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = 'crisp-edges';
    }
    
    /**
     * キャンバスリサイズ
     */
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // 論理サイズ設定
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // 物理サイズ設定
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // コンテキストスケール調整
        this.ctx.scale(dpr, dpr);
        
        // ビューポート更新
        if (this.viewportManager) {
            this.viewportManager.setCanvasSize(rect.width, rect.height);
        }
        
        // 再描画
        this.render();
    }
    
    /**
     * ウィンドウリサイズ処理
     */
    handleResize() {
        this.resizeCanvas();
    }
    
    /**
     * ピクセルクリック処理
     */
    async handlePixelClick(worldX, worldY) {
        try {
            // 座標をローカル座標に変換
            const sectorX = Math.floor(worldX / CONFIG.GRID_SIZE);
            const sectorY = Math.floor(worldY / CONFIG.GRID_SIZE);
            const localX = worldX - sectorX * CONFIG.GRID_SIZE;
            const localY = worldY - sectorY * CONFIG.GRID_SIZE;
            
            // 範囲チェック
            if (localX < 0 || localX >= CONFIG.GRID_SIZE || 
                localY < 0 || localY >= CONFIG.GRID_SIZE) {
                console.warn('🎯 Click outside valid bounds');
                return;
            }
            
            // ピクセル存在チェック
            if (this.pixelDataManager.getPixel(sectorX, sectorY, localX, localY) !== null) {
                console.log('🎯 Pixel already exists at this position');
                return;
            }
            
            // 現在の色を取得
            const currentColor = this.stateManager.getCurrentColor();
            
            // ピクセル設定
            const success = this.pixelDataManager.setPixel(sectorX, sectorY, localX, localY, currentColor);
            
            if (success) {
                console.log(`🎯 Pixel placed at (${worldX}, ${worldY}) with color ${currentColor}`);
                this.render();
            }
            
        } catch (error) {
            console.error('🎯 Pixel click handling failed:', error);
        }
    }
    
    /**
     * ピクセル変更処理
     */
    handlePixelChange(changeData) {
        // レンダリング更新
        this.render();
        
        // UI更新（ピクセル数表示など）
        if (this.controlsManager) {
            this.controlsManager.updatePixelCount(this.pixelDataManager.pixels.size);
        }
    }
    
    /**
     * 状態変更処理
     */
    handleStateChange(state) {
        // ビューポート状態が変更された場合
        if (state.viewport) {
            this.render();
        }
        
        // レンダリング設定が変更された場合
        if (state.rendering && this.renderStrategy) {
            this.renderStrategy.updateSettings(state.rendering);
        }
    }
    
    /**
     * メイン描画処理
     */
    render() {
        if (!this.isInitialized || this.isDestroyed || !this.renderStrategy) {
            console.log(`🎨 Render skipped: initialized=${this.isInitialized}, destroyed=${this.isDestroyed}, strategy=${!!this.renderStrategy}`);
            return;
        }
        
        try {
            const viewport = this.viewportManager.getState();
            const totalPixels = this.pixelDataManager.getStats().core.totalPixels;
            console.log(`🎨 Rendering with ${totalPixels} total pixels, viewport:`, viewport);
            this.renderStrategy.render(viewport);
            console.log(`🎨 Render completed successfully`);
        } catch (error) {
            console.error('🎯 Render failed:', error);
        }
    }
    
    /**
     * 指定座標にフォーカス
     */
    focusOnCoordinate(worldX, worldY, scale = null) {
        if (this.viewportManager) {
            this.viewportManager.focusOn(worldX, worldY, scale);
        }
    }
    
    /**
     * セクターにフォーカス
     */
    focusOnSector(sectorX, sectorY, scale = null) {
        if (this.viewportManager) {
            this.viewportManager.focusOnSector(sectorX, sectorY, scale);
        }
    }
    
    /**
     * テスト用ピクセル注入（デバッグ・検証用）
     */
    injectTestPixels() {
        try {
            const testPixels = [
                // セクター(0,0)の左上角に明確に見えるピクセル
                { sectorX: 0, sectorY: 0, localX: 0, localY: 0, color: 2 },   // 赤
                { sectorX: 0, sectorY: 0, localX: 1, localY: 0, color: 3 },   // 緑
                { sectorX: 0, sectorY: 0, localX: 2, localY: 0, color: 4 },   // 青
                { sectorX: 0, sectorY: 0, localX: 0, localY: 1, color: 5 },   // 黄
                { sectorX: 0, sectorY: 0, localX: 1, localY: 1, color: 6 },   // マゼンタ
                { sectorX: 0, sectorY: 0, localX: 2, localY: 1, color: 7 },   // シアン
                
                // セクター中央付近にも配置
                { sectorX: 0, sectorY: 0, localX: 128, localY: 128, color: 1 }, // 白
                { sectorX: 0, sectorY: 0, localX: 129, localY: 128, color: 2 }, // 赤
                { sectorX: 0, sectorY: 0, localX: 128, localY: 129, color: 3 }, // 緑
                { sectorX: 0, sectorY: 0, localX: 129, localY: 129, color: 4 }, // 青
            ];
            
            let injectedCount = 0;
            testPixels.forEach(pixel => {
                if (this.pixelDataManager.setPixel(pixel.sectorX, pixel.sectorY, pixel.localX, pixel.localY, pixel.color)) {
                    injectedCount++;
                }
            });
            
            console.log(`🧪 Injected ${injectedCount} test pixels for visualization`);
            console.log(`🎯 Test pixels placed at sector (0,0) positions: (0,0), (1,0), (2,0), (0,1), (1,1), (2,1) and center area`);
            
        } catch (error) {
            console.warn('⚠️ Failed to inject test pixels:', error);
        }
    }

    /**
     * アプリケーション統計取得
     */
    getStats() {
        const stats = {
            initialized: this.isInitialized,
            destroyed: this.isDestroyed,
            initializationSteps: { ...this.initializationSteps }
        };
        
        if (this.pixelDataManager) {
            stats.data = this.pixelDataManager.getStats();
        }
        
        if (this.renderStrategy) {
            stats.rendering = this.renderStrategy.getInfo();
        }
        
        if (this.viewportManager) {
            stats.viewport = this.viewportManager.getState();
        }
        
        if (this.stateManager) {
            stats.state = this.stateManager.getState();
        }
        
        return stats;
    }
    
    /**
     * デバッグ情報出力
     */
    debugInfo() {
        const stats = this.getStats();
        console.log('🎯 PixelCanvas Debug Info:', stats);
        
        if (this.viewportManager) {
            this.viewportManager.debugInfo();
        }
        
        if (this.debugManager) {
            this.debugManager.showDebugPanel();
        }
    }
    
    /**
     * 手動データ保存
     */
    async saveData() {
        if (this.pixelDataManager) {
            await this.pixelDataManager.saveData(true);
        }
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        if (this.stateManager) {
            this.stateManager.updateConfig(newConfig);
        }
    }
    
    /**
     * アプリケーション解放
     */
    destroy() {
        if (this.isDestroyed) {
            return;
        }
        
        console.log('🎯 Destroying PixelCanvas...');
        
        // イベントリスナー削除
        window.removeEventListener('resize', this.handleResize);
        
        // サービス解放
        if (this.eventManager) {
            this.eventManager.destroy();
        }
        
        if (this.controlsManager) {
            this.controlsManager.destroy();
        }
        
        if (this.debugManager) {
            this.debugManager.destroy();
        }
        
        if (this.renderStrategy) {
            this.renderStrategy.destroy();
        }
        
        if (this.pixelDataManager) {
            this.pixelDataManager.destroy();
        }
        
        if (this.viewportManager) {
            this.viewportManager.destroy();
        }
        
        if (this.stateManager) {
            this.stateManager.destroy();
        }
        
        this.isDestroyed = true;
        this.isInitialized = false;
        
        console.log('🎯 PixelCanvas destroyed');
    }
}
// 統一レンダリング戦略パターン
import { CONFIG } from '../../Config.js';

/**
 * レンダリング戦略の列挙
 */
export const RenderMode = {
    CANVAS2D: 'canvas2d',
    PIXI: 'pixi',
    AUTO: 'auto'
};

/**
 * レンダリング戦略マネージャー
 * 複数のレンダラーを統一インターフェースで管理
 */
export class RenderStrategy {
    constructor(canvas, pixelStorage) {
        this.canvas = canvas;
        this.pixelStorage = pixelStorage;
        this.currentRenderer = null;
        this.availableRenderers = new Map();
        this.renderMode = CONFIG.RENDER_MODE || RenderMode.AUTO;
        this.isInitialized = false;
        
        // パフォーマンス監視
        this.performanceStats = {
            frameCount: 0,
            averageFrameTime: 16.67, // 60fps target
            lastFrameTime: performance.now()
        };
        
        // 非同期初期化は外部から明示的に呼び出す
        console.log('🎨 RenderStrategy constructor completed');
    }
    
    /**
     * レンダラー初期化
     */
    async initialize() {
        try {
            // Canvas2Dレンダラーは常に利用可能
            const { Canvas2DRenderer } = await import('./Canvas2DRenderer.js');
            this.availableRenderers.set(RenderMode.CANVAS2D, Canvas2DRenderer);
            
            // PixiJSレンダラー（オプション）
            if (window.PIXI && CONFIG.USE_PIXI_RENDERER) {
                try {
                    const { PixiRenderer } = await import('./PixiRenderer.js');
                    this.availableRenderers.set(RenderMode.PIXI, PixiRenderer);
                } catch (error) {
                    console.warn('🎨 PixiRenderer not available:', error.message);
                    // Canvas2Dのみ使用
                }
            }
            
            // 最適なレンダラーを選択
            this.selectOptimalRenderer();
            
            this.isInitialized = true;
            console.log('✅ RenderStrategy initialization completed');
            
        } catch (error) {
            console.error('🎨 Render strategy initialization failed:', error);
            // フォールバック: Canvas2Dを強制使用
            this.setRenderer(RenderMode.CANVAS2D);
            this.isInitialized = true;
            console.log('⚠️ RenderStrategy fallback to Canvas2D');
        }
    }
    
    /**
     * 最適なレンダラーを自動選択
     */
    selectOptimalRenderer() {
        if (this.renderMode === RenderMode.AUTO) {
            // パフォーマンス条件に基づいて選択
            const pixelCount = this.pixelStorage.pixels.size;
            const devicePixelRatio = window.devicePixelRatio || 1;
            const isMobile = /Mobi|Android/i.test(navigator.userAgent);
            
            if (pixelCount > 10000 && !isMobile && this.availableRenderers.has(RenderMode.PIXI)) {
                this.setRenderer(RenderMode.PIXI);
            } else {
                this.setRenderer(RenderMode.CANVAS2D);
            }
        } else {
            this.setRenderer(this.renderMode);
        }
    }
    
    /**
     * レンダラーを設定
     */
    setRenderer(mode) {
        if (!this.availableRenderers.has(mode)) {
            console.warn(`🎨 Renderer ${mode} not available, using Canvas2D`);
            mode = RenderMode.CANVAS2D;
        }
        
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
        }
        
        const RendererClass = this.availableRenderers.get(mode);
        this.currentRenderer = new RendererClass(this.canvas, this.pixelStorage);
        this.renderMode = mode;
        
        console.log(`🎨 Switched to ${mode} renderer`);
    }
    
    /**
     * メイン描画処理
     */
    render(viewport) {
        if (!this.isInitialized) {
            console.warn('🎨 RenderStrategy not initialized yet, skipping render');
            return;
        }
        
        if (!this.currentRenderer) {
            console.error('🎨 No renderer available');
            return;
        }
        
        const startTime = performance.now();
        
        try {
            this.currentRenderer.render(viewport);
            this.updatePerformanceStats(startTime);
        } catch (error) {
            console.error('🎨 Render error:', error);
            // エラー時はCanvas2Dにフォールバック
            if (this.renderMode !== RenderMode.CANVAS2D) {
                console.log('🎨 Falling back to Canvas2D renderer');
                this.setRenderer(RenderMode.CANVAS2D);
            }
        }
    }
    
    /**
     * パフォーマンス統計更新
     */
    updatePerformanceStats(startTime) {
        const frameTime = performance.now() - startTime;
        this.performanceStats.frameCount++;
        
        // 移動平均でフレーム時間を計算
        const alpha = 0.1;
        this.performanceStats.averageFrameTime = 
            this.performanceStats.averageFrameTime * (1 - alpha) + frameTime * alpha;
        
        // パフォーマンスが低下している場合は自動切り替え
        if (this.renderMode === RenderMode.AUTO && 
            this.performanceStats.averageFrameTime > 33 && // 30fps以下
            this.performanceStats.frameCount > 60) { // 十分なサンプル数
            
            this.optimizeRenderer();
        }
    }
    
    /**
     * レンダラー最適化
     */
    optimizeRenderer() {
        if (this.renderMode === RenderMode.PIXI && 
            this.availableRenderers.has(RenderMode.CANVAS2D)) {
            console.log('🎨 Performance degradation detected, switching to Canvas2D');
            this.setRenderer(RenderMode.CANVAS2D);
        }
    }
    
    /**
     * レンダラー情報取得
     */
    getInfo() {
        return {
            currentMode: this.renderMode,
            availableModes: Array.from(this.availableRenderers.keys()),
            performanceStats: { ...this.performanceStats },
            rendererInfo: this.currentRenderer?.getInfo?.() || null
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
            this.currentRenderer = null;
        }
        this.availableRenderers.clear();
    }
}
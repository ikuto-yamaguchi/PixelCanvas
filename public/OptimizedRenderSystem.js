// 最適化レンダリングシステム統合コントローラー
import { ViewportCalculator } from './ViewportCalculator.js';
import { ViewportDataLoader } from './ViewportDataLoader.js';
import { AdaptiveRenderer } from './AdaptiveRenderer.js';
import { CONFIG } from './Config.js';

export class OptimizedRenderSystem {
    constructor(canvas, ctx, supabaseClient) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // 3つのコアシステム初期化
        this.viewportCalculator = new ViewportCalculator();
        this.dataLoader = new ViewportDataLoader(supabaseClient);
        this.adaptiveRenderer = new AdaptiveRenderer(canvas, ctx);
        
        
        // レンダリング制御
        this.isRendering = false;
        this.renderQueue = [];
        this.lastRenderTime = 0;
        this.renderThrottle = 16; // 60fps
        
        // パフォーマンス監視
        this.performanceMonitor = {
            totalRenders: 0,
            averageFrameTime: 0,
            dataLoadTime: 0,
            renderTime: 0
        };
    }
    
    /**
     * メイン描画関数 - 最高効率で画面を描画
     */
    async render(offsetX, offsetY, scale, showGrid = false) {
        // レンダリング中の重複実行防止
        if (this.isRendering) {
            this.queueRender(offsetX, offsetY, scale, showGrid);
            return;
        }
        
        this.isRendering = true;
        const totalStartTime = performance.now();
        
        try {
            // 1. 画面内セクター・ピクセル範囲を高速計算 (O(1))
            const calcStartTime = performance.now();
            const bounds = this.viewportCalculator.calculateVisibleBounds(
                offsetX, offsetY, scale, this.canvas.width, this.canvas.height
            );
            const calcTime = performance.now() - calcStartTime;
            
            // 2. 画面範囲データを効率的に取得
            const dataStartTime = performance.now();
            const pixelData = await this.dataLoader.loadViewportData(bounds);
            const dataTime = performance.now() - dataStartTime;
            
            // データ取得エラーチェック
            if (pixelData.error) {
                return;
            }
            
            // 3. ズームレベルに応じて最適描画
            const renderStartTime = performance.now();
            const renderPriority = this.viewportCalculator.calculateRenderPriority(bounds);
            
            // bounds に必要なプロパティを追加
            bounds.offsetX = offsetX;
            bounds.offsetY = offsetY;
            
            this.adaptiveRenderer.render(bounds, pixelData, renderPriority);
            const renderTime = performance.now() - renderStartTime;
            
            // パフォーマンス統計更新
            this.updatePerformanceStats(calcTime, dataTime, renderTime);
            
            const totalTime = performance.now() - totalStartTime;
            
        } catch (error) {
            
            // フォールバック: 従来の描画方式
            await this.fallbackRender(offsetX, offsetY, scale);
            
        } finally {
            this.isRendering = false;
            
            // キューに待機中のレンダリングがあれば実行
            this.processRenderQueue();
        }
    }
    
    /**
     * レンダリングキュー管理
     */
    queueRender(offsetX, offsetY, scale, showGrid) {
        // 最新のリクエストのみ保持（古いものは破棄）
        this.renderQueue = [{offsetX, offsetY, scale, showGrid, timestamp: Date.now()}];
    }
    
    processRenderQueue() {
        if (this.renderQueue.length > 0 && !this.isRendering) {
            const request = this.renderQueue.shift();
            
            // 古すぎるリクエストは無視
            if (Date.now() - request.timestamp < 100) {
                setTimeout(() => {
                    this.render(request.offsetX, request.offsetY, request.scale, request.showGrid);
                }, 0);
            }
        }
    }
    
    /**
     * スロットル付きレンダリング
     */
    renderThrottled(offsetX, offsetY, scale, showGrid = false) {
        const now = performance.now();
        if (now - this.lastRenderTime >= this.renderThrottle) {
            this.render(offsetX, offsetY, scale, showGrid);
            this.lastRenderTime = now;
        } else {
            this.queueRender(offsetX, offsetY, scale, showGrid);
        }
    }
    
    /**
     * フォールバック描画（従来方式）
     */
    async fallbackRender(offsetX, offsetY, scale) {
        
        // 従来のRenderEngineに委譲する処理をここに実装
        // 現在は簡単なクリアのみ
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 簡単なメッセージ表示
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.fillRect(10, 10, 200, 50);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('Fallback Mode', 20, 35);
    }
    
    /**
     * スケールモード取得
     */
    getScaleMode(scaleInfo) {
        if (scaleInfo.isHighDetail) return 'HIGH_DETAIL';
        if (scaleInfo.isMediumDetail) return 'MEDIUM_DETAIL';
        return 'LOW_DETAIL';
    }
    
    /**
     * パフォーマンス統計更新
     */
    updatePerformanceStats(calcTime, dataTime, renderTime) {
        this.performanceMonitor.totalRenders++;
        
        const totalFrameTime = calcTime + dataTime + renderTime;
        this.performanceMonitor.averageFrameTime = 
            (this.performanceMonitor.averageFrameTime * (this.performanceMonitor.totalRenders - 1) + totalFrameTime) 
            / this.performanceMonitor.totalRenders;
            
        this.performanceMonitor.dataLoadTime = dataTime;
        this.performanceMonitor.renderTime = renderTime;
    }
    
    /**
     * パフォーマンス統計取得
     */
    getPerformanceStats() {
        const renderStats = this.adaptiveRenderer.getPerformanceStats();
        
        return {
            system: this.performanceMonitor,
            renderer: renderStats,
            dataLoader: {
                cacheHitRate: 0 // TODO: データローダーから取得
            },
            overall: {
                fps: this.performanceMonitor.averageFrameTime > 0 ? 
                     Math.round(1000 / this.performanceMonitor.averageFrameTime) : 0,
                efficiency: this.performanceMonitor.averageFrameTime <= 16 ? 'excellent' : 
                           this.performanceMonitor.averageFrameTime <= 33 ? 'good' : 'poor'
            }
        };
    }
    
    /**
     * 特定座標のピクセル描画（高速）
     */
    async drawPixelOptimized(worldX, worldY, color) {
        // 座標計算（高速）
        const coords = this.viewportCalculator.worldToSectorLocal(worldX, worldY);
        
        // ローカルキャッシュ更新
        const cachedSector = this.dataLoader.sectorCache.get(coords.sectorKey) || new Map();
        cachedSector.set(coords.pixelKey, {
            sector_x: coords.sectorX,
            sector_y: coords.sectorY,
            local_x: coords.localX,
            local_y: coords.localY,
            color: color
        });
        this.dataLoader.cacheSector(coords.sectorKey, cachedSector);
        
        // 部分再描画（該当ピクセルのみ）
        await this.renderPixelRegion(worldX, worldY, color);
        
        return coords;
    }
    
    /**
     * 部分ピクセル描画
     */
    async renderPixelRegion(worldX, worldY, color) {
        // 現在のビューポート設定を取得（メインシステムから）
        // これは実装時に具体的な値を取得するよう修正が必要
        const offsetX = 0; // TODO: 実際の値を取得
        const offsetY = 0; // TODO: 実際の値を取得  
        const scale = 1;   // TODO: 実際の値を取得
        
        const scaledPixelSize = CONFIG.PIXEL_SIZE * scale;
        const screenX = worldX * scaledPixelSize + offsetX;
        const screenY = worldY * scaledPixelSize + offsetY;
        
        // 画面内の場合のみ描画
        if (screenX >= 0 && screenY >= 0 && 
            screenX < this.canvas.width && screenY < this.canvas.height) {
            
            this.ctx.fillStyle = CONFIG.COLORS[color];
            this.ctx.fillRect(screenX, screenY, scaledPixelSize, scaledPixelSize);
        }
    }
    
    /**
     * キャッシュクリア
     */
    clearCache() {
        this.dataLoader.sectorCache.clear();
        this.dataLoader.sectorTimestamps.clear();
        this.viewportCalculator.cache.result = null;
    }
    
    /**
     * Supabaseクライアントを後から設定
     */
    updateSupabaseClient(supabaseClient) {
        this.dataLoader.supabase = supabaseClient;
    }
    
    /**
     * システム停止
     */
    destroy() {
        this.clearCache();
        this.renderQueue = [];
        this.isRendering = false;
    }
}
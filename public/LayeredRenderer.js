// レイヤー対応高速レンダリングエンジン
import { CONFIG, Utils } from './Config.js';

export class LayeredRenderer {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.layerManager = null; // Will be set by main
        this.canvas = pixelCanvas.canvas;
        this.ctx = pixelCanvas.ctx;
        
        // レンダリング最適化
        this.renderCache = new Map();
        this.lastLayer = null;
        this.lastZoom = null;
        this.lastBounds = null;
        
        // パフォーマンス設定
        this.maxRenderTime = 16; // 16ms (60fps target)
        this.renderBatchSize = 1000; // 一度に描画する要素数
    }
    
    /**
     * メインレンダリング関数
     */
    async render() {
        // LayerManagerが初期化されていない場合はフォールバック
        if (!this.layerManager || !this.layerManager.supabase) {
            console.log('⚠️ Layer system not ready, using fallback rendering');
            this.pixelCanvas.renderEngine.render();
            return;
        }
        
        const startTime = performance.now();
        
        try {
            // 現在の表示設定取得
            const zoomLevel = this.pixelCanvas.scale;
            const bounds = this.calculateViewportBounds();
            
            // 最適レイヤー決定
            const optimalLayer = this.layerManager.getOptimalLayer(zoomLevel);
            
            // レイヤー切り替えチェック
            const layerChanged = this.layerManager.switchToLayer(optimalLayer);
            
            // キャッシュチェック
            if (!layerChanged && this.isCacheValid(optimalLayer, zoomLevel, bounds)) {
                return; // キャッシュヒット
            }
            
            // 画面クリア
            this.clearCanvas();
            
            // レイヤーデータ読み込み（軽量）
            const layerData = await this.layerManager.loadLayerData(optimalLayer, bounds);
            
            // レイヤーデータが空の場合は従来レンダリング
            if (layerData.length === 0) {
                console.log('📊 No layer data, using pixel storage rendering');
                this.renderFromPixelStorage(bounds);
            } else {
                // レイヤー別レンダリング実行
                await this.renderLayer(optimalLayer, layerData, bounds);
            }
            
            // グリッド描画
            if (this.pixelCanvas.showGrid) {
                this.renderGrid(optimalLayer, bounds);
            }
            
            // セクター情報描画
            this.renderSectorInfo(bounds);
            
            // キャッシュ更新
            this.updateCache(optimalLayer, zoomLevel, bounds);
            
            const renderTime = performance.now() - startTime;
            console.log(`🎯 Layer ${optimalLayer.name} rendered in ${renderTime.toFixed(1)}ms`);
            
        } catch (error) {
            console.error('❌ Layered render failed:', error);
            
            // フォールバック: 従来のレンダリング
            this.pixelCanvas.renderEngine.render();
        }
    }
    
    /**
     * PixelStorageからの直接レンダリング
     */
    renderFromPixelStorage(bounds) {
        const pixelStorage = this.pixelCanvas.pixelStorage;
        let rendered = 0;
        
        // 画面内のピクセルを直接描画
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY; sectorY++) {
                for (let localX = 0; localX < CONFIG.GRID_SIZE; localX++) {
                    for (let localY = 0; localY < CONFIG.GRID_SIZE; localY++) {
                        const color = pixelStorage.getPixel(sectorX, sectorY, localX, localY);
                        if (color !== undefined) {
                            // ワールド座標からスクリーン座標に変換
                            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
                            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
                            const screenX = (worldX - this.pixelCanvas.offsetX) * this.pixelCanvas.scale;
                            const screenY = (worldY - this.pixelCanvas.offsetY) * this.pixelCanvas.scale;
                            
                            // 画面外チェック
                            if (screenX >= -1 && screenY >= -1 && 
                                screenX <= this.canvas.width + 1 && 
                                screenY <= this.canvas.height + 1) {
                                
                                const pixelColor = CONFIG.PALETTE[color] || '#000000';
                                this.ctx.fillStyle = pixelColor;
                                
                                const pixelSize = Math.max(1, this.pixelCanvas.scale);
                                this.ctx.fillRect(screenX, screenY, pixelSize, pixelSize);
                                rendered++;
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`📊 Rendered ${rendered} pixels from storage`);
    }
    
    /**
     * レイヤー別レンダリング実行
     */
    async renderLayer(layer, layerData, bounds) {
        const startTime = performance.now();
        let rendered = 0;
        
        // バッチレンダリングで処理を分割
        for (let i = 0; i < layerData.length; i += this.renderBatchSize) {
            const batch = layerData.slice(i, i + this.renderBatchSize);
            
            for (const data of batch) {
                this.renderLayerElement(layer, data);
                rendered++;
            }
            
            // フレーム時間チェック
            if (performance.now() - startTime > this.maxRenderTime) {
                // 次フレームで続行
                await this.nextFrame();
                break;
            }
        }
        
        console.log(`📊 Rendered ${rendered}/${layerData.length} ${layer.name} elements`);
    }
    
    /**
     * レイヤー要素の個別レンダリング
     */
    renderLayerElement(layer, data) {
        const pixelCoords = this.layerManager.layerToPixelCoords(
            data.local_x, 
            data.local_y, 
            layer
        );
        
        // セクター座標からワールド座標に変換
        const worldX = data.sector_x * CONFIG.GRID_SIZE + pixelCoords.pixelX;
        const worldY = data.sector_y * CONFIG.GRID_SIZE + pixelCoords.pixelY;
        
        // スクリーン座標に変換
        const screenX = (worldX - this.pixelCanvas.offsetX) * this.pixelCanvas.scale;
        const screenY = (worldY - this.pixelCanvas.offsetY) * this.pixelCanvas.scale;
        
        // 画面外チェック
        if (screenX < -layer.blockSize || screenY < -layer.blockSize || 
            screenX > this.canvas.width + layer.blockSize || 
            screenY > this.canvas.height + layer.blockSize) {
            return;
        }
        
        // 色設定
        const color = CONFIG.PALETTE[data.color] || '#000000';
        this.ctx.fillStyle = color;
        
        // レイヤーブロックサイズで描画
        const renderSize = Math.max(1, layer.blockSize * this.pixelCanvas.scale);
        this.ctx.fillRect(screenX, screenY, renderSize, renderSize);
    }
    
    /**
     * レイヤー対応グリッド描画
     */
    renderGrid(layer, bounds) {
        const gridSpacing = layer.blockSize;
        const scale = this.pixelCanvas.scale;
        
        // グリッドが見える最小スケール
        if (scale < 0.1) return;
        
        this.ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        // 垂直線
        for (let x = bounds.minX; x <= bounds.maxX; x += gridSpacing) {
            const screenX = (x - this.pixelCanvas.offsetX) * scale;
            this.ctx.moveTo(screenX, 0);
            this.ctx.lineTo(screenX, this.canvas.height);
        }
        
        // 水平線
        for (let y = bounds.minY; y <= bounds.maxY; y += gridSpacing) {
            const screenY = (y - this.pixelCanvas.offsetY) * scale;
            this.ctx.moveTo(0, screenY);
            this.ctx.lineTo(this.canvas.width, screenY);
        }
        
        this.ctx.stroke();
    }
    
    /**
     * ビューポート範囲計算
     */
    calculateViewportBounds() {
        const padding = 100; // 画面外余白
        
        const minX = Math.floor((this.pixelCanvas.offsetX - padding) / this.pixelCanvas.scale);
        const maxX = Math.ceil((this.pixelCanvas.offsetX + this.canvas.width + padding) / this.pixelCanvas.scale);
        const minY = Math.floor((this.pixelCanvas.offsetY - padding) / this.pixelCanvas.scale);
        const maxY = Math.ceil((this.pixelCanvas.offsetY + this.canvas.height + padding) / this.pixelCanvas.scale);
        
        return {
            minX, maxX, minY, maxY,
            minSectorX: Math.floor(minX / CONFIG.GRID_SIZE),
            maxSectorX: Math.ceil(maxX / CONFIG.GRID_SIZE),
            minSectorY: Math.floor(minY / CONFIG.GRID_SIZE),
            maxSectorY: Math.ceil(maxY / CONFIG.GRID_SIZE)
        };
    }
    
    /**
     * キャッシュ有効性チェック
     */
    isCacheValid(layer, zoomLevel, bounds) {
        if (!this.lastLayer || !this.lastZoom || !this.lastBounds) {
            return false;
        }
        
        return (
            this.lastLayer.level === layer.level &&
            Math.abs(this.lastZoom - zoomLevel) < 0.01 &&
            Math.abs(this.lastBounds.minX - bounds.minX) < 10 &&
            Math.abs(this.lastBounds.maxX - bounds.maxX) < 10 &&
            Math.abs(this.lastBounds.minY - bounds.minY) < 10 &&
            Math.abs(this.lastBounds.maxY - bounds.maxY) < 10
        );
    }
    
    /**
     * キャッシュ更新
     */
    updateCache(layer, zoomLevel, bounds) {
        this.lastLayer = layer;
        this.lastZoom = zoomLevel;
        this.lastBounds = { ...bounds };
    }
    
    /**
     * 画面クリア
     */
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * セクター情報描画
     */
    renderSectorInfo(bounds) {
        // セクター境界線描画
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY; sectorY++) {
                const worldX = sectorX * CONFIG.GRID_SIZE;
                const worldY = sectorY * CONFIG.GRID_SIZE;
                const screenX = (worldX - this.pixelCanvas.offsetX) * this.pixelCanvas.scale;
                const screenY = (worldY - this.pixelCanvas.offsetY) * this.pixelCanvas.scale;
                const size = CONFIG.GRID_SIZE * this.pixelCanvas.scale;
                
                this.ctx.rect(screenX, screenY, size, size);
            }
        }
        
        this.ctx.stroke();
    }
    
    /**
     * 次フレーム待機
     */
    nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    /**
     * パフォーマンス統計取得
     */
    getPerformanceStats() {
        return {
            currentLayer: this.layerManager?.currentLayer?.name || 'none',
            cacheHit: this.isCacheValid(this.lastLayer, this.lastZoom, this.lastBounds),
            renderElements: this.renderCache.size
        };
    }
}
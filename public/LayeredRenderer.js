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
            
            // 🔧 FIXED: セクター境界線を常に表示（アクティブ/非アクティブの視覚化）
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
        const maxPixels = 100000; // 🚨 EMERGENCY: 65,536ピクセル完全対応
        
        console.log(`🔧 FIXED: Rendering from pixel storage. Scale: ${this.pixelCanvas.scale}, Bounds:`, bounds);
        
        // 🔧 FIXED: セクター範囲チェックを緩和
        const startTime = performance.now();
        const sectorCount = (bounds.maxSectorX - bounds.minSectorX + 1) * (bounds.maxSectorY - bounds.minSectorY + 1);
        
        if (sectorCount > 400) { // 100から400に緩和
            console.warn(`⚠️ Too many sectors (${sectorCount}), using fallback rendering`);
            this.pixelCanvas.renderEngine.render();
            return;
        }
        
        // 画面内のピクセルを直接描画
        let timeoutReached = false;
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX && !timeoutReached; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY && !timeoutReached; sectorY++) {
                // 🚨 EMERGENCY: 時間制限追加
                if (performance.now() - startTime > 50) {
                    console.warn('🚨 Rendering timeout, breaking early');
                    timeoutReached = true;
                    break;
                }
                
                // Skip sectors that have no pixels for performance
                const pixelCount = pixelStorage.getSectorPixelCount(sectorX, sectorY);
                if (pixelCount === 0) {
                    continue; // Skip empty sectors
                }
                
                for (let localX = 0; localX < CONFIG.GRID_SIZE && rendered < maxPixels && !timeoutReached; localX++) {
                    for (let localY = 0; localY < CONFIG.GRID_SIZE && rendered < maxPixels && !timeoutReached; localY++) {
                        const color = pixelStorage.getPixel(sectorX, sectorY, localX, localY);
                        if (color !== undefined) {
                            // ワールド座標からスクリーン座標に変換
                            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
                            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
                            
                            // 🔧 FIXED: 正しい座標変換に修正
                            const screenX = worldX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
                            const screenY = worldY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
                            
                            // 🔧 FIXED: More generous screen bounds checking to prevent culling
                            const pixelSize = Math.max(0.5, CONFIG.PIXEL_SIZE * this.pixelCanvas.scale);
                            if (screenX >= -pixelSize && screenY >= -pixelSize && 
                                screenX <= this.canvas.width + pixelSize && 
                                screenY <= this.canvas.height + pixelSize) {
                                
                                const pixelColor = CONFIG.PALETTE[color] || '#000000';
                                this.ctx.fillStyle = pixelColor;
                                
                                this.ctx.fillRect(screenX, screenY, pixelSize, pixelSize);
                                rendered++;
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`📊 Rendered ${rendered} pixels from storage at scale ${this.pixelCanvas.scale} in ${(performance.now() - startTime).toFixed(1)}ms`);
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
     * レイヤー要素の個別レンダリング - Fixed coordinate transformation
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
        
        // 🔧 FIXED: Correct world to screen coordinate transformation
        // Must match the inverse of input handling: screenCoord = worldCoord * PIXEL_SIZE * scale + offset
        const screenX = worldX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
        const screenY = worldY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
        
        // 画面外チェック
        const renderSize = Math.max(1, layer.blockSize * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale);
        if (screenX < -renderSize || screenY < -renderSize || 
            screenX > this.canvas.width + renderSize || 
            screenY > this.canvas.height + renderSize) {
            return;
        }
        
        // 色設定
        const color = CONFIG.PALETTE[data.color] || '#000000';
        this.ctx.fillStyle = color;
        
        // レイヤーブロックサイズで描画
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
     * ビューポート範囲計算 - Fixed coordinate transformation
     */
    calculateViewportBounds() {
        // 🚨 EMERGENCY: セーフガード追加でフリーズ防止
        const scale = Math.max(0.01, Math.min(16, this.pixelCanvas.scale || 1));
        const offsetX = Math.max(-100000, Math.min(100000, this.pixelCanvas.offsetX || 0));
        const offsetY = Math.max(-100000, Math.min(100000, this.pixelCanvas.offsetY || 0));
        const width = Math.max(100, Math.min(5000, this.canvas.width || 800));
        const height = Math.max(100, Math.min(5000, this.canvas.height || 600));
        
        const padding = 100;
        
        // 🔧 FIXED: Correct coordinate transformation to match input handling
        // Screen to world: (screenCoord - offset) / (PIXEL_SIZE * scale) = worldCoord
        const pixelSize = CONFIG.PIXEL_SIZE * scale;
        
        const minWorldX = Math.floor((-offsetX - padding) / pixelSize);
        const maxWorldX = Math.ceil((width - offsetX + padding) / pixelSize);
        const minWorldY = Math.floor((-offsetY - padding) / pixelSize);
        const maxWorldY = Math.ceil((height - offsetY + padding) / pixelSize);
        
        // 🔧 FIXED: セクター範囲制限を緩和
        const minSectorX = Math.max(-200, Math.floor(minWorldX / CONFIG.GRID_SIZE));
        const maxSectorX = Math.min(200, Math.ceil(maxWorldX / CONFIG.GRID_SIZE));
        const minSectorY = Math.max(-200, Math.floor(minWorldY / CONFIG.GRID_SIZE));
        const maxSectorY = Math.min(200, Math.ceil(maxWorldY / CONFIG.GRID_SIZE));
        
        console.log(`🔧 BOUNDS: world(${minWorldX},${minWorldY})-(${maxWorldX},${maxWorldY}) sectors(${minSectorX},${minSectorY})-(${maxSectorX},${maxSectorY}), scale:${scale}`);
        
        return {
            minX: minWorldX, maxX: maxWorldX, minY: minWorldY, maxY: maxWorldY,
            minSectorX, maxSectorX, minSectorY, maxSectorY
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
     * セクター情報描画 - Fixed coordinate transformation
     */
    renderSectorInfo(bounds) {
        // セクター境界線描画 - アクティブ/非アクティブで色分け
        this.ctx.lineWidth = 2;
        
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY; sectorY++) {
                const worldX = sectorX * CONFIG.GRID_SIZE;
                const worldY = sectorY * CONFIG.GRID_SIZE;
                
                // 🔧 FIXED: Correct world to screen coordinate transformation
                const screenX = worldX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
                const screenY = worldY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
                const size = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
                
                // Only draw if visible on screen
                if (screenX < this.canvas.width + size && screenX + size > 0 &&
                    screenY < this.canvas.height + size && screenY + size > 0) {
                    
                    // Check if sector is active
                    const sectorKey = `${sectorX},${sectorY}`;
                    const sectorState = this.pixelCanvas.sectorManager.getSectorState(sectorX, sectorY);
                    const isActiveFromDB = sectorState.isActive;
                    const isActiveFromClient = this.pixelCanvas.activeSectors.has(sectorKey);
                    const isActive = isActiveFromDB || isActiveFromClient;
                    const pixelCount = this.pixelCanvas.pixelStorage.getSectorPixelCount(sectorX, sectorY);
                    
                    // Draw sector boundary with appropriate color
                    if (isActive) {
                        // Active sector - green border
                        this.ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
                        this.ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
                    } else {
                        // Inactive sector - red border with dark overlay
                        this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    }
                    
                    // Draw filled rectangle for inactive sectors
                    if (!isActive) {
                        this.ctx.fillRect(screenX, screenY, size, size);
                    }
                    
                    // Draw border
                    this.ctx.strokeRect(screenX, screenY, size, size);
                    
                    // Add sector label if sector is large enough
                    if (size > 40) {
                        this.ctx.save();
                        this.ctx.font = `${Math.min(12, size / 8)}px monospace`;
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        
                        if (isActive) {
                            this.ctx.fillStyle = 'rgba(76, 175, 80, 0.9)';
                        } else {
                            this.ctx.fillStyle = 'rgba(244, 67, 54, 0.9)';
                        }
                        
                        const text = `(${sectorX},${sectorY})`;
                        this.ctx.fillText(text, screenX + size / 2, screenY + size / 2 - 10);
                        
                        if (pixelCount > 0) {
                            this.ctx.fillText(`${pixelCount}px`, screenX + size / 2, screenY + size / 2 + 10);
                        }
                        
                        // Show lock status for inactive sectors
                        if (!isActive && size > 60) {
                            this.ctx.font = `${Math.min(16, size / 6)}px monospace`;
                            this.ctx.fillStyle = 'rgba(244, 67, 54, 0.9)';
                            this.ctx.fillText('🔒 LOCKED', screenX + size / 2, screenY + size / 2 + 30);
                        }
                        
                        this.ctx.restore();
                    }
                }
            }
        }
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
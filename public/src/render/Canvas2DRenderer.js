// Canvas2D高性能レンダラー
import { CONFIG } from '../../Config.js';

/**
 * Canvas2D高性能レンダリング実装
 * 既存の複数レンダラーから最適化部分を統合
 */
export class Canvas2DRenderer {
    constructor(canvas, pixelStorage) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.pixelStorage = pixelStorage;
        
        // レンダリング設定
        this.maxPixelsPerFrame = 2000; // フレーム当たりの最大ピクセル数
        this.lodEnabled = true; // LOD（Level of Detail）有効
        this.cullingEnabled = true; // 視野外カリング有効
        
        // キャッシュ
        this.visiblePixelsCache = new Map();
        this.lastViewport = null;
        this.cacheValid = false;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        // Canvas設定最適化
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.globalCompositeOperation = 'source-over';
        
        console.log('🎨 Canvas2DRenderer initialized');
    }
    
    /**
     * メイン描画処理
     */
    render(viewport) {
        if (!viewport) {
            console.error('🎨 Viewport required for rendering');
            return;
        }
        
        // 画面クリア
        this.clearCanvas();
        
        // ピクセルが無い場合は早期リターン
        if (this.pixelStorage.pixels.size === 0) {
            return;
        }
        
        // ビューポート変更チェック
        if (!this.isViewportSame(viewport)) {
            this.invalidateCache();
            this.lastViewport = { ...viewport };
        }
        
        // 可視ピクセルを取得/キャッシュ
        const visiblePixels = this.getVisiblePixels(viewport);
        
        // LODレベル決定
        const lodLevel = this.calculateLOD(viewport.scale);
        
        // ピクセル描画
        this.renderPixels(visiblePixels, viewport, lodLevel);
    }
    
    /**
     * 画面クリア
     */
    clearCanvas() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * ビューポート変更チェック
     */
    isViewportSame(viewport) {
        if (!this.lastViewport) return false;
        
        return Math.abs(this.lastViewport.scale - viewport.scale) < 0.001 &&
               Math.abs(this.lastViewport.offsetX - viewport.offsetX) < 1 &&
               Math.abs(this.lastViewport.offsetY - viewport.offsetY) < 1;
    }
    
    /**
     * キャッシュ無効化
     */
    invalidateCache() {
        this.cacheValid = false;
        this.visiblePixelsCache.clear();
    }
    
    /**
     * 可視ピクセル取得
     */
    getVisiblePixels(viewport) {
        if (this.cacheValid && this.visiblePixelsCache.size > 0) {
            return this.visiblePixelsCache;
        }
        
        const { scale, offsetX, offsetY } = viewport;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // 可視範囲計算
        const visibleArea = {
            minX: Math.floor(-offsetX / (CONFIG.PIXEL_SIZE * scale)),
            minY: Math.floor(-offsetY / (CONFIG.PIXEL_SIZE * scale)),
            maxX: Math.ceil((canvasWidth - offsetX) / (CONFIG.PIXEL_SIZE * scale)),
            maxY: Math.ceil((canvasHeight - offsetY) / (CONFIG.PIXEL_SIZE * scale))
        };
        
        // マージン追加（画面外のピクセルも一部含める）
        const margin = 50;
        visibleArea.minX -= margin;
        visibleArea.minY -= margin;
        visibleArea.maxX += margin;
        visibleArea.maxY += margin;
        
        // 可視ピクセルフィルタリング
        this.visiblePixelsCache.clear();
        
        for (const [key, color] of this.pixelStorage.pixels) {
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
            
            if (worldX >= visibleArea.minX && worldX <= visibleArea.maxX &&
                worldY >= visibleArea.minY && worldY <= visibleArea.maxY) {
                this.visiblePixelsCache.set(key, {
                    worldX,
                    worldY,
                    color,
                    screenX: worldX * CONFIG.PIXEL_SIZE * scale + offsetX,
                    screenY: worldY * CONFIG.PIXEL_SIZE * scale + offsetY
                });
            }
        }
        
        this.cacheValid = true;
        return this.visiblePixelsCache;
    }
    
    /**
     * LODレベル計算
     */
    calculateLOD(scale) {
        if (!this.lodEnabled) return 1;
        
        if (scale > 2.0) return 1;      // 高解像度
        if (scale > 0.5) return 2;      // 中解像度  
        if (scale > 0.25) return 4;     // 低解像度
        return 8;                       // 最低解像度
    }
    
    /**
     * ピクセル描画
     */
    renderPixels(visiblePixels, viewport, lodLevel) {
        let renderedCount = 0;
        const maxPixels = Math.min(this.maxPixelsPerFrame, visiblePixels.size);
        
        console.log(`🎨 Rendering ${visiblePixels.size} visible pixels (max: ${maxPixels}, LOD: ${lodLevel})`);
        console.log(`🎨 Viewport: scale=${viewport.scale}, offset=(${viewport.offsetX.toFixed(2)}, ${viewport.offsetY.toFixed(2)})`);
        
        // 描画順序：画面中央から外側へ
        const sortedPixels = this.sortPixelsByDistance(visiblePixels, viewport);
        
        for (const [key, pixel] of sortedPixels) {
            if (renderedCount >= maxPixels) break;
            
            // LODスキップ
            if (lodLevel > 1 && renderedCount % lodLevel !== 0) {
                continue;
            }
            
            // スクリーン範囲チェック
            if (!this.isPixelOnScreen(pixel, viewport)) {
                continue;
            }
            
            // ピクセル描画
            this.drawPixel(pixel, viewport.scale);
            renderedCount++;
        }
        
        console.log(`🎨 Canvas2D rendered ${renderedCount}/${visiblePixels.size} pixels (LOD: ${lodLevel})`);
    }
    
    /**
     * ピクセルを距離でソート（画面中央から近い順）
     */
    sortPixelsByDistance(visiblePixels, viewport) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        return Array.from(visiblePixels.entries()).sort((a, b) => {
            const distA = Math.hypot(a[1].screenX - centerX, a[1].screenY - centerY);
            const distB = Math.hypot(b[1].screenX - centerX, b[1].screenY - centerY);
            return distA - distB;
        });
    }
    
    /**
     * ピクセルがスクリーン内にあるかチェック
     */
    isPixelOnScreen(pixel, viewport) {
        const pixelSize = CONFIG.PIXEL_SIZE * viewport.scale;
        return pixel.screenX + pixelSize >= 0 && 
               pixel.screenX <= this.canvas.width &&
               pixel.screenY + pixelSize >= 0 && 
               pixel.screenY <= this.canvas.height;
    }
    
    /**
     * 単一ピクセル描画
     */
    drawPixel(pixel, scale) {
        const pixelSize = Math.max(1, Math.round(CONFIG.PIXEL_SIZE * scale));
        
        this.ctx.fillStyle = CONFIG.PALETTE[pixel.color] || '#ffffff';
        this.ctx.fillRect(
            Math.round(pixel.screenX),
            Math.round(pixel.screenY),
            pixelSize,
            pixelSize
        );
    }
    
    /**
     * レンダラー情報取得
     */
    getInfo() {
        return {
            type: 'Canvas2D',
            maxPixelsPerFrame: this.maxPixelsPerFrame,
            lodEnabled: this.lodEnabled,
            cullingEnabled: this.cullingEnabled,
            cacheSize: this.visiblePixelsCache.size,
            cacheValid: this.cacheValid
        };
    }
    
    /**
     * 設定更新
     */
    updateSettings(settings) {
        if (settings.maxPixelsPerFrame !== undefined) {
            this.maxPixelsPerFrame = settings.maxPixelsPerFrame;
        }
        if (settings.lodEnabled !== undefined) {
            this.lodEnabled = settings.lodEnabled;
        }
        if (settings.cullingEnabled !== undefined) {
            this.cullingEnabled = settings.cullingEnabled;
        }
        
        this.invalidateCache();
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.invalidateCache();
        this.lastViewport = null;
        console.log('🎨 Canvas2DRenderer destroyed');
    }
}
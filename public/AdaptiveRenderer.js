// ズームレベル対応軽量描画システム
import { CONFIG } from './Config.js';

export class AdaptiveRenderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // レンダリングモード
        this.modes = {
            PIXEL_PERFECT: 'pixel_perfect',     // 1:1 ピクセル描画
            PIXEL_SCALED: 'pixel_scaled',       // スケール済みピクセル
            SECTOR_BLOCKS: 'sector_blocks',     // セクター単位ブロック
            TILE_HEATMAP: 'tile_heatmap'        // タイル密度ヒートマップ
        };
        
        // パフォーマンス制限
        this.limits = {
            maxPixelsPerFrame: 50000,
            maxSectorsPerFrame: 200,
            maxDrawCalls: 1000,
            frameTimeLimit: 16 // 60fps = 16ms per frame
        };
        
        // 描画統計
        this.stats = {
            lastRenderTime: 0,
            pixelsRendered: 0,
            sectorsRendered: 0,
            drawCalls: 0,
            frameTime: 0
        };
    }
    
    /**
     * メイン描画関数 - ズームレベルに応じて最適な方法で描画
     */
    render(bounds, pixelData, renderPriority) {
        const startTime = performance.now();
        this.resetStats();
        
        try {
            // 描画モード決定
            const mode = this.selectRenderMode(bounds, pixelData, renderPriority);
            
            // 背景クリア（効率的）
            this.clearViewport(bounds);
            
            // モード別描画実行
            switch (mode) {
                case this.modes.PIXEL_PERFECT:
                    this.renderPixelPerfect(bounds, pixelData);
                    break;
                case this.modes.PIXEL_SCALED:
                    this.renderPixelScaled(bounds, pixelData);
                    break;
                case this.modes.SECTOR_BLOCKS:
                    this.renderSectorBlocks(bounds, pixelData);
                    break;
                case this.modes.TILE_HEATMAP:
                    this.renderTileHeatmap(bounds, pixelData);
                    break;
            }
            
            // グリッド描画（必要に応じて）
            if (this.shouldRenderGrid(bounds)) {
                this.renderGrid(bounds);
            }
            
        } catch (error) {
            console.error('❌ Render error:', error);
        } finally {
            this.updateStats(startTime);
        }
    }
    
    /**
     * 描画モード選択ロジック
     */
    selectRenderMode(bounds, pixelData, priority) {
        const scale = bounds.scale.current;
        const pixelCount = pixelData.totalPixels || 0;
        const sectorCount = bounds.sectors.total;
        
        // 超高詳細: ピクセル完璧描画
        if (scale >= 2.0 && pixelCount <= this.limits.maxPixelsPerFrame) {
            return this.modes.PIXEL_PERFECT;
        }
        
        // 高詳細: スケール済みピクセル描画
        if (scale >= 0.5 && pixelCount <= this.limits.maxPixelsPerFrame) {
            return this.modes.PIXEL_SCALED;
        }
        
        // 中詳細: セクターブロック描画
        if (scale >= 0.1 && sectorCount <= this.limits.maxSectorsPerFrame) {
            return this.modes.SECTOR_BLOCKS;
        }
        
        // 低詳細: タイルヒートマップ
        return this.modes.TILE_HEATMAP;
    }
    
    /**
     * ピクセル完璧描画 (scale >= 2.0)
     */
    renderPixelPerfect(bounds, pixelData) {
        const scaledPixelSize = Math.floor(CONFIG.PIXEL_SIZE * bounds.scale.current);
        let pixelsRendered = 0;
        
        for (const [pixelKey, pixel] of pixelData.pixels) {
            if (pixelsRendered >= this.limits.maxPixelsPerFrame) break;
            
            const worldX = pixel.sector_x * CONFIG.GRID_SIZE + pixel.local_x;
            const worldY = pixel.sector_y * CONFIG.GRID_SIZE + pixel.local_y;
            
            const screenX = Math.floor(worldX * CONFIG.PIXEL_SIZE * bounds.scale.current + bounds.offsetX);
            const screenY = Math.floor(worldY * CONFIG.PIXEL_SIZE * bounds.scale.current + bounds.offsetY);
            
            // 画面内チェック
            if (this.isOnScreen(screenX, screenY, scaledPixelSize)) {
                this.ctx.fillStyle = CONFIG.COLORS[pixel.color];
                this.ctx.fillRect(screenX, screenY, scaledPixelSize, scaledPixelSize);
                pixelsRendered++;
                this.stats.drawCalls++;
            }
        }
        
        this.stats.pixelsRendered = pixelsRendered;
    }
    
    /**
     * スケール済みピクセル描画 (0.5 <= scale < 2.0)
     */
    renderPixelScaled(bounds, pixelData) {
        const scaledPixelSize = CONFIG.PIXEL_SIZE * bounds.scale.current;
        let pixelsRendered = 0;
        
        // バッチ描画最適化
        const colorBatches = new Map();
        
        // 色別にピクセルをグループ化
        for (const [pixelKey, pixel] of pixelData.pixels) {
            if (pixelsRendered >= this.limits.maxPixelsPerFrame) break;
            
            const worldX = pixel.sector_x * CONFIG.GRID_SIZE + pixel.local_x;
            const worldY = pixel.sector_y * CONFIG.GRID_SIZE + pixel.local_y;
            
            const screenX = worldX * scaledPixelSize + bounds.offsetX;
            const screenY = worldY * scaledPixelSize + bounds.offsetY;
            
            if (this.isOnScreen(screenX, screenY, scaledPixelSize)) {
                if (!colorBatches.has(pixel.color)) {
                    colorBatches.set(pixel.color, []);
                }
                colorBatches.get(pixel.color).push({screenX, screenY});
                pixelsRendered++;
            }
        }
        
        // 色別バッチ描画
        for (const [color, positions] of colorBatches) {
            this.ctx.fillStyle = CONFIG.COLORS[color];
            for (const {screenX, screenY} of positions) {
                this.ctx.fillRect(screenX, screenY, scaledPixelSize, scaledPixelSize);
            }
            this.stats.drawCalls++;
        }
        
        this.stats.pixelsRendered = pixelsRendered;
    }
    
    /**
     * セクターブロック描画 (0.1 <= scale < 0.5)
     */
    renderSectorBlocks(bounds, pixelData) {
        const sectorScreenSize = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE * bounds.scale.current;
        let sectorsRendered = 0;
        
        // セクター別ピクセル密度計算
        const sectorDensity = new Map();
        for (const [pixelKey, pixel] of pixelData.pixels) {
            const sectorKey = `${pixel.sector_x},${pixel.sector_y}`;
            sectorDensity.set(sectorKey, (sectorDensity.get(sectorKey) || 0) + 1);
        }
        
        // セクターブロック描画
        for (let sx = bounds.sectors.left; sx <= bounds.sectors.right; sx++) {
            for (let sy = bounds.sectors.top; sy <= bounds.sectors.bottom; sy++) {
                if (sectorsRendered >= this.limits.maxSectorsPerFrame) break;
                
                const sectorKey = `${sx},${sy}`;
                const density = sectorDensity.get(sectorKey) || 0;
                
                if (density > 0) {
                    const screenX = sx * sectorScreenSize + bounds.offsetX;
                    const screenY = sy * sectorScreenSize + bounds.offsetY;
                    
                    if (this.isOnScreen(screenX, screenY, sectorScreenSize)) {
                        // 密度に応じた色とアルファ
                        const intensity = Math.min(density / (CONFIG.GRID_SIZE * CONFIG.GRID_SIZE), 1);
                        const alpha = Math.max(0.1, intensity);
                        
                        this.ctx.fillStyle = `rgba(100, 150, 255, ${alpha})`;
                        this.ctx.fillRect(screenX, screenY, sectorScreenSize, sectorScreenSize);
                        
                        // 境界線
                        this.ctx.strokeStyle = `rgba(50, 100, 200, ${alpha * 2})`;
                        this.ctx.lineWidth = 1;
                        this.ctx.strokeRect(screenX, screenY, sectorScreenSize, sectorScreenSize);
                        
                        sectorsRendered++;
                        this.stats.drawCalls += 2;
                    }
                }
            }
        }
        
        this.stats.sectorsRendered = sectorsRendered;
    }
    
    /**
     * タイルヒートマップ描画 (scale < 0.1)
     */
    renderTileHeatmap(bounds, pixelData) {
        const tileSize = 64; // 固定タイルサイズ
        const tilesX = Math.ceil(this.canvas.width / tileSize);
        const tilesY = Math.ceil(this.canvas.height / tileSize);
        
        // タイル別密度計算
        const tileDensity = new Map();
        
        for (const [pixelKey, pixel] of pixelData.pixels) {
            const worldX = pixel.sector_x * CONFIG.GRID_SIZE + pixel.local_x;
            const worldY = pixel.sector_y * CONFIG.GRID_SIZE + pixel.local_y;
            
            const screenX = worldX * CONFIG.PIXEL_SIZE * bounds.scale.current + bounds.offsetX;
            const screenY = worldY * CONFIG.PIXEL_SIZE * bounds.scale.current + bounds.offsetY;
            
            const tileX = Math.floor(screenX / tileSize);
            const tileY = Math.floor(screenY / tileSize);
            const tileKey = `${tileX},${tileY}`;
            
            tileDensity.set(tileKey, (tileDensity.get(tileKey) || 0) + 1);
        }
        
        // ヒートマップ描画
        let tilesRendered = 0;
        for (let tx = 0; tx < tilesX; tx++) {
            for (let ty = 0; ty < tilesY; ty++) {
                const tileKey = `${tx},${ty}`;
                const density = tileDensity.get(tileKey) || 0;
                
                if (density > 0) {
                    const intensity = Math.min(density / 100, 1); // 100ピクセルで最大強度
                    const hue = (1 - intensity) * 240; // 青→赤
                    
                    this.ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.6)`;
                    this.ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
                    
                    tilesRendered++;
                    this.stats.drawCalls++;
                }
            }
        }
        
        this.stats.sectorsRendered = tilesRendered;
    }
    
    /**
     * 効率的な背景クリア
     */
    clearViewport(bounds) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * グリッド描画判定
     */
    shouldRenderGrid(bounds) {
        return bounds.scale.current >= 0.5; // 高ズーム時のみ
    }
    
    /**
     * グリッド描画
     */
    renderGrid(bounds) {
        const gridSize = CONFIG.PIXEL_SIZE * bounds.scale.current;
        
        if (gridSize < 2) return; // 小さすぎる場合は描画しない
        
        this.ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        this.ctx.lineWidth = 0.5;
        this.ctx.beginPath();
        
        // 垂直線
        for (let x = bounds.offsetX % gridSize; x < this.canvas.width; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        
        // 水平線
        for (let y = bounds.offsetY % gridSize; y < this.canvas.height; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        
        this.ctx.stroke();
        this.stats.drawCalls++;
    }
    
    /**
     * 画面内判定
     */
    isOnScreen(x, y, size) {
        return x + size >= 0 && y + size >= 0 && 
               x < this.canvas.width && y < this.canvas.height;
    }
    
    /**
     * 統計リセット
     */
    resetStats() {
        this.stats.pixelsRendered = 0;
        this.stats.sectorsRendered = 0;
        this.stats.drawCalls = 0;
    }
    
    /**
     * 統計更新
     */
    updateStats(startTime) {
        this.stats.frameTime = performance.now() - startTime;
        this.stats.lastRenderTime = Date.now();
    }
    
    /**
     * パフォーマンス統計取得
     */
    getPerformanceStats() {
        return {
            ...this.stats,
            fps: this.stats.frameTime > 0 ? Math.round(1000 / this.stats.frameTime) : 0,
            efficiency: this.stats.frameTime <= this.limits.frameTimeLimit ? 'good' : 'poor'
        };
    }
}
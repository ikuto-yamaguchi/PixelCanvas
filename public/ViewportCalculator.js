// 高速ビューポート計算エンジン
import { CONFIG } from './Config.js';

export class ViewportCalculator {
    constructor() {
        // 計算結果キャッシュ
        this.cache = {
            lastOffsetX: null,
            lastOffsetY: null,
            lastScale: null,
            lastCanvasWidth: null,
            lastCanvasHeight: null,
            result: null
        };
        
        // 定数（計算効率化）
        this.SECTOR_SIZE = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE; // 256 * 4 = 1024
        this.INV_SECTOR_SIZE = 1 / this.SECTOR_SIZE; // 除算→乗算変換
    }
    
    /**
     * 画面内の可視セクター・ピクセル範囲を高速計算
     * 計算コスト: O(1) - 定数時間
     */
    calculateVisibleBounds(offsetX, offsetY, scale, canvasWidth, canvasHeight) {
        // キャッシュヒット判定（高速）
        if (this.isCacheValid(offsetX, offsetY, scale, canvasWidth, canvasHeight)) {
            return this.cache.result;
        }
        
        // ビューポート計算（最適化済み）
        const result = this.computeVisibleBounds(offsetX, offsetY, scale, canvasWidth, canvasHeight);
        
        // キャッシュ更新
        this.updateCache(offsetX, offsetY, scale, canvasWidth, canvasHeight, result);
        
        return result;
    }
    
    /**
     * 実際の可視範囲計算（最適化済み）
     */
    computeVisibleBounds(offsetX, offsetY, scale, canvasWidth, canvasHeight) {
        const scaledPixelSize = CONFIG.PIXEL_SIZE * scale;
        
        // ワールド座標での可視範囲（浮動小数点計算）
        const worldLeft = -offsetX / scaledPixelSize;
        const worldTop = -offsetY / scaledPixelSize;
        const worldRight = worldLeft + canvasWidth / scaledPixelSize;
        const worldBottom = worldTop + canvasHeight / scaledPixelSize;
        
        // セクター範囲（整数計算、高速）
        const sectorLeft = Math.floor(worldLeft * this.INV_SECTOR_SIZE);
        const sectorTop = Math.floor(worldTop * this.INV_SECTOR_SIZE);
        const sectorRight = Math.floor(worldRight * this.INV_SECTOR_SIZE);
        const sectorBottom = Math.floor(worldBottom * this.INV_SECTOR_SIZE);
        
        // ピクセル範囲（セクター内）
        const result = {
            // ワールド座標
            world: {
                left: Math.floor(worldLeft),
                top: Math.floor(worldTop),
                right: Math.ceil(worldRight),
                bottom: Math.ceil(worldBottom),
                width: Math.ceil(worldRight) - Math.floor(worldLeft),
                height: Math.ceil(worldBottom) - Math.floor(worldTop)
            },
            
            // セクター範囲
            sectors: {
                left: sectorLeft,
                top: sectorTop, 
                right: sectorRight,
                bottom: sectorBottom,
                width: sectorRight - sectorLeft + 1,
                height: sectorBottom - sectorTop + 1,
                total: (sectorRight - sectorLeft + 1) * (sectorBottom - sectorTop + 1)
            },
            
            // スケール情報
            scale: {
                current: scale,
                pixelSize: scaledPixelSize,
                isHighDetail: scale >= 0.5,
                isMediumDetail: scale >= 0.25 && scale < 0.5,
                isLowDetail: scale < 0.25
            }
        };
        
        // セクター別ピクセル範囲の詳細計算（必要な場合のみ）
        if (result.scale.isHighDetail && result.sectors.total <= 16) {
            result.sectorDetails = this.calculateSectorPixelRanges(result, worldLeft, worldTop, worldRight, worldBottom);
        }
        
        return result;
    }
    
    /**
     * セクター内ピクセル範囲の詳細計算
     */
    calculateSectorPixelRanges(bounds, worldLeft, worldTop, worldRight, worldBottom) {
        const details = new Map();
        
        for (let sx = bounds.sectors.left; sx <= bounds.sectors.right; sx++) {
            for (let sy = bounds.sectors.top; sy <= bounds.sectors.bottom; sy++) {
                const sectorKey = `${sx},${sy}`;
                
                // セクター内のワールド座標範囲
                const sectorWorldLeft = sx * CONFIG.GRID_SIZE;
                const sectorWorldTop = sy * CONFIG.GRID_SIZE;
                const sectorWorldRight = sectorWorldLeft + CONFIG.GRID_SIZE;
                const sectorWorldBottom = sectorWorldTop + CONFIG.GRID_SIZE;
                
                // 可視範囲との交差計算
                const visibleLeft = Math.max(worldLeft, sectorWorldLeft);
                const visibleTop = Math.max(worldTop, sectorWorldTop);
                const visibleRight = Math.min(worldRight, sectorWorldRight);
                const visibleBottom = Math.min(worldBottom, sectorWorldBottom);
                
                // セクター内ローカル座標
                const localLeft = Math.max(0, Math.floor(visibleLeft - sectorWorldLeft));
                const localTop = Math.max(0, Math.floor(visibleTop - sectorWorldTop));
                const localRight = Math.min(CONFIG.GRID_SIZE - 1, Math.floor(visibleRight - sectorWorldLeft));
                const localBottom = Math.min(CONFIG.GRID_SIZE - 1, Math.floor(visibleBottom - sectorWorldTop));
                
                if (localLeft <= localRight && localTop <= localBottom) {
                    details.set(sectorKey, {
                        sectorX: sx,
                        sectorY: sy,
                        local: {
                            left: localLeft,
                            top: localTop,
                            right: localRight,
                            bottom: localBottom,
                            width: localRight - localLeft + 1,
                            height: localBottom - localTop + 1,
                            pixelCount: (localRight - localLeft + 1) * (localBottom - localTop + 1)
                        }
                    });
                }
            }
        }
        
        return details;
    }
    
    /**
     * キャッシュ有効性チェック
     */
    isCacheValid(offsetX, offsetY, scale, canvasWidth, canvasHeight) {
        const cache = this.cache;
        return cache.result &&
               Math.abs(cache.lastOffsetX - offsetX) < 1 &&
               Math.abs(cache.lastOffsetY - offsetY) < 1 &&
               cache.lastScale === scale &&
               cache.lastCanvasWidth === canvasWidth &&
               cache.lastCanvasHeight === canvasHeight;
    }
    
    /**
     * キャッシュ更新
     */
    updateCache(offsetX, offsetY, scale, canvasWidth, canvasHeight, result) {
        this.cache.lastOffsetX = offsetX;
        this.cache.lastOffsetY = offsetY;
        this.cache.lastScale = scale;
        this.cache.lastCanvasWidth = canvasWidth;
        this.cache.lastCanvasHeight = canvasHeight;
        this.cache.result = result;
    }
    
    /**
     * 特定座標のセクター・ローカル座標を高速計算
     */
    worldToSectorLocal(worldX, worldY) {
        const sectorX = Math.floor(worldX * this.INV_SECTOR_SIZE);
        const sectorY = Math.floor(worldY * this.INV_SECTOR_SIZE);
        const localX = worldX - sectorX * CONFIG.GRID_SIZE;
        const localY = worldY - sectorY * CONFIG.GRID_SIZE;
        
        return {
            sectorX,
            sectorY,
            localX,
            localY,
            sectorKey: `${sectorX},${sectorY}`,
            pixelKey: `${sectorX},${sectorY},${localX},${localY}`
        };
    }
    
    /**
     * 描画優先度の計算
     */
    calculateRenderPriority(bounds) {
        if (bounds.scale.isHighDetail) {
            return {
                mode: 'pixel',
                maxPixels: bounds.world.width * bounds.world.height,
                useTiling: false
            };
        } else if (bounds.scale.isMediumDetail) {
            return {
                mode: 'sector',
                maxSectors: bounds.sectors.total,
                useTiling: bounds.sectors.total > 100
            };
        } else {
            return {
                mode: 'tile',
                tileSize: 64,
                useTiling: true
            };
        }
    }
}
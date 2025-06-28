// 数学計算ユーティリティ
import { CONFIG } from '../../Config.js';

/**
 * 数学計算ユーティリティクラス
 * 座標変換、距離計算、範囲チェックなどの数学的操作を提供
 */
export class MathUtils {
    /**
     * ワールド座標からセクター座標への変換
     */
    static worldToSector(worldX, worldY) {
        return {
            sectorX: Math.floor(worldX / CONFIG.GRID_SIZE),
            sectorY: Math.floor(worldY / CONFIG.GRID_SIZE),
            localX: worldX % CONFIG.GRID_SIZE,
            localY: worldY % CONFIG.GRID_SIZE
        };
    }
    
    /**
     * セクター座標からワールド座標への変換
     */
    static sectorToWorld(sectorX, sectorY, localX = 0, localY = 0) {
        return {
            worldX: sectorX * CONFIG.GRID_SIZE + localX,
            worldY: sectorY * CONFIG.GRID_SIZE + localY
        };
    }
    
    /**
     * スクリーン座標からワールド座標への変換
     */
    static screenToWorld(screenX, screenY, viewport) {
        const worldX = (screenX - viewport.offsetX) / (CONFIG.PIXEL_SIZE * viewport.scale);
        const worldY = (screenY - viewport.offsetY) / (CONFIG.PIXEL_SIZE * viewport.scale);
        return { worldX, worldY };
    }
    
    /**
     * ワールド座標からスクリーン座標への変換
     */
    static worldToScreen(worldX, worldY, viewport) {
        const screenX = worldX * CONFIG.PIXEL_SIZE * viewport.scale + viewport.offsetX;
        const screenY = worldY * CONFIG.PIXEL_SIZE * viewport.scale + viewport.offsetY;
        return { screenX, screenY };
    }
    
    /**
     * 2点間の距離計算
     */
    static distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 2点間の距離計算（平方根なし、比較用）
     */
    static distanceSquared(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return dx * dx + dy * dy;
    }
    
    /**
     * 値を指定範囲内にクランプ
     */
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * 値の線形補間
     */
    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    /**
     * 角度の正規化（0-360度）
     */
    static normalizeAngle(angle) {
        angle = angle % 360;
        return angle < 0 ? angle + 360 : angle;
    }
    
    /**
     * 度からラジアンへの変換
     */
    static degToRad(degrees) {
        return degrees * Math.PI / 180;
    }
    
    /**
     * ラジアンから度への変換
     */
    static radToDeg(radians) {
        return radians * 180 / Math.PI;
    }
    
    /**
     * 矩形の重複判定
     */
    static rectanglesOverlap(rect1, rect2) {
        return !(rect1.x + rect1.width < rect2.x ||
                rect2.x + rect2.width < rect1.x ||
                rect1.y + rect1.height < rect2.y ||
                rect2.y + rect2.height < rect1.y);
    }
    
    /**
     * 点が矩形内にあるかの判定
     */
    static pointInRectangle(x, y, rect) {
        return x >= rect.x && x < rect.x + rect.width &&
               y >= rect.y && y < rect.y + rect.height;
    }
    
    /**
     * 点が円内にあるかの判定
     */
    static pointInCircle(x, y, centerX, centerY, radius) {
        return this.distanceSquared(x, y, centerX, centerY) <= radius * radius;
    }
    
    /**
     * ビューポート内の可視領域計算
     */
    static getVisibleRegion(viewport, padding = 0) {
        const worldTopLeft = this.screenToWorld(-padding, -padding, viewport);
        const worldBottomRight = this.screenToWorld(
            viewport.canvasWidth + padding,
            viewport.canvasHeight + padding,
            viewport
        );
        
        return {
            minX: Math.floor(worldTopLeft.worldX),
            minY: Math.floor(worldTopLeft.worldY),
            maxX: Math.ceil(worldBottomRight.worldX),
            maxY: Math.ceil(worldBottomRight.worldY),
            width: Math.ceil(worldBottomRight.worldX - worldTopLeft.worldX),
            height: Math.ceil(worldBottomRight.worldY - worldTopLeft.worldY)
        };
    }
    
    /**
     * セクター範囲計算
     */
    static getSectorRange(visibleRegion) {
        const minSectorX = Math.floor(visibleRegion.minX / CONFIG.GRID_SIZE);
        const minSectorY = Math.floor(visibleRegion.minY / CONFIG.GRID_SIZE);
        const maxSectorX = Math.floor(visibleRegion.maxX / CONFIG.GRID_SIZE);
        const maxSectorY = Math.floor(visibleRegion.maxY / CONFIG.GRID_SIZE);
        
        return {
            minSectorX,
            minSectorY,
            maxSectorX,
            maxSectorY,
            sectorsX: maxSectorX - minSectorX + 1,
            sectorsY: maxSectorY - minSectorY + 1,
            totalSectors: (maxSectorX - minSectorX + 1) * (maxSectorY - minSectorY + 1)
        };
    }
    
    /**
     * LOD（Level of Detail）レベル計算
     */
    static calculateLODLevel(scale, pixelSize = CONFIG.PIXEL_SIZE) {
        const effectivePixelSize = pixelSize * scale;
        
        if (effectivePixelSize < 1) return 3;      // 高LOD: 見えない
        if (effectivePixelSize < 2) return 2;      // 中LOD: 簡略表示
        if (effectivePixelSize < 4) return 1;      // 低LOD: 部分的詳細
        return 0;                                  // フルLOD: 完全詳細
    }
    
    /**
     * グリッド座標のスナップ
     */
    static snapToGrid(x, y, gridSize = 1) {
        return {
            x: Math.round(x / gridSize) * gridSize,
            y: Math.round(y / gridSize) * gridSize
        };
    }
    
    /**
     * 座標の範囲チェック
     */
    static isValidCoordinate(x, y, bounds = null) {
        if (!bounds) {
            bounds = {
                minX: CONFIG.MIN_COORDINATE || -Infinity,
                minY: CONFIG.MIN_COORDINATE || -Infinity,
                maxX: CONFIG.MAX_COORDINATE || Infinity,
                maxY: CONFIG.MAX_COORDINATE || Infinity
            };
        }
        
        return x >= bounds.minX && x <= bounds.maxX &&
               y >= bounds.minY && y <= bounds.maxY;
    }
    
    /**
     * セクターキー生成
     */
    static getSectorKey(sectorX, sectorY) {
        return `${sectorX},${sectorY}`;
    }
    
    /**
     * セクターキーからセクター座標を取得
     */
    static parseSectorKey(sectorKey) {
        const [sectorX, sectorY] = sectorKey.split(',').map(Number);
        return { sectorX, sectorY };
    }
    
    /**
     * ピクセルキー生成
     */
    static getPixelKey(sectorX, sectorY, localX, localY) {
        return `${sectorX},${sectorY},${localX},${localY}`;
    }
    
    /**
     * ピクセルキーから座標を取得
     */
    static parsePixelKey(pixelKey) {
        const [sectorX, sectorY, localX, localY] = pixelKey.split(',').map(Number);
        return { sectorX, sectorY, localX, localY };
    }
    
    /**
     * セクター内のローカル座標からピクセルインデックス計算
     */
    static getPixelIndex(localX, localY, gridSize = CONFIG.GRID_SIZE) {
        return localY * gridSize + localX;
    }
    
    /**
     * ピクセルインデックスからローカル座標計算
     */
    static getLocalCoordinates(pixelIndex, gridSize = CONFIG.GRID_SIZE) {
        return {
            localX: pixelIndex % gridSize,
            localY: Math.floor(pixelIndex / gridSize)
        };
    }
    
    /**
     * 色値の補間
     */
    static interpolateColor(color1, color2, factor) {
        const r1 = (color1 >> 16) & 0xFF;
        const g1 = (color1 >> 8) & 0xFF;
        const b1 = color1 & 0xFF;
        
        const r2 = (color2 >> 16) & 0xFF;
        const g2 = (color2 >> 8) & 0xFF;
        const b2 = color2 & 0xFF;
        
        const r = Math.round(this.lerp(r1, r2, factor));
        const g = Math.round(this.lerp(g1, g2, factor));
        const b = Math.round(this.lerp(b1, b2, factor));
        
        return (r << 16) | (g << 8) | b;
    }
    
    /**
     * ハッシュ関数（座標からハッシュ値生成）
     */
    static hashCoordinates(x, y) {
        let hash = 0;
        const str = `${x},${y}`;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return Math.abs(hash);
    }
    
    /**
     * イージング関数（ease-in-out）
     */
    static easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    
    /**
     * イージング関数（ease-in）
     */
    static easeIn(t) {
        return t * t;
    }
    
    /**
     * イージング関数（ease-out）
     */
    static easeOut(t) {
        return 1 - Math.pow(1 - t, 2);
    }
    
    /**
     * ランダム値生成（範囲指定）
     */
    static randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    /**
     * ランダム整数生成（範囲指定）
     */
    static randomInt(min, max) {
        return Math.floor(this.randomRange(min, max + 1));
    }
    
    /**
     * 数値を指定桁数で丸める
     */
    static round(value, decimals = 0) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
    
    /**
     * 2の累乗かチェック
     */
    static isPowerOfTwo(value) {
        return value > 0 && (value & (value - 1)) === 0;
    }
    
    /**
     * 次の2の累乗を取得
     */
    static nextPowerOfTwo(value) {
        return Math.pow(2, Math.ceil(Math.log2(value)));
    }
    
    /**
     * パフォーマンステスト用の座標生成
     */
    static generateTestCoordinates(count, bounds) {
        const coordinates = [];
        for (let i = 0; i < count; i++) {
            coordinates.push({
                x: this.randomInt(bounds.minX, bounds.maxX),
                y: this.randomInt(bounds.minY, bounds.maxY)
            });
        }
        return coordinates;
    }
}

// エクスポート用の便利関数
export const {
    worldToSector,
    sectorToWorld,
    screenToWorld,
    worldToScreen,
    distance,
    clamp,
    lerp,
    getVisibleRegion,
    getSectorRange,
    calculateLODLevel,
    snapToGrid,
    isValidCoordinate,
    getSectorKey,
    getPixelKey
} = MathUtils;
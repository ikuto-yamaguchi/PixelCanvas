// 5段階レイヤーシステム管理クラス
import { CONFIG, Utils } from './Config.js';

export class LayerManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        
        // レイヤー定義
        this.layers = {
            // Layer 0: 1pixel = 1px (最高解像度)
            PIXEL: {
                level: 0,
                name: 'pixels',
                blockSize: 1,
                table: 'pixels',
                minZoom: 2.0,
                maxZoom: 16.0
            },
            // Layer 1: 4pixels = 1block (2x2集約)
            BLOCK: {
                level: 1,
                name: 'blocks',
                blockSize: 2,
                table: 'pixel_blocks',
                minZoom: 0.5,
                maxZoom: 2.0
            },
            // Layer 2: 16pixels = 1tile (4x4集約)
            TILE: {
                level: 2,
                name: 'tiles', 
                blockSize: 4,
                table: 'pixel_tiles',
                minZoom: 0.125,
                maxZoom: 0.5
            },
            // Layer 3: 64pixels = 1chunk (8x8集約)
            CHUNK: {
                level: 3,
                name: 'chunks',
                blockSize: 8,
                table: 'pixel_chunks',
                minZoom: 0.03125,
                maxZoom: 0.125
            },
            // Layer 4: 256pixels = 1region (16x16集約)
            REGION: {
                level: 4,
                name: 'regions',
                blockSize: 16,
                table: 'pixel_regions',
                minZoom: 0.0,
                maxZoom: 0.03125
            }
        };
        
        this.currentLayer = this.layers.PIXEL;
        this.supabase = null; // Will be set by main
    }
    
    /**
     * ズームレベルに応じた最適レイヤーを決定
     */
    getOptimalLayer(zoomLevel) {
        for (const layer of Object.values(this.layers)) {
            if (zoomLevel >= layer.minZoom && zoomLevel <= layer.maxZoom) {
                return layer;
            }
        }
        // フォールバック: 最低解像度
        return this.layers.REGION;
    }
    
    /**
     * レイヤー切り替え
     */
    switchToLayer(layer) {
        if (this.currentLayer !== layer) {
            console.log(`🔄 Switching from ${this.currentLayer.name} to ${layer.name}`);
            this.currentLayer = layer;
            return true; // レンダリング更新が必要
        }
        return false; // 変更なし
    }
    
    /**
     * ピクセル座標をレイヤー座標に変換
     */
    pixelToLayerCoords(pixelX, pixelY, layer) {
        const blockSize = layer.blockSize;
        return {
            layerX: Math.floor(pixelX / blockSize),
            layerY: Math.floor(pixelY / blockSize)
        };
    }
    
    /**
     * レイヤー座標をピクセル座標に変換
     */
    layerToPixelCoords(layerX, layerY, layer) {
        const blockSize = layer.blockSize;
        return {
            pixelX: layerX * blockSize,
            pixelY: layerY * blockSize,
            width: blockSize,
            height: blockSize
        };
    }
    
    /**
     * 指定範囲のレイヤーデータを読み込み
     */
    async loadLayerData(layer, bounds) {
        try {
            const { data, error } = await this.supabase
                .from(layer.table)
                .select('*')
                .gte('sector_x', bounds.minSectorX)
                .lte('sector_x', bounds.maxSectorX)
                .gte('sector_y', bounds.minSectorY)
                .lte('sector_y', bounds.maxSectorY);
                
            if (error) throw error;
            
            console.log(`📊 Loaded ${data.length} ${layer.name} data`);
            return data;
            
        } catch (error) {
            console.error(`❌ Failed to load ${layer.name} data:`, error);
            return [];
        }
    }
    
    /**
     * ピクセル更新時の上位レイヤー更新
     */
    async updateUpperLayers(sectorX, sectorY, localX, localY, color) {
        const worldX = sectorX * CONFIG.GRID_SIZE + localX;
        const worldY = sectorY * CONFIG.GRID_SIZE + localY;
        
        // Layer 1-4の更新
        for (let level = 1; level <= 4; level++) {
            const layer = Object.values(this.layers).find(l => l.level === level);
            await this.updateLayerBlock(layer, worldX, worldY, color);
        }
    }
    
    /**
     * レイヤーブロック更新
     */
    async updateLayerBlock(layer, worldX, worldY, color) {
        const layerCoords = this.pixelToLayerCoords(worldX, worldY, layer);
        const blockSize = layer.blockSize;
        
        // ブロック内の全ピクセルを取得して色を集約
        const aggregatedColor = await this.aggregateBlockColor(
            worldX - (worldX % blockSize),
            worldY - (worldY % blockSize),
            blockSize
        );
        
        // セクター座標計算
        const pixelCoords = this.layerToPixelCoords(layerCoords.layerX, layerCoords.layerY, layer);
        const sectorX = Math.floor(pixelCoords.pixelX / CONFIG.GRID_SIZE);
        const sectorY = Math.floor(pixelCoords.pixelY / CONFIG.GRID_SIZE);
        const localX = pixelCoords.pixelX % CONFIG.GRID_SIZE;
        const localY = pixelCoords.pixelY % CONFIG.GRID_SIZE;
        
        try {
            const { error } = await this.supabase
                .from(layer.table)
                .upsert({
                    sector_x: sectorX,
                    sector_y: sectorY,
                    local_x: localX,
                    local_y: localY,
                    color: aggregatedColor,
                    block_size: blockSize,
                    updated_at: new Date().toISOString()
                });
                
            if (error) throw error;
            
        } catch (error) {
            console.error(`❌ Failed to update ${layer.name}:`, error);
        }
    }
    
    /**
     * ブロック内ピクセルの色を集約
     */
    async aggregateBlockColor(startX, startY, blockSize) {
        const colorCounts = new Map();
        let totalPixels = 0;
        
        // ブロック内の各ピクセルをチェック
        for (let x = startX; x < startX + blockSize; x++) {
            for (let y = startY; y < startY + blockSize; y++) {
                const sectorX = Math.floor(x / CONFIG.GRID_SIZE);
                const sectorY = Math.floor(y / CONFIG.GRID_SIZE);
                const localX = x % CONFIG.GRID_SIZE;
                const localY = y % CONFIG.GRID_SIZE;
                
                const color = this.pixelCanvas.pixelStorage.getPixel(sectorX, sectorY, localX, localY);
                if (color !== undefined) {
                    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
                    totalPixels++;
                }
            }
        }
        
        if (totalPixels === 0) {
            return null; // 空ブロック
        }
        
        // 最も多い色を返す（最頻値）
        let maxCount = 0;
        let dominantColor = 0;
        for (const [color, count] of colorCounts) {
            if (count > maxCount) {
                maxCount = count;
                dominantColor = color;
            }
        }
        
        return dominantColor;
    }
    
    /**
     * レイヤーテーブル初期化SQL生成
     */
    generateLayerTableSQL() {
        const tables = [];
        
        for (const layer of Object.values(this.layers)) {
            if (layer.level === 0) continue; // pixelsテーブルは既存
            
            tables.push(`
-- ${layer.name.toUpperCase()} Layer (Level ${layer.level})
CREATE TABLE IF NOT EXISTS public.${layer.table} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_x INTEGER NOT NULL,
    sector_y INTEGER NOT NULL,
    local_x INTEGER NOT NULL,
    local_y INTEGER NOT NULL,
    color INTEGER NOT NULL,
    block_size INTEGER NOT NULL DEFAULT ${layer.blockSize},
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sector_x, sector_y, local_x, local_y)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_${layer.table}_sector ON public.${layer.table}(sector_x, sector_y);
CREATE INDEX IF NOT EXISTS idx_${layer.table}_coords ON public.${layer.table}(sector_x, sector_y, local_x, local_y);
CREATE INDEX IF NOT EXISTS idx_${layer.table}_updated ON public.${layer.table}(updated_at);
            `);
        }
        
        return tables.join('\n');
    }
}
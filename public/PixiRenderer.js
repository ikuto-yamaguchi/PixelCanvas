// PixiJS + LOD による高性能レンダリングエンジン
import { CONFIG, Utils } from './Config.js';

export class PixiRenderer {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.app = null;
        this.viewport = null;
        this.tileLayer = null;
        this.container = document.getElementById('canvasContainer');
        
        // LOD管理
        this.currentLOD = 0;
        this.lodCache = new Map(); // LODレベル -> Map<sectorKey, texture>
        this.textureCache = new Map();
        
        // パフォーマンス設定
        this.maxTextures = 500;
        this.lodThresholds = [2.0, 0.5, 0.125]; // scale thresholds for LOD 0,1,2,3
        
        // 状態管理
        this.isInitialized = false;
        this.lastScale = 1.0;
        this.lastViewport = { x: 0, y: 0, width: 800, height: 600 };
        
        this.initialize();
    }
    
    async initialize() {
        try {
            if (!window.PIXI) {
                console.warn('⚠️ PixiJS not loaded, falling back to Canvas renderer');
                return false;
            }
            
            console.log('🚀 Initializing PixiJS renderer...');
            
            // PixiJS設定
            PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST; // ピクセルアート用
            PIXI.settings.ROUND_PIXELS = true;
            
            // アプリケーション作成
            this.app = new PIXI.Application({
                width: this.container.clientWidth,
                height: this.container.clientHeight,
                backgroundColor: 0x404040,
                antialias: false,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });
            
            // Canvas要素を追加
            this.app.view.id = 'pixiCanvas';
            this.app.view.style.position = 'absolute';
            this.app.view.style.top = '0';
            this.app.view.style.left = '0';
            this.app.view.style.zIndex = '2'; // 既存Canvasより上に
            this.container.appendChild(this.app.view);
            
            // Viewportセットアップ
            this.setupViewport();
            
            // TileMapセットアップ
            this.setupTileMap();
            
            // リサイズハンドラ
            this.setupResize();
            
            this.isInitialized = true;
            console.log('✅ PixiJS renderer initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('❌ PixiJS initialization failed:', error);
            return false;
        }
    }
    
    setupViewport() {
        // pixi-viewport で2Dカメラ作成
        this.viewport = new PIXI.Viewport({
            screenWidth: this.container.clientWidth,
            screenHeight: this.container.clientHeight,
            worldWidth: 100000,
            worldHeight: 100000,
            interaction: this.app.renderer.plugins.interaction
        });
        
        // カメラ操作設定
        this.viewport
            .drag()
            .pinch()
            .wheel({ smooth: 3 })
            .decelerate()
            .clampZoom({ minScale: 0.05, maxScale: 16 });
        
        // イベントリスナー
        this.viewport.on('moved', () => this.onViewportChange());
        this.viewport.on('zoomed', () => this.onViewportChange());
        
        this.app.stage.addChild(this.viewport);
    }
    
    setupTileMap() {
        if (!window.PIXI.tilemap) {
            console.error('❌ pixi-tilemap not loaded');
            return;
        }
        
        // TileMapレイヤー作成
        this.tileLayer = new PIXI.tilemap.CompositeRectTileLayer();
        this.viewport.addChild(this.tileLayer);
    }
    
    setupResize() {
        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            
            this.app.renderer.resize(width, height);
            if (this.viewport) {
                this.viewport.resize(width, height);
            }
        });
    }
    
    onViewportChange() {
        const scale = this.viewport.scale.x;
        const newLOD = this.calculateLOD(scale);
        
        // LOD変更時の処理
        if (newLOD !== this.currentLOD) {
            console.log(`🔄 LOD changed: ${this.currentLOD} → ${newLOD} (scale: ${scale.toFixed(3)})`);
            this.currentLOD = newLOD;
            this.loadVisibleSectors();
        }
        
        // ビューポート変更時は頻度を制限
        if (Math.abs(scale - this.lastScale) > 0.01) {
            this.lastScale = scale;
            this.throttledLoadSectors();
        }
    }
    
    calculateLOD(scale) {
        for (let i = 0; i < this.lodThresholds.length; i++) {
            if (scale >= this.lodThresholds[i]) {
                return i;
            }
        }
        return this.lodThresholds.length; // 最低LOD
    }
    
    throttledLoadSectors = Utils.throttle(() => {
        this.loadVisibleSectors();
    }, 100);
    
    async loadVisibleSectors() {
        if (!this.isInitialized) return;
        
        const bounds = this.calculateVisibleBounds();
        const lodLevel = this.currentLOD;
        
        console.log(`📊 Loading LOD ${lodLevel} sectors:`, bounds);
        
        // 表示範囲のセクターを取得
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY; sectorY++) {
                await this.loadSectorLOD(sectorX, sectorY, lodLevel);
            }
        }
        
        // 古いテクスチャをクリーンアップ
        this.cleanupTextures();
    }
    
    async loadSectorLOD(sectorX, sectorY, lodLevel) {
        const sectorKey = `${sectorX},${sectorY}`;
        const cacheKey = `${sectorKey}:${lodLevel}`;
        
        // キャッシュチェック
        if (this.textureCache.has(cacheKey)) {
            this.renderSectorTexture(sectorX, sectorY, lodLevel);
            return;
        }
        
        try {
            // SupabaseからLODデータを取得
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sector_lod?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}&lod_level=eq.${lodLevel}&select=*`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const lodData = await response.json();
            
            if (lodData.length > 0) {
                // LODデータが存在する場合
                const texture = await this.createTextureFromLOD(lodData[0]);
                this.textureCache.set(cacheKey, texture);
                this.renderSectorTexture(sectorX, sectorY, lodLevel);
            } else {
                // LODデータが存在しない場合は生成
                await this.generateSectorLOD(sectorX, sectorY, lodLevel);
            }
            
        } catch (error) {
            console.error(`❌ Failed to load sector LOD ${cacheKey}:`, error);
        }
    }
    
    async createTextureFromLOD(lodData) {
        // RLEデータからImageBitmapを生成
        const width = lodData.width;
        const height = lodData.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // RLEデコード（簡略版）
        if (lodData.rle_data) {
            // 実際のRLEデコード処理をここに実装
            this.decodeRLEToCanvas(lodData.rle_data, ctx, width, height);
        }
        
        // PIXIテクスチャ作成
        const baseTexture = PIXI.BaseTexture.from(canvas);
        baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        return new PIXI.Texture(baseTexture);
    }
    
    decodeRLEToCanvas(rleData, ctx, width, height) {
        // 簡略版：実際はバイナリRLEデコードが必要
        // とりあえず既存のピクセルストレージから描画
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        // 仮実装：グリッド風のテストパターン
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                if ((x + y) % 8 < 4) {
                    data[index] = 100;     // R
                    data[index + 1] = 100; // G
                    data[index + 2] = 100; // B
                } else {
                    data[index] = 200;     // R
                    data[index + 1] = 200; // G
                    data[index + 2] = 200; // B
                }
                data[index + 3] = 255; // A
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    renderSectorTexture(sectorX, sectorY, lodLevel) {
        const cacheKey = `${sectorX},${sectorY}:${lodLevel}`;
        const texture = this.textureCache.get(cacheKey);
        
        if (!texture) return;
        
        // セクターの世界座標計算
        const worldX = sectorX * CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        const worldY = sectorY * CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        const size = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        
        // TileMapに追加
        this.tileLayer.addRect(texture, worldX, worldY, worldX + size, worldY + size);
    }
    
    async generateSectorLOD(sectorX, sectorY, lodLevel) {
        console.log(`🔧 Generating LOD ${lodLevel} for sector (${sectorX}, ${sectorY})`);
        
        // 既存のピクセルデータから縮小版を生成
        const pixelStorage = this.pixelCanvas.pixelStorage;
        const scale = Math.pow(2, lodLevel); // 1, 2, 4, 8
        const lodSize = Math.floor(CONFIG.GRID_SIZE / scale);
        
        // 簡略版LOD生成
        const lodData = {
            sector_x: sectorX,
            sector_y: sectorY,
            lod_level: lodLevel,
            width: lodSize,
            height: lodSize,
            rle_data: null,
            pixel_count: 0,
            avg_color: 0
        };
        
        // Supabaseに保存
        try {
            await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sector_lod`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(lodData)
            });
            
            console.log(`✅ Generated LOD ${lodLevel} for sector (${sectorX}, ${sectorY})`);
        } catch (error) {
            console.error(`❌ Failed to save LOD:`, error);
        }
    }
    
    calculateVisibleBounds() {
        const bounds = this.viewport.getVisibleBounds();
        const pixelSize = CONFIG.PIXEL_SIZE;
        const gridSize = CONFIG.GRID_SIZE * pixelSize;
        
        return {
            minSectorX: Math.floor(bounds.x / gridSize) - 1,
            maxSectorX: Math.ceil((bounds.x + bounds.width) / gridSize) + 1,
            minSectorY: Math.floor(bounds.y / gridSize) - 1,
            maxSectorY: Math.ceil((bounds.y + bounds.height) / gridSize) + 1
        };
    }
    
    cleanupTextures() {
        if (this.textureCache.size <= this.maxTextures) return;
        
        // 古いテクスチャを削除
        const entries = Array.from(this.textureCache.entries());
        const toDelete = entries.slice(0, entries.length - this.maxTextures + 100);
        
        for (const [key, texture] of toDelete) {
            texture.destroy(true);
            this.textureCache.delete(key);
        }
        
        console.log(`🧹 Cleaned up ${toDelete.length} textures`);
    }
    
    render() {
        if (!this.isInitialized) {
            // フォールバック: 既存レンダラーを使用
            this.pixelCanvas.renderEngine.render();
            return;
        }
        
        // PixiJSは自動レンダリング
        // 必要に応じてtileLayerを更新
        this.tileLayer.clear();
        this.loadVisibleSectors();
    }
    
    destroy() {
        if (this.app) {
            this.app.destroy(true);
        }
        
        for (const texture of this.textureCache.values()) {
            texture.destroy(true);
        }
        
        this.textureCache.clear();
        this.lodCache.clear();
    }
    
    // デバッグ用
    getPerformanceStats() {
        return {
            renderer: 'PixiJS',
            isInitialized: this.isInitialized,
            currentLOD: this.currentLOD,
            textureCount: this.textureCache.size,
            scale: this.viewport?.scale.x || 1,
            webgl: this.app?.renderer.type === PIXI.RENDERER_TYPE.WEBGL
        };
    }
}
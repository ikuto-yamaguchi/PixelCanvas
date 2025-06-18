// PixiJS + LOD による高性能レンダリングエンジン
import { CONFIG, Utils } from './Config.js';
import { LODGenerator } from './LODGenerator.js';

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
        
        // LOD生成システム
        this.lodGenerator = new LODGenerator(pixelCanvas);
        this.lodGenerationPromise = null;
        
        // プログレッシブ読み込み
        this.loadingQueue = new Map();
        this.preloadRadius = 1; // 周辺セクター先読み範囲
        
        this.initialize();
    }
    
    async initialize() {
        try {
            // 詳細なライブラリチェック
            console.log('🔍 Checking PixiJS libraries...');
            console.log('PIXI available:', !!window.PIXI);
            console.log('PIXI.tilemap available:', !!(window.PIXI && window.PIXI.tilemap));
            console.log('PIXI.Viewport available:', !!window.PIXI.Viewport);
            
            if (!window.PIXI) {
                console.warn('⚠️ PixiJS not loaded, falling back to Canvas renderer');
                return false;
            }
            
            if (!window.PIXI.tilemap) {
                console.warn('⚠️ pixi-tilemap not loaded, falling back to Canvas renderer');
                return false;
            }
            
            console.log('🚀 Initializing PixiJS renderer...');
            console.log('PixiJS version:', window.PIXI.VERSION || 'unknown');
            
            // PixiJS設定
            if (window.PIXI.settings) {
                window.PIXI.settings.SCALE_MODE = window.PIXI.SCALE_MODES.NEAREST; // ピクセルアート用
                window.PIXI.settings.ROUND_PIXELS = true;
            }
            
            // Container存在チェック
            if (!this.container) {
                throw new Error('Canvas container not found');
            }
            
            const containerWidth = this.container.clientWidth || 800;
            const containerHeight = this.container.clientHeight || 600;
            
            console.log(`📐 Container size: ${containerWidth}x${containerHeight}`);
            
            // アプリケーション作成
            this.app = new window.PIXI.Application({
                width: containerWidth,
                height: containerHeight,
                backgroundColor: 0x404040,
                antialias: false,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });
            
            console.log('✅ PIXI Application created successfully');
            
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
            
            // 初回LOD生成を開始（非同期）
            this.startInitialLODGeneration();
            
            // Realtime機能を設定（少し遅らせて）
            setTimeout(() => {
                this.setupRealtimeSubscription();
            }, 1000);
            
            return true;
            
        } catch (error) {
            console.error('❌ PixiJS initialization failed:', error);
            return false;
        }
    }
    
    setupViewport() {
        try {
            console.log('🔧 Setting up Viewport...');
            
            // pixi-viewport で2Dカメラ作成
            const ViewportClass = window.PIXI.Viewport || window.Viewport;
            if (!ViewportClass) {
                throw new Error('Viewport class not found - pixi-viewport not loaded properly');
            }
            
            this.viewport = new ViewportClass({
                screenWidth: this.container.clientWidth || 800,
                screenHeight: this.container.clientHeight || 600,
                worldWidth: 100000,
                worldHeight: 100000,
                interaction: this.app.renderer.plugins.interaction
            });
            
            console.log('✅ Viewport created successfully');
        
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
        
        // LOD切り替えのためのスケール監視
        this.viewport.on('zoomed-end', () => this.checkLODLevel());
        
        this.app.stage.addChild(this.viewport);
        
        } catch (error) {
            console.error('❌ Viewport setup failed:', error);
            throw error;
        }
    }
    
    setupTileMap() {
        try {
            console.log('🔧 Setting up TileMap...');
            
            if (!window.PIXI.tilemap) {
                throw new Error('pixi-tilemap not loaded');
            }
            
            // TileMapレイヤー作成
            this.tileLayer = new window.PIXI.tilemap.CompositeRectTileLayer();
            this.viewport.addChild(this.tileLayer);
            
            console.log('✅ TileMap created successfully');
            
        } catch (error) {
            console.error('❌ TileMap setup failed:', error);
            throw error;
        }
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
        // スケールに基づいてLODレベルを決定
        // 高いスケール（ズームイン）= 低いLODレベル（高解像度）
        // 低いスケール（ズームアウト）= 高いLODレベル（低解像度）
        for (let i = 0; i < this.lodThresholds.length; i++) {
            if (scale >= this.lodThresholds[i]) {
                return i;
            }
        }
        return this.lodThresholds.length; // 最低LOD (最も粗い解像度)
    }
    
    checkLODLevel() {
        if (!this.viewport) return;
        
        const currentScale = this.viewport.scale.x;
        const newLOD = this.calculateLOD(currentScale);
        
        // ヒステリシス（頻繁な切り替えを防ぐ）
        if (Math.abs(newLOD - this.currentLOD) >= 1) {
            console.log(`🔄 LOD Level changed: ${this.currentLOD} → ${newLOD} (scale: ${currentScale.toFixed(3)})`);
            this.currentLOD = newLOD;
            
            // LODが変わった場合、表示を更新
            this.loadVisibleSectors();
        }
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
        if (!rleData) {
            // データがない場合は空のキャンバス
            ctx.clearRect(0, 0, width, height);
            return;
        }
        
        try {
            // Base64デコード
            const binaryString = atob(rleData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // RLEデコード
            const pixelArray = new Uint8Array(width * height);
            let pos = 0;
            
            for (let i = 0; i < bytes.length; i += 2) {
                if (i + 1 >= bytes.length) break;
                
                const color = bytes[i];
                const count = bytes[i + 1];
                
                for (let j = 0; j < count && pos < pixelArray.length; j++) {
                    pixelArray[pos++] = color;
                }
            }
            
            // ImageDataに変換
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            for (let i = 0; i < pixelArray.length; i++) {
                const colorIndex = pixelArray[i];
                const color = CONFIG.PALETTE[colorIndex] || '#000000';
                
                // 色文字列をRGBに変換
                const rgb = this.hexToRgb(color);
                const pixelIndex = i * 4;
                
                data[pixelIndex] = rgb.r;     // R
                data[pixelIndex + 1] = rgb.g; // G
                data[pixelIndex + 2] = rgb.b; // B
                data[pixelIndex + 3] = colorIndex === 0 ? 0 : 255; // A (透明 or 不透明)
            }
            
            ctx.putImageData(imageData, 0, 0);
            
        } catch (error) {
            console.error('❌ RLE decode failed:', error);
            // フォールバック: 既存ピクセルストレージから直接描画
            this.renderSectorFromStorage(ctx, width, height);
        }
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    renderSectorFromStorage(ctx, width, height) {
        // フォールバック: ピクセルストレージから直接描画
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        // とりあえずテストパターン
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const intensity = ((x + y) % 32) * 8;
                data[index] = intensity;     // R
                data[index + 1] = intensity; // G
                data[index + 2] = intensity; // B
                data[index + 3] = 255;       // A
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
    
    // 🚀 Supabase Realtime統合
    setupRealtimeSubscription() {
        if (!this.pixelCanvas.networkManager.supabaseClient) {
            console.warn('⚠️ Supabase client not available for realtime');
            return;
        }
        
        const supabase = this.pixelCanvas.networkManager.supabaseClient;
        
        // ピクセル更新のリアルタイム監視
        this.pixelSubscription = supabase
            .channel('pixel-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'pixels'
                },
                (payload) => this.handlePixelRealtimeUpdate(payload)
            )
            .subscribe();
            
        // LOD更新のリアルタイム監視
        this.lodSubscription = supabase
            .channel('lod-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'sector_lod'
                },
                (payload) => this.handleLODRealtimeUpdate(payload)
            )
            .subscribe();
            
        console.log('✅ Realtime subscriptions established');
    }
    
    handlePixelRealtimeUpdate(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        switch (eventType) {
            case 'INSERT':
                this.handlePixelInsert(newRecord);
                break;
            case 'UPDATE':
                this.handlePixelUpdate(newRecord, oldRecord);
                break;
            case 'DELETE':
                this.handlePixelDelete(oldRecord);
                break;
        }
    }
    
    async handlePixelInsert(pixel) {
        const { sector_x, sector_y, local_x, local_y, color } = pixel;
        
        console.log(`🔄 Realtime pixel insert: (${sector_x}, ${sector_y}) at (${local_x}, ${local_y}) color ${color}`);
        
        // ローカルピクセルストレージを更新
        this.pixelCanvas.pixelStorage.setPixel(sector_x, sector_y, local_x, local_y, color);
        
        // 影響を受けるLODレベルを更新
        if (this.lodGenerator) {
            await this.lodGenerator.updateLODForPixelChange(sector_x, sector_y, local_x, local_y, color);
        }
        
        // 現在表示されているセクターなら即座に更新
        const sectorKey = `${sector_x},${sector_y}`;
        if (this.isVisibleSector(sector_x, sector_y)) {
            await this.refreshSectorTexture(sector_x, sector_y);
        }
    }
    
    async handlePixelUpdate(newPixel, oldPixel) {
        // ピクセル更新はINSERTと同じ処理
        await this.handlePixelInsert(newPixel);
    }
    
    async handlePixelDelete(pixel) {
        const { sector_x, sector_y, local_x, local_y } = pixel;
        
        console.log(`🔄 Realtime pixel delete: (${sector_x}, ${sector_y}) at (${local_x}, ${local_y})`);
        
        // ローカルピクセルストレージから削除
        this.pixelCanvas.pixelStorage.deletePixel(sector_x, sector_y, local_x, local_y);
        
        // LODを更新
        if (this.lodGenerator) {
            await this.lodGenerator.updateLODForPixelChange(sector_x, sector_y, local_x, local_y, 0);
        }
        
        // 表示更新
        if (this.isVisibleSector(sector_x, sector_y)) {
            await this.refreshSectorTexture(sector_x, sector_y);
        }
    }
    
    handleLODRealtimeUpdate(payload) {
        const { eventType, new: newRecord } = payload;
        
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const { sector_x, sector_y, lod_level } = newRecord;
            const cacheKey = `${sector_x},${sector_y}:${lod_level}`;
            
            console.log(`🔄 Realtime LOD update: (${sector_x}, ${sector_y}) level ${lod_level}`);
            
            // テクスチャキャッシュをクリア（次回アクセス時に再生成）
            this.textureCache.delete(cacheKey);
            
            // 現在のLODレベルと一致し、表示範囲内なら即座に再ロード
            if (lod_level === this.currentLOD && this.isVisibleSector(sector_x, sector_y)) {
                this.loadSectorLOD(sector_x, sector_y, lod_level);
            }
        }
    }
    
    isVisibleSector(sectorX, sectorY) {
        const bounds = this.calculateVisibleBounds();
        return sectorX >= bounds.minSectorX && 
               sectorX <= bounds.maxSectorX && 
               sectorY >= bounds.minSectorY && 
               sectorY <= bounds.maxSectorY;
    }
    
    async refreshSectorTexture(sectorX, sectorY) {
        // 全LODレベルのテクスチャキャッシュをクリア
        for (let level = 0; level <= 3; level++) {
            const cacheKey = `${sectorX},${sectorY}:${level}`;
            const texture = this.textureCache.get(cacheKey);
            if (texture) {
                texture.destroy(true);
                this.textureCache.delete(cacheKey);
            }
        }
        
        // 現在のLODレベルで再ロード
        await this.loadSectorLOD(sectorX, sectorY, this.currentLOD);
    }
    
    // LOD生成関連メソッド
    async startInitialLODGeneration() {
        if (this.lodGenerationPromise) return;
        
        console.log('🏗️ Starting initial LOD generation...');
        
        this.lodGenerationPromise = this.lodGenerator.generateAllLODs()
            .then(() => {
                console.log('✅ Initial LOD generation completed');
                this.loadVisibleSectors(); // LOD生成後に再描画
            })
            .catch(error => {
                console.error('❌ LOD generation failed:', error);
            })
            .finally(() => {
                this.lodGenerationPromise = null;
            });
    }
    
    // プログレッシブ読み込み: 低LOD→高LODの順で読み込み
    async loadSectorProgressive(sectorX, sectorY) {
        const currentLOD = this.currentLOD;
        
        // 低LODから高LODまで段階的に読み込み
        for (let lod = Math.min(3, currentLOD + 1); lod >= Math.max(0, currentLOD - 1); lod--) {
            await this.loadSectorLOD(sectorX, sectorY, lod);
            
            // 高優先度LODが見つかったら即座に表示
            const cacheKey = `${sectorX},${sectorY}:${lod}`;
            if (this.textureCache.has(cacheKey)) {
                this.renderSectorTexture(sectorX, sectorY, lod);
                
                // 現在のLODに合った解像度なら完了
                if (lod === currentLOD) break;
            }
        }
    }
    
    // 周辺セクターの先読み
    async preloadAdjacentSectors(centerX, centerY, radius = 1) {
        const preloadPromises = [];
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue; // 中央は既に読み込み済み
                
                const sectorX = centerX + dx;
                const sectorY = centerY + dy;
                
                preloadPromises.push(
                    this.loadSectorLOD(sectorX, sectorY, this.currentLOD)
                        .catch(error => {
                            // エラーは静かに無視（先読みなので）
                            console.debug(`Preload failed for (${sectorX}, ${sectorY}):`, error);
                        })
                );
            }
        }
        
        // 先読みは低優先度なので、一部失敗しても続行
        await Promise.allSettled(preloadPromises);
    }
    
    // ピクセル更新時のLOD同期更新
    async updateLODForPixelChange(sectorX, sectorY, localX, localY, color) {
        // リアルタイム更新
        await this.lodGenerator.updateLODForPixelChange(sectorX, sectorY, localX, localY, color);
        
        // 影響を受けるテクスチャをキャッシュから削除
        for (let lod = 0; lod <= 3; lod++) {
            const cacheKey = `${sectorX},${sectorY}:${lod}`;
            const texture = this.textureCache.get(cacheKey);
            if (texture) {
                texture.destroy(true);
                this.textureCache.delete(cacheKey);
            }
        }
        
        // 現在表示中のLODを再読み込み
        await this.loadSectorLOD(sectorX, sectorY, this.currentLOD);
    }
    
    // ヒステリシス付きLOD切り替え
    calculateLODWithHysteresis(scale) {
        const newLOD = this.calculateLOD(scale);
        
        // ヒステリシス: 閾値付近での頻繁な切り替えを防ぐ
        if (Math.abs(newLOD - this.currentLOD) === 1) {
            const threshold = this.lodThresholds[Math.min(newLOD, this.currentLOD)];
            const hysteresis = threshold * 0.1; // 10%のバッファ
            
            if (newLOD > this.currentLOD) {
                // より高詳細への切り替え: より厳格な条件
                return scale >= threshold + hysteresis ? newLOD : this.currentLOD;
            } else {
                // より低詳細への切り替え: より緩い条件
                return scale <= threshold - hysteresis ? newLOD : this.currentLOD;
            }
        }
        
        return newLOD;
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
        this.loadingQueue.clear();
        
        // Realtime subscriptionをクリーンアップ
        if (this.pixelSubscription) {
            this.pixelSubscription.unsubscribe();
        }
        if (this.lodSubscription) {
            this.lodSubscription.unsubscribe();
        }
        
        if (this.lodGenerator) {
            this.lodGenerator.destroy();
        }
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
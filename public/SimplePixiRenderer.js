// シンプルなPixiJSレンダラー（プラグイン依存なし）
import { CONFIG, Utils } from './Config.js';

export class SimplePixiRenderer {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.app = null;
        this.container = document.getElementById('canvasContainer');
        this.spriteContainer = null;
        this.sprites = new Map();
        
        // カメラ状態
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        
        // パフォーマンス設定
        this.maxSprites = 1000;
        this.isInitialized = false;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log('🔍 Simple PixiJS renderer initialization...');
            
            if (!window.PIXI) {
                console.warn('⚠️ PixiJS not available, falling back to Canvas');
                return false;
            }
            
            console.log('✅ PixiJS Core available, using simple renderer');
            
            // PixiJS設定
            if (window.PIXI.settings) {
                window.PIXI.settings.SCALE_MODE = window.PIXI.SCALE_MODES.NEAREST;
                window.PIXI.settings.ROUND_PIXELS = true;
            }
            
            // Container確認
            if (!this.container) {
                throw new Error('Canvas container not found');
            }
            
            const width = this.container.clientWidth || 800;
            const height = this.container.clientHeight || 600;
            
            // シンプルなPixiJSアプリケーション作成
            this.app = new window.PIXI.Application({
                width: width,
                height: height,
                backgroundColor: 0x404040,
                antialias: false,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });
            
            // Canvas要素追加
            this.app.view.id = 'simplePixiCanvas';
            this.app.view.style.position = 'absolute';
            this.app.view.style.top = '0';
            this.app.view.style.left = '0';
            this.app.view.style.zIndex = '2';
            this.container.appendChild(this.app.view);
            
            // スプライトコンテナ作成
            this.spriteContainer = new window.PIXI.Container();
            this.app.stage.addChild(this.spriteContainer);
            
            // シンプルなカメラ操作
            this.setupSimpleCamera();
            
            // リサイズ対応
            this.setupResize();
            
            // 既存システムとの同期
            this.syncWithExistingCamera();
            
            this.isInitialized = true;
            console.log('✅ Simple PixiJS renderer initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('❌ Simple PixiJS initialization failed:', error);
            return false;
        }
    }
    
    setupSimpleCamera() {
        const canvas = this.app.view;
        let isDragging = false;
        let lastX = 0, lastY = 0;
        
        // マウス操作
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - lastX;
            const deltaY = e.clientY - lastY;
            
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            
            this.updateCamera();
            
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        });
        
        canvas.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
        });
        
        // ホイールズーム
        canvas.addEventListener('wheel', (e) => {
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Utils.clamp(this.scale * delta, CONFIG.MIN_SCALE, CONFIG.MAX_SCALE);
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const scaleFactor = newScale / this.scale;
            this.offsetX = mouseX - (mouseX - this.offsetX) * scaleFactor;
            this.offsetY = mouseY - (mouseY - this.offsetY) * scaleFactor;
            this.scale = newScale;
            
            this.updateCamera();
            e.preventDefault();
        });
        
        // タッチ操作（基本的なパン）
        let lastTouchX = 0, lastTouchY = 0;
        
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                e.preventDefault();
            }
        });
        
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - lastTouchX;
                const deltaY = e.touches[0].clientY - lastTouchY;
                
                this.offsetX += deltaX;
                this.offsetY += deltaY;
                
                this.updateCamera();
                
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                e.preventDefault();
            }
        });
    }
    
    updateCamera() {
        if (!this.spriteContainer) return;
        
        // スプライトコンテナの変換を更新
        this.spriteContainer.scale.set(this.scale);
        this.spriteContainer.position.set(this.offsetX, this.offsetY);
        
        // 既存システムと同期
        this.pixelCanvas.scale = this.scale;
        this.pixelCanvas.offsetX = this.offsetX;
        this.pixelCanvas.offsetY = this.offsetY;
        
        // 表示範囲更新
        this.updateVisiblePixels();
    }
    
    syncWithExistingCamera() {
        // 既存のカメラ状態を取得
        this.scale = this.pixelCanvas.scale || 1.0;
        this.offsetX = this.pixelCanvas.offsetX || 0;
        this.offsetY = this.pixelCanvas.offsetY || 0;
        
        this.updateCamera();
    }
    
    updateVisiblePixels() {
        // 表示範囲のピクセルをスプライトとして表示
        const bounds = this.calculateVisibleBounds();
        const visiblePixels = new Set();
        
        // 表示範囲のピクセルを取得
        for (let sectorX = bounds.minSectorX; sectorX <= bounds.maxSectorX; sectorX++) {
            for (let sectorY = bounds.minSectorY; sectorY <= bounds.maxSectorY; sectorY++) {
                for (let localX = 0; localX < CONFIG.GRID_SIZE; localX++) {
                    for (let localY = 0; localY < CONFIG.GRID_SIZE; localY++) {
                        const color = this.pixelCanvas.pixelStorage.getPixel(sectorX, sectorY, localX, localY);
                        if (color !== undefined) {
                            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
                            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
                            const pixelKey = `${worldX},${worldY}`;
                            
                            visiblePixels.add(pixelKey);
                            this.createOrUpdatePixelSprite(worldX, worldY, color);
                        }
                    }
                }
            }
        }
        
        // 表示範囲外のスプライトを削除
        for (const [key, sprite] of this.sprites) {
            if (!visiblePixels.has(key)) {
                this.spriteContainer.removeChild(sprite);
                sprite.destroy();
                this.sprites.delete(key);
            }
        }
        
        console.log(`📊 Simple Pixi: ${this.sprites.size} sprites rendered`);
    }
    
    createOrUpdatePixelSprite(worldX, worldY, colorIndex) {
        const pixelKey = `${worldX},${worldY}`;
        
        if (this.sprites.has(pixelKey)) {
            // 既存スプライトの色更新
            const sprite = this.sprites.get(pixelKey);
            const color = this.getColorNumber(colorIndex);
            sprite.tint = color;
            return;
        }
        
        // 新しいスプライト作成
        const graphics = new window.PIXI.Graphics();
        graphics.beginFill(this.getColorNumber(colorIndex));
        graphics.drawRect(0, 0, CONFIG.PIXEL_SIZE, CONFIG.PIXEL_SIZE);
        graphics.endFill();
        
        const texture = this.app.renderer.generateTexture(graphics);
        const sprite = new window.PIXI.Sprite(texture);
        
        sprite.x = worldX * CONFIG.PIXEL_SIZE;
        sprite.y = worldY * CONFIG.PIXEL_SIZE;
        
        this.spriteContainer.addChild(sprite);
        this.sprites.set(pixelKey, sprite);
        
        graphics.destroy();
    }
    
    getColorNumber(colorIndex) {
        const colorHex = CONFIG.PALETTE[colorIndex] || '#000000';
        return parseInt(colorHex.replace('#', ''), 16);
    }
    
    calculateVisibleBounds() {
        const width = this.app.view.width / (window.devicePixelRatio || 1);
        const height = this.app.view.height / (window.devicePixelRatio || 1);
        
        const minX = Math.floor((-this.offsetX) / (CONFIG.PIXEL_SIZE * this.scale));
        const maxX = Math.ceil((-this.offsetX + width) / (CONFIG.PIXEL_SIZE * this.scale));
        const minY = Math.floor((-this.offsetY) / (CONFIG.PIXEL_SIZE * this.scale));
        const maxY = Math.ceil((-this.offsetY + height) / (CONFIG.PIXEL_SIZE * this.scale));
        
        return {
            minX: Math.max(minX - 10, -1000),
            maxX: Math.min(maxX + 10, 1000),
            minY: Math.max(minY - 10, -1000),
            maxY: Math.min(maxY + 10, 1000),
            minSectorX: Math.floor(Math.max(minX - 10, -1000) / CONFIG.GRID_SIZE),
            maxSectorX: Math.ceil(Math.min(maxX + 10, 1000) / CONFIG.GRID_SIZE),
            minSectorY: Math.floor(Math.max(minY - 10, -1000) / CONFIG.GRID_SIZE),
            maxSectorY: Math.ceil(Math.min(maxY + 10, 1000) / CONFIG.GRID_SIZE)
        };
    }
    
    setupResize() {
        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            
            this.app.renderer.resize(width, height);
            this.updateVisiblePixels();
        });
    }
    
    render() {
        if (!this.isInitialized) {
            // フォールバック
            this.pixelCanvas.renderEngine.render();
            return;
        }
        
        this.updateVisiblePixels();
    }
    
    destroy() {
        if (this.app) {
            this.app.destroy(true);
        }
        
        this.sprites.clear();
    }
    
    getPerformanceStats() {
        return {
            renderer: 'Simple PixiJS',
            isInitialized: this.isInitialized,
            spriteCount: this.sprites.size,
            scale: this.scale,
            webgl: this.app?.renderer.type === window.PIXI.RENDERER_TYPE.WEBGL
        };
    }
}
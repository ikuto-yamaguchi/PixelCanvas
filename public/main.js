// PixelCanvas Main Application - Modularized Version
import { CONFIG, Utils } from './Config.js';
import { DebugPanel } from './DebugPanel.js';
import { EventHandlers } from './EventHandlers.js';
import { ViewportController } from './ViewportController.js';
import { RenderEngine } from './RenderEngine.js';
import { OptimizedRenderSystem } from './OptimizedRenderSystem.js';
import { SectorManager } from './SectorManager.js';
import { NetworkManager } from './NetworkManager.js';
import { PixelStorage } from './PixelStorage.js';
import { LayerManager } from './LayerManager.js';
import { LayeredRenderer } from './LayeredRenderer.js';
import { PixiRenderer } from './PixiRenderer.js';
import { SimplePixiRenderer } from './SimplePixiRenderer.js';

class PixelCanvas {
    constructor() {
        // Get DOM elements
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.container = document.getElementById('canvasContainer');
        
        // Core state
        this.currentColor = 0;
        this.scale = CONFIG.DEFAULT_SCALE;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showGrid = true;
        this.activeSectors = new Set(); // Initialize empty, will be populated from database
        this.sectorPixelCounts = new Map(); // Track pixel count per sector
        this.isExpansionRunning = false;
        this.deviceId = Utils.generateDeviceId();
        
        // Canvas size tracking
        this.logicalWidth = 0;
        this.logicalHeight = 0;
        
        // Initialize debug panel first to catch all errors
        this.debugPanel = DebugPanel.getInstance();
        
        try {
            // Initialize modules
            this.pixelStorage = new PixelStorage(this);
            
            this.viewportController = new ViewportController(this);
            
            this.renderEngine = new RenderEngine(this.canvas, this.ctx, this);
            
            this.networkManager = new NetworkManager(this);
            
            // Initialize Layer Management System
            this.layerManager = new LayerManager(this);
            this.layeredRenderer = new LayeredRenderer(this);
            
            // Connect LayeredRenderer to LayerManager
            this.layeredRenderer.layerManager = this.layerManager;
            
            // 🚀 NEW: Initialize PixiJS Renderer (Performance Enhancement)
            // PixiJSの初期化は少し遅らせる（ライブラリ読み込み完了を待つ）
            if (CONFIG.USE_PIXI_RENDERER) {
                setTimeout(() => {
                    try {
                        // Try full PixiJS renderer with plugins first
                        this.pixiRenderer = new PixiRenderer(this);
                    } catch (error) {
                        
                        try {
                            // Fallback to SimplePixiRenderer (plugin-free)
                            this.pixiRenderer = new SimplePixiRenderer(this);
                        } catch (fallbackError) {
                            CONFIG.USE_PIXI_RENDERER = false;
                        }
                    }
                }, 500); // 500ms遅延
            }
            
            // 🚀 NEW: Initialize Optimized Render System with delayed Supabase connection
            this.optimizedRenderer = new OptimizedRenderSystem(this.canvas, this.ctx, null);
            
            // Supabaseクライアントを後で設定（Layer SystemとOptimized Rendererの両方に）
            setTimeout(() => {
                if (this.networkManager.supabaseClient) {
                    this.optimizedRenderer.updateSupabaseClient(this.networkManager.supabaseClient);
                    this.layerManager.supabase = this.networkManager.supabaseClient;
                } else {
                    setTimeout(() => {
                        if (this.networkManager.supabaseClient) {
                            this.optimizedRenderer.updateSupabaseClient(this.networkManager.supabaseClient);
                            this.layerManager.supabase = this.networkManager.supabaseClient;
                        }
                    }, 1000);
                }
            }, 100);
            
            this.sectorManager = new SectorManager(this);
            
            this.eventHandlers = new EventHandlers(this.canvas, this);
            
            // Delegate properties for backward compatibility
            this.pixels = this.pixelStorage.pixels;
            this.pixelStock = this.pixelStorage.pixelStock;
            
            this.init();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }
    
    async init() {
        try {
            this.setupCanvas();
            this.renderEngine.setupColorPalette();
            this.setupOnlineStatusHandling();
            this.registerServiceWorker();
            await this.sectorManager.initializeSectors();
            this.sectorManager.startPeriodicRefresh();
            
            // Await initial data loading
            await this.loadInitialData();
            
            this.viewportController.centerViewportOnActiveSectors();
        } catch (error) {
            console.error('Init error:', error);
        }
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Store logical canvas size for viewport calculations
        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;
        
        // Set physical canvas size for sharp rendering
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.render();
    }
    
    setupOnlineStatusHandling() {
        window.addEventListener('online', () => {
            this.networkManager.updateStatus(true);
            this.networkManager.flushQueue();
        });
        
        window.addEventListener('offline', () => {
            this.networkManager.updateStatus(false);
        });
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    }
    
    async loadInitialData() {
        
        try {
            // Await pixel loading to ensure completion
            await this.networkManager.loadPixelsFromSupabase();
            this.render();
            
            // Load sector counts (for reference only, we use real-time counting) 
            this.networkManager.loadSectorCounts();
        } catch (error) {
            console.error('Initial data loading failed:', error);
        }
    }
    
    // Pixel interaction
    async handlePixelClick(x, y) {
        // Convert screen coordinates to world coordinates
        const worldX = Math.floor((x - this.offsetX) / (CONFIG.PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (CONFIG.PIXEL_SIZE * this.scale));
        
        // Convert to sector and local coordinates
        const local = Utils.worldToLocal(worldX, worldY);
        
        // Check if within bounds
        if (local.localX < 0 || local.localX >= CONFIG.GRID_SIZE || 
            local.localY < 0 || local.localY >= CONFIG.GRID_SIZE) {
            console.error('🚫 Click outside valid bounds:', {x, y, worldX, worldY, local});
            return;
        }
        
        // Check if within active sectors
        if (!this.sectorManager.isWithinActiveSectors(worldX, worldY)) {
            console.error('🚫 Click outside active sectors:', {worldX, worldY, activeSectors: Array.from(this.activeSectors)});
            this.showOutOfBoundsWarning();
            return;
        }
        
        // Check if pixel already exists
        if (this.pixelStorage.hasPixel(local.sectorX, local.sectorY, local.localX, local.localY)) {
            return;
        }
        
        
        // Use optimized pixel drawing system
        const success = await this.drawPixelOptimized(worldX, worldY, this.currentColor);
        
        
        if (success) {
            // Check for expansion after successful draw
            this.checkAndTriggerExpansion(local.sectorX, local.sectorY);
        }
    }
    
    checkAndTriggerExpansion(sectorX, sectorY) {
        // Check if we need to expand
        const actualCount = this.pixelStorage.getSectorPixelCount(sectorX, sectorY);
        const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
        const fillPercentage = actualCount / maxPixelsPerSector;
        
        if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD) {
            this.sectorManager.expandSectorsLocally(sectorX, sectorY);
        }
    }
    
    showOutOfBoundsWarning() {
        let warning = document.getElementById('outOfBoundsWarning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'outOfBoundsWarning';
            warning.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 100, 100, 0.95);
                color: white;
                padding: 20px;
                border-radius: 10px;
                font-family: Arial, sans-serif;
                font-size: 16px;
                text-align: center;
                z-index: 1000;
                max-width: 300px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(warning);
        }
        
        warning.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">🚫</div>
            <div><strong>Can't Draw Here</strong></div>
            <div style="margin-top: 10px; font-size: 14px;">
                You can only draw in active (green) sectors.<br>
                Fill existing sectors to unlock new areas!
            </div>
        `;
        warning.style.display = 'block';
        
        setTimeout(() => {
            if (warning) {
                warning.style.display = 'none';
            }
        }, 3000);
    }
    
    // Delegate methods to appropriate modules
    render() {
        try {
            // 🚀 PixiJS Performance Renderer (最優先)
            if (CONFIG.USE_PIXI_RENDERER && this.pixiRenderer && this.pixiRenderer.isInitialized) {
                console.log('🎨 Using PixiJS Renderer');
                this.pixiRenderer.render();
                return;
            }
            
            // 🔧 LayeredRenderer (フォールバック1)
            if (this.layeredRenderer) {
                console.log('🎨 Using LayeredRenderer, pixel count:', Object.keys(this.pixels || {}).length);
                this.layeredRenderer.render();
            } else {
                // Legacy rendering (フォールバック2)
                console.log('🎨 Using RenderEngine (legacy), pixel count:', Object.keys(this.pixels || {}).length);
                this.renderEngine.render();
            }
        } catch (error) {
            console.error('❌ Render failed, using legacy fallback:', error);
            this.renderEngine.render();
        }
    }
    
    // Legacy render method for fallback
    renderLegacy() {
        this.renderEngine.render();
    }
    
    // 🔧 Enhanced pixel drawing with layer updates
    async drawPixelOptimized(worldX, worldY, color) {
        // Convert to local coordinates 
        const local = Utils.worldToLocal(worldX, worldY);
        
        // Use legacy PixelStorage.drawPixel method
        const result = this.pixelStorage.drawPixel(
            local.sectorX,
            local.sectorY,
            local.localX,
            local.localY,
            color
        );
        
        // 🔧 NEW: Update upper layers for performance
        if (this.layerManager && this.layerManager.supabase) {
            try {
                await this.layerManager.updateUpperLayers(
                    local.sectorX,
                    local.sectorY,
                    local.localX,
                    local.localY,
                    color
                );
                console.log('🔧 Upper layers updated');
            } catch (error) {
                console.error('⚠️ Layer update failed:', error);
            }
        }
        
        return result;
    }
    
    mobileLog(message) {
        // PERFORMANCE: Disable mobile logging
        return;
        // this.debugPanel.log(message);
    }
    
    constrainViewport() {
        // Apply viewport constraints based on active sectors
        const bounds = this.viewportController.getViewportBounds();
        
        const originalOffsetX = this.offsetX;
        const originalOffsetY = this.offsetY;
        
        // Apply strict constraints
        const newOffsetX = Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, this.offsetX));
        const newOffsetY = Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, this.offsetY));
        
        
        this.offsetX = newOffsetX;
        this.offsetY = newOffsetY;
    }
    
    
    showOutOfBoundsWarning() {
        // Visual feedback when clicking outside active sectors
        let warning = document.getElementById('outOfBoundsWarning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'outOfBoundsWarning';
            warning.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 68, 68, 0.9);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                text-align: center;
                z-index: 1000;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            `;
            warning.textContent = '🙅 このエリアには描けません';
            document.body.appendChild(warning);
        }
        
        warning.style.display = 'block';
        
        // Auto-hide after 2 seconds
        clearTimeout(this.outOfBoundsWarningTimeout);
        this.outOfBoundsWarningTimeout = setTimeout(() => {
            warning.style.display = 'none';
        }, 2000);
    }
    
    constrainViewport() {
        this.viewportController.constrainViewport();
    }
    
    updateStockDisplay() {
        this.pixelStorage.updateStockDisplay();
    }
    
    // Testing and utility methods
    async testExpansion() {
        await this.pixelStorage.testExpansion();
    }
    
    // Get application statistics
    getStats() {
        const pixelStats = this.pixelStorage.getStats();
        return {
            ...pixelStats,
            activeSectors: this.activeSectors.size,
            scale: this.scale,
            deviceId: this.deviceId,
            isOnline: navigator.onLine,
            isExpansionRunning: this.isExpansionRunning
        };
    }
    
    // Performance control methods - New simplified API
    setRenderMode(mode) {
        return this.renderEngine.setRenderMode(mode);
    }
    
    toggleRenderMode() {
        return this.renderEngine.toggleRenderMode();
    }
    
    getPerformanceStats() {
        // 🚀 PixiJS統計情報を優先
        if (CONFIG.USE_PIXI_RENDERER && this.pixiRenderer && this.pixiRenderer.isInitialized) {
            return {
                ...this.pixiRenderer.getPerformanceStats(),
                fallbackAvailable: true,
                legacyStats: this.renderEngine.getPerformanceStats()
            };
        }
        
        return {
            ...this.renderEngine.getPerformanceStats(),
            pixiAvailable: false
        };
    }
    
    benchmark(seconds) {
        return this.renderEngine.benchmark(seconds);
    }
    
    // Debug methods
    logState() {
        const stats = this.getStats();
        // this.debugPanel.log(`📊 App State: ${JSON.stringify(stats, null, 2)}`);
    }
    
    logPerformance() {
        const stats = this.getPerformanceStats();
        return stats;
    }
    
    // vConsole testing methods  
    testVConsole() {
        console.error('❌ vConsole Test: Error message');
        
        // Test error throwing
        try {
            throw new Error('Test error for vConsole debugging');
        } catch (error) {
            console.error('📱 vConsole Test: Caught error:', error);
        }
        
        // Test network logging
        fetch('/test-api-call').catch((error) => {
            console.error('📱 vConsole Test: Network request failed as expected:', error);
        });
        
        // Test promise rejection
        Promise.reject('Test promise rejection for vConsole').catch(error => {
            console.error('📱 vConsole Test: Promise rejection caught:', error);
        });
        
        return 'vConsole test completed - check vConsole panel for results';
    }
    
    // 🚀 PixiJS + LOD デバッグコマンド
    async generateLODs() {
        if (!this.pixiRenderer || !this.pixiRenderer.lodGenerator) {
            return 'PixiJS renderer not available';
        }
        
        console.log('🏗️ Starting LOD generation...');
        await this.pixiRenderer.lodGenerator.generateAllLODs();
        return 'LOD generation completed - check console for details';
    }
    
    switchRenderer(type = 'auto') {
        const oldRenderer = CONFIG.USE_PIXI_RENDERER ? 'PixiJS' : 'Canvas2D';
        
        switch (type) {
            case 'pixi':
                CONFIG.USE_PIXI_RENDERER = true;
                break;
            case 'canvas':
                CONFIG.USE_PIXI_RENDERER = false;
                break;
            case 'auto':
                CONFIG.USE_PIXI_RENDERER = !CONFIG.USE_PIXI_RENDERER;
                break;
        }
        
        const newRenderer = CONFIG.USE_PIXI_RENDERER ? 'PixiJS' : 'Canvas2D';
        this.render();
        
        return `Renderer switched: ${oldRenderer} → ${newRenderer}`;
    }
    
    getLODStats() {
        if (!this.pixiRenderer || !this.pixiRenderer.isInitialized) {
            return 'PixiJS renderer not available';
        }
        
        return {
            currentLOD: this.pixiRenderer.currentLOD,
            scale: this.pixiRenderer.viewport?.scale.x || 1,
            textureCount: this.pixiRenderer.textureCache.size,
            lodThresholds: CONFIG.LOD_THRESHOLDS,
            performance: this.getPerformanceStats()
        };
    }
    
    async testLODGeneration(sectorX = 0, sectorY = 0) {
        if (!this.pixiRenderer || !this.pixiRenderer.lodGenerator) {
            return 'PixiJS renderer not available';
        }
        
        console.log(`🧪 Testing LOD generation for sector (${sectorX}, ${sectorY})`);
        await this.pixiRenderer.lodGenerator.generateAllLODsForSector(sectorX, sectorY);
        
        return `LOD test completed for sector (${sectorX}, ${sectorY})`;
    }
    
    // 🧪 簡単なLODテスト（サンプルデータ使用）
    async runLODDemo() {
        console.log('🚀 Starting LOD generation demo...');
        
        // SimplePixiRendererでもテスト可能
        let lodGenerator;
        if (this.pixiRenderer && this.pixiRenderer.lodGenerator) {
            lodGenerator = this.pixiRenderer.lodGenerator;
        } else if (this.pixiRenderer && this.pixiRenderer.constructor.name === 'SimplePixiRenderer') {
            // SimplePixiRenderer用に新しいLODGeneratorを作成
            const { LODGenerator } = await import('./LODGenerator.js');
            lodGenerator = new LODGenerator(this);
        } else {
            // フォールバック: 直接LODGeneratorを作成
            const { LODGenerator } = await import('./LODGenerator.js');
            lodGenerator = new LODGenerator(this);
        }
        
        if (!lodGenerator) {
            return 'Failed to initialize LOD generator';
        }
        
        try {
            await lodGenerator.testLODGeneration();
            return 'LOD demo completed successfully! Check console for details.';
        } catch (error) {
            console.error('❌ LOD demo failed:', error);
            return `LOD demo failed: ${error.message}`;
        }
    }
    
    // LOD統計情報を取得
    getLODGeneratorStats() {
        let lodGenerator;
        if (this.pixiRenderer?.lodGenerator) {
            lodGenerator = this.pixiRenderer.lodGenerator;
        }
        
        if (!lodGenerator) {
            return 'LOD generator not available';
        }
        
        return lodGenerator.getStats();
    }
}

// Initialize when DOM is ready with error catching
function initializePixelCanvas() {
    try {
        window.pixelCanvas = new PixelCanvas();
    } catch (error) {
        console.error('❌ Failed to initialize PixelCanvas:', error);
        document.body.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: #ff4444; color: white; padding: 20px; border-radius: 10px; 
                        font-family: Arial, sans-serif; text-align: center; z-index: 99999;">
                <h2>❌ PixelCanvas Failed to Load</h2>
                <p>Error: ${error.message}</p>
                <p><small>Check console for details</small></p>
            </div>
        `;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePixelCanvas);
} else {
    initializePixelCanvas();
}

// Export for testing
export default PixelCanvas;
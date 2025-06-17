// PixelCanvas Main Application - Modularized Version
import { CONFIG, Utils } from './Config.js';
import { DebugPanel } from './DebugPanel.js';
import { EventHandlers } from './EventHandlers.js';
import { ViewportController } from './ViewportController.js';
import { RenderEngine } from './RenderEngine.js';
import { SectorManager } from './SectorManager.js';
import { NetworkManager } from './NetworkManager.js';
import { PixelStorage } from './PixelStorage.js';

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
        this.activeSectors = new Set(['0,0']);
        this.isExpansionRunning = false;
        this.deviceId = Utils.generateDeviceId();
        
        // Canvas size tracking
        this.logicalWidth = 0;
        this.logicalHeight = 0;
        
        // Initialize modules
        this.debugPanel = DebugPanel.getInstance();
        this.pixelStorage = new PixelStorage(this);
        this.viewportController = new ViewportController(this);
        this.renderEngine = new RenderEngine(this.canvas, this.ctx, this);
        this.sectorManager = new SectorManager(this);
        this.networkManager = new NetworkManager(this);
        this.eventHandlers = new EventHandlers(this.canvas, this);
        
        // Delegate properties for backward compatibility
        this.pixels = this.pixelStorage.pixels;
        this.pixelStock = this.pixelStorage.pixelStock;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.renderEngine.setupColorPalette();
        this.loadInitialData();
        this.setupOnlineStatusHandling();
        this.registerServiceWorker();
        
        // Center viewport on active sectors
        this.viewportController.centerViewportOnActiveSectors();
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
            this.debugPanel.log('🌐 Back online - flushing queue');
            this.networkManager.updateStatus(true);
            this.networkManager.flushQueue();
        });
        
        window.addEventListener('offline', () => {
            this.debugPanel.log('📴 Gone offline');
            this.networkManager.updateStatus(false);
        });
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    }
    
    loadInitialData() {
        this.debugPanel.log('🚀 Initializing PixelCanvas...');
        
        // Load pixels and sector data
        this.networkManager.loadPixelsFromSupabase().then(() => {
            this.render();
            this.debugPanel.log('✅ Initialization complete');
        });
        
        // Load sector counts (for reference only, we use real-time counting)
        this.networkManager.loadSectorCounts();
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
            this.debugPanel.log('🚫 Click outside valid bounds');
            return;
        }
        
        // Check if within active sectors
        if (!this.sectorManager.isWithinActiveSectors(worldX, worldY)) {
            this.showOutOfBoundsWarning();
            return;
        }
        
        // Check if pixel already exists
        if (this.pixelStorage.hasPixel(local.sectorX, local.sectorY, local.localX, local.localY)) {
            this.debugPanel.log('🚫 Pixel already exists at this location');
            return;
        }
        
        this.debugPanel.log(`🎯 Click: screen(${x.toFixed(1)}, ${y.toFixed(1)}) → world(${worldX}, ${worldY}) → sector(${local.sectorX}, ${local.sectorY}) local(${local.localX}, ${local.localY})`);
        
        // Draw the pixel
        this.pixelStorage.drawPixel(local.sectorX, local.sectorY, local.localX, local.localY, this.currentColor);
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
        this.renderEngine.render();
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
    
    // Debug methods
    logState() {
        const stats = this.getStats();
        this.debugPanel.log(`📊 App State: ${JSON.stringify(stats, null, 2)}`);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pixelCanvas = new PixelCanvas();
    });
} else {
    window.pixelCanvas = new PixelCanvas();
}

// Export for testing
export default PixelCanvas;
// Pixel data storage and stock management for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class PixelStorage {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.pixels = new Map(); // Main pixel storage
        
        // Stock management
        this.pixelStock = CONFIG.MAX_PIXEL_STOCK;
        this.stockRecoveryInterval = null;
        
        this.initializePixelStock();
        this.startStockRecovery();
    }
    
    // Pixel management methods
    addPixel(sectorX, sectorY, localX, localY, color) {
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        this.pixels.set(pixelKey, color);
        
        // Also store in localStorage for persistence
        this.savePixelToLocalStorage(pixelKey, color);
        
        console.log(`💾 Pixel added: ${pixelKey} = color ${color}`);
    }
    
    getPixel(sectorX, sectorY, localX, localY) {
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        return this.pixels.get(pixelKey);
    }
    
    hasPixel(sectorX, sectorY, localX, localY) {
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        return this.pixels.has(pixelKey);
    }
    
    savePixelToLocalStorage(pixelKey, color) {
        try {
            const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
            savedPixels[pixelKey] = color;
            localStorage.setItem('pixelcanvas_pixels', JSON.stringify(savedPixels));
        } catch (error) {
            console.error('Failed to save pixel to localStorage:', error);
        }
    }
    
    loadPixelsFromLocalStorage() {
        try {
            const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
            for (const [key, color] of Object.entries(savedPixels)) {
                this.pixels.set(key, color);
            }
            // this.pixelCanvas.debugPanel.log(`📱 Loaded ${Object.keys(savedPixels).length} pixels from local storage`);
        } catch (error) {
            console.error('Failed to load pixels from localStorage:', error);
        }
    }
    
    clearAllPixels() {
        this.pixels.clear();
        localStorage.removeItem('pixelcanvas_pixels');
        // this.pixelCanvas.debugPanel.log('🗑️ All pixels cleared');
    }
    
    getPixelCount() {
        return this.pixels.size;
    }
    
    // Stock management methods
    initializePixelStock() {
        // Load stock from localStorage
        const savedStock = localStorage.getItem('pixelcanvas_stock');
        const savedTime = localStorage.getItem('pixelcanvas_stock_time');
        
        if (savedStock && savedTime) {
            const timeDiff = Date.now() - parseInt(savedTime);
            const recoveredStock = Math.floor(timeDiff / CONFIG.STOCK_RECOVER_MS);
            
            this.pixelStock = Math.min(
                CONFIG.MAX_PIXEL_STOCK,
                parseInt(savedStock) + recoveredStock
            );
            
            // this.pixelCanvas.debugPanel.log(`💰 Stock initialized: ${this.pixelStock}/${CONFIG.MAX_PIXEL_STOCK} (recovered ${recoveredStock})`);
        } else {
            this.pixelStock = CONFIG.MAX_PIXEL_STOCK;
            // this.pixelCanvas.debugPanel.log(`💰 Stock initialized: ${this.pixelStock}/${CONFIG.MAX_PIXEL_STOCK} (new user)`);
        }
        
        this.updateStockDisplay();
        this.saveStockState();
    }
    
    consumeStock() {
        if (this.pixelStock > 0) {
            this.pixelStock--;
            this.updateStockDisplay();
            this.saveStockState();
            return true;
        }
        return false;
    }
    
    hasStock() {
        return this.pixelStock > 0;
    }
    
    saveStockState() {
        localStorage.setItem('pixelcanvas_stock', this.pixelStock.toString());
        localStorage.setItem('pixelcanvas_stock_time', Date.now().toString());
    }
    
    startStockRecovery() {
        // Clear any existing interval
        if (this.stockRecoveryInterval) {
            clearInterval(this.stockRecoveryInterval);
        }
        
        // Recover 1 stock every STOCK_RECOVER_MS
        this.stockRecoveryInterval = setInterval(() => {
            if (this.pixelStock < CONFIG.MAX_PIXEL_STOCK) {
                this.pixelStock++;
                this.updateStockDisplay();
                this.saveStockState();
                
                // this.pixelCanvas.debugPanel.log(`💰 Stock recovered: ${this.pixelStock}/${CONFIG.MAX_PIXEL_STOCK}`);
            }
        }, CONFIG.STOCK_RECOVER_MS);
    }
    
    updateStockDisplay() {
        const pixelCount = document.getElementById('pixelCount');
        if (!pixelCount) return;
        
        // Update stock display
        pixelCount.textContent = `${this.pixelStock}/${CONFIG.MAX_PIXEL_STOCK}`;
        
        // Update cooldown indicator
        const cooldownIndicator = document.getElementById('cooldownIndicator');
        if (cooldownIndicator) {
            if (this.pixelStock < CONFIG.MAX_PIXEL_STOCK) {
                // Calculate actual time remaining until next recovery
                const lastUpdate = parseInt(localStorage.getItem('pixelcanvas_stock_time') || '0');
                const timeSinceLastUpdate = Date.now() - lastUpdate;
                const timeToNext = Math.max(0, CONFIG.STOCK_RECOVER_MS - timeSinceLastUpdate);
                const secondsToNext = Math.ceil(timeToNext / 1000);
                
                cooldownIndicator.textContent = `Next: ${secondsToNext}s`;
                cooldownIndicator.style.display = 'inline-block';
            } else {
                cooldownIndicator.style.display = 'none';
            }
        }
        
        // Update stock bar if it exists
        this.updateStockBar();
    }
    
    updateStockBar() {
        let stockBar = document.getElementById('stockBar');
        if (!stockBar) {
            // Create stock bar if it doesn't exist
            stockBar = document.createElement('div');
            stockBar.id = 'stockBar';
            stockBar.style.cssText = `
                position: fixed;
                bottom: 110px;
                left: 50%;
                transform: translateX(-50%);
                width: 200px;
                height: 8px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.3);
                z-index: 1000;
            `;
            
            const stockFill = document.createElement('div');
            stockFill.id = 'stockFill';
            stockFill.style.cssText = `
                height: 100%;
                background: linear-gradient(90deg, #ff4444, #ffaa00, #44ff44);
                transition: width 0.3s ease;
                border-radius: 3px;
            `;
            
            stockBar.appendChild(stockFill);
            document.body.appendChild(stockBar);
        }
        
        const stockFill = document.getElementById('stockFill');
        if (stockFill) {
            const percentage = (this.pixelStock / CONFIG.MAX_PIXEL_STOCK) * 100;
            stockFill.style.width = `${percentage}%`;
        }
    }
    
    // Get pixel count for a specific sector
    getSectorPixelCount(sectorX, sectorY) {
        let count = 0;
        for (const [key, color] of this.pixels) {
            const [pSectorX, pSectorY] = key.split(',').map(Number);
            if (pSectorX === sectorX && pSectorY === sectorY) {
                count++;
            }
        }
        return count;
    }
    
    // Utility methods for pixel operations
    drawPixel(sectorX, sectorY, localX, localY, color) {
        // Check if we have stock
        if (!this.hasStock()) {
            this.pixelCanvas.debugPanel.log('🚫 No stock available for drawing');
            return false;
        }
        
        // Consume stock
        if (!this.consumeStock()) {
            return false;
        }
        
        // Add pixel to storage
        this.addPixel(sectorX, sectorY, localX, localY, color);
        
        // Calculate world coordinates for rendering
        const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
        
        console.log(`Drawing pixel at (${world.x}, ${world.y}) with color ${color} (${CONFIG.COLORS[color]})`);
        
        // Force a complete re-render to ensure pixel is drawn
        this.pixelCanvas.render();
        
        // Create pixel object for network transmission
        const pixel = { 
            s: Utils.createSectorKey(sectorX, sectorY), 
            x: localX, 
            y: localY, 
            c: color 
        };
        
        // Send pixel to network
        console.log(`🌐 Network status: ${navigator.onLine ? 'ONLINE' : 'OFFLINE'}`);
        console.log(`📤 Sending pixel to network:`, pixel);
        
        if (navigator.onLine) {
            this.pixelCanvas.networkManager.sendPixel(pixel);
        } else {
            console.warn('⚠️ Offline - queueing pixel for later');
            this.pixelCanvas.networkManager.queuePixel(pixel);
        }
        
        return true;
    }
    
    // Test methods for debugging
    async testExpansion() {
        this.pixelCanvas.debugPanel.log('🧪 Testing expansion mechanism...');
        
        // Add 7 test pixels to sector (0,0) to trigger expansion
        const testSectorX = 0;
        const testSectorY = 0;
        
        for (let i = 0; i < 7; i++) {
            const localX = i * 10; // Spread them out
            const localY = 10;
            
            if (localX < CONFIG.GRID_SIZE && localY < CONFIG.GRID_SIZE) {
                this.addPixel(testSectorX, testSectorY, localX, localY, i % CONFIG.COLORS.length);
            }
        }
        
        this.pixelCanvas.debugPanel.log(`🧪 Added 7 test pixels to sector (${testSectorX}, ${testSectorY})`);
        
        // Trigger expansion check
        setTimeout(() => {
            this.pixelCanvas.sectorManager.checkLoadedSectorsForExpansion();
        }, 1000);
        
        // Re-render to show pixels
        this.pixelCanvas.render();
    }
    
    getStats() {
        return {
            totalPixels: this.pixels.size,
            currentStock: this.pixelStock,
            maxStock: CONFIG.MAX_PIXEL_STOCK,
            stockPercentage: (this.pixelStock / CONFIG.MAX_PIXEL_STOCK) * 100
        };
    }
}
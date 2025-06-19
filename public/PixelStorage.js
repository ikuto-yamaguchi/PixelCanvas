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
        } catch (error) {
            console.error('Failed to load pixels from localStorage:', error);
        }
    }
    
    clearAllPixels() {
        this.pixels.clear();
        localStorage.removeItem('pixelcanvas_pixels');
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
            
        } else {
            this.pixelStock = CONFIG.MAX_PIXEL_STOCK;
        }
        
        this.updateStockDisplay();
        this.saveStockState();
    }
    
    consumeStock() {
        if (this.pixelStock > 0) {
            this.pixelStock--;
            this.updateStockDisplay();
            this.saveStockState();
            
            // PERFORMANCE FIX: Restart timer only when stock is consumed
            if (this.pixelStock < CONFIG.MAX_PIXEL_STOCK && !this.stockRecoveryInterval) {
                this.startOptimizedStockRecovery();
            }
            
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
        
        // PERFORMANCE FIX: Use demand-based recovery instead of constant timer
        this.lastStockCheck = Date.now();
        this.startOptimizedStockRecovery();
    }
    
    startOptimizedStockRecovery() {
        // PERFORMANCE FIX: Check stock only when needed, not constantly
        this.checkStockRecovery = () => {
            const now = Date.now();
            const timeSinceLastCheck = now - this.lastStockCheck;
            
            if (this.pixelStock < CONFIG.MAX_PIXEL_STOCK && timeSinceLastCheck >= CONFIG.STOCK_RECOVER_MS) {
                const stockToRecover = Math.floor(timeSinceLastCheck / CONFIG.STOCK_RECOVER_MS);
                this.pixelStock = Math.min(CONFIG.MAX_PIXEL_STOCK, this.pixelStock + stockToRecover);
                this.lastStockCheck = now;
                this.updateStockDisplay();
                this.saveStockState();
            }
        };
        
        // Only run timer when stock is not full - much more efficient
        this.stockRecoveryInterval = setInterval(() => {
            if (this.pixelStock >= CONFIG.MAX_PIXEL_STOCK) {
                clearInterval(this.stockRecoveryInterval);
                this.stockRecoveryInterval = null;
                return;
            }
            this.checkStockRecovery();
        }, CONFIG.STOCK_RECOVER_MS * 3); // Check 3x less frequently
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
        console.error('🎨 DRAW PIXEL START:', {sectorX, sectorY, localX, localY, color, currentStock: this.pixelStock});
        
        // Check if we have stock
        if (!this.hasStock()) {
            console.error('🚫 NO STOCK AVAILABLE FOR DRAWING:', {currentStock: this.pixelStock});
            this.pixelCanvas.debugPanel.log('🚫 No stock available for drawing');
            return false;
        }
        
        // Consume stock
        if (!this.consumeStock()) {
            console.error('🚫 FAILED TO CONSUME STOCK:', {currentStock: this.pixelStock});
            return false;
        }
        
        console.error('✅ STOCK CONSUMED, PROCEEDING WITH PIXEL DRAW:', {newStock: this.pixelStock});
        
        // Add pixel to storage
        this.addPixel(sectorX, sectorY, localX, localY, color);
        
        // Calculate world coordinates for rendering
        const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
        
        // 🚀 PixiJS LOD更新通知
        if (this.pixelCanvas.pixiRenderer && this.pixelCanvas.pixiRenderer.isInitialized) {
            this.pixelCanvas.pixiRenderer.updateLODForPixelChange(sectorX, sectorY, localX, localY, color);
        }
        
        // Force a complete re-render to ensure pixel is drawn
        this.pixelCanvas.render();
        
        // Create pixel object for network transmission
        const pixel = { 
            s: Utils.createSectorKey(sectorX, sectorY), 
            x: localX, 
            y: localY, 
            c: color 
        };
        
        // Send pixel to network with error handling
        if (navigator.onLine) {
            try {
                this.pixelCanvas.networkManager.sendPixel(pixel);
            } catch (error) {
                console.error('❌ Network send failed, queuing pixel:', error);
                this.pixelCanvas.networkManager.queuePixel(pixel);
            }
        } else {
            console.log('📴 Offline: Queuing pixel');
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
    
    // 🚨 CRITICAL MISSING METHODS: データベース読み込み用
    setPixel(sectorX, sectorY, localX, localY, color) {
        // NetworkManagerから呼ばれるピクセル設定メソッド
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        this.pixels.set(pixelKey, color);
        
        // ローカルストレージにも保存（データベース読み込み時はスキップ）
        // this.savePixelToLocalStorage(pixelKey, color);
        
        // ピクセル数カウント表示は呼び出し元で更新
        // this.updateStockDisplay();
    }
    
    // ピクセル数表示更新
    updateStockDisplay() {
        const pixelCountElement = document.getElementById('pixelCount');
        if (pixelCountElement) {
            const totalPixels = this.pixels.size;
            pixelCountElement.textContent = `${totalPixels}px`;
            
            console.log(`📊 Updated pixel count display: ${totalPixels} pixels`);
        }
        
        // ストック表示も更新
        const stockDisplay = document.querySelector('.stock-display');
        if (stockDisplay) {
            stockDisplay.textContent = `Stock: ${this.pixelStock}/${CONFIG.MAX_PIXEL_STOCK}`;
        }
    }
    
    // ピクセル削除
    deletePixel(sectorX, sectorY, localX, localY) {
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        const removed = this.pixels.delete(pixelKey);
        
        if (removed) {
            // ローカルストレージからも削除
            this.removePixelFromLocalStorage(pixelKey);
            this.updateStockDisplay();
        }
        
        return removed;
    }
    
    // ローカルストレージからピクセル削除
    removePixelFromLocalStorage(pixelKey) {
        try {
            const stored = localStorage.getItem('pixelcanvas_pixels');
            if (stored) {
                const storedPixels = JSON.parse(stored);
                delete storedPixels[pixelKey];
                localStorage.setItem('pixelcanvas_pixels', JSON.stringify(storedPixels));
            }
        } catch (error) {
            console.error('Failed to remove pixel from localStorage:', error);
        }
    }
    
    // ピクセル存在確認
    hasPixel(sectorX, sectorY, localX, localY) {
        const pixelKey = Utils.createPixelKey(sectorX, sectorY, localX, localY);
        return this.pixels.has(pixelKey);
    }
}
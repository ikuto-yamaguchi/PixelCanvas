// Network and real-time communication for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class NetworkManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.supabaseClient = null;
        this.realtimeChannel = null;
        this.cachedIP = null;
        this.ipCacheTime = 0;
        this.pendingPixels = [];
        
        this.initializeSupabase();
    }
    
    initializeSupabase() {
        if (typeof window !== 'undefined' && window.supabase) {
            this.supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            this.setupRealtimeSubscription();
        }
    }
    
    setupRealtimeSubscription() {
        if (!this.supabaseClient) return;
        
        try {
            this.realtimeChannel = this.supabaseClient
                .channel('pixels_channel')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'pixels'
                }, (payload) => {
                    this.handleRemotePixel(payload.new);
                })
                .subscribe((status) => {
                });
        } catch (error) {
            console.error('Failed to setup real-time subscription:', error);
        }
    }
    
    handleRemotePixel(pixelData) {
        // 🚨 EMERGENCY FIX: Add remote pixel to PixelStorage and trigger render
        this.pixelCanvas.pixelStorage.addPixel(
            pixelData.sector_x,
            pixelData.sector_y,
            pixelData.local_x,
            pixelData.local_y,
            pixelData.color
        );
        
        // Trigger re-render to show the new pixel
        this.pixelCanvas.render();
    }
    
    async sendPixel(pixel) {
        if (!navigator.onLine) {
            this.queuePixel(pixel);
            return;
        }
        
        try {
            // Check rate limit before sending
            if (!(await this.checkRateLimit())) {
                return;
            }
            
            // Get IP address for logging
            const ipAddress = await this.getCachedIP();
            
            const [sectorX, sectorY] = pixel.s.split(',').map(Number);
            
            const pixelData = {
                sector_x: sectorX,
                sector_y: sectorY,
                local_x: pixel.x,
                local_y: pixel.y,
                color: pixel.c
            };
            
            // Send to Supabase
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(pixelData)
            });
            
            if (response.ok) {
                
                // Log user action and sync stock
                this.logUserActionLazy('pixel_draw');
                this.syncWithServerStock();
                
                // Update sector count in database
                const sectorKey = Utils.createSectorKey(sectorX, sectorY);
                // Get current pixel count for this sector
                const pixelCount = this.pixelCanvas.pixelStorage.getSectorPixelCount(sectorX, sectorY);
                this.pixelCanvas.sectorManager.updateSectorCountInDatabase(sectorX, sectorY, pixelCount);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to send pixel:', {
                error: error.message || error,
                pixelData: pixelData,
                stack: error.stack,
                url: `${CONFIG.SUPABASE_URL}/rest/v1/pixels`
            });
            this.queuePixel(pixel);
        }
    }
    
    async queuePixel(pixel) {
        this.pendingPixels.push(pixel);
        
        if (window.idb) {
            try {
                const existingQueue = await window.idb.get('queue') || [];
                existingQueue.push(pixel);
                await window.idb.set('queue', existingQueue);
            } catch (error) {
                console.error('Failed to queue pixel:', error);
            }
        }
    }
    
    updateStatus(online) {
        const statusIndicator = document.getElementById('status');
        if (statusIndicator) {
            statusIndicator.classList.toggle('offline', !online);
        }
    }
    
    async flushQueue() {
        if (!window.idb) return;
        
        const queue = await window.idb.get('queue') || [];
        if (queue.length === 0) return;
        
        
        for (const pixel of queue) {
            await this.sendPixel(pixel);
        }
        
        await window.idb.del('queue');
    }
    
    async checkRateLimit() {
        const ipAddress = await this.getCachedIP();
        const serverStock = await this.getServerSideStock(ipAddress);
        
        if (serverStock <= 0) {
            this.pixelCanvas.debugPanel.log(`🚫 Server rate limit: ${serverStock} stock remaining`);
            return false;
        }
        
        return true;
    }
    
    async getServerSideStock(ipAddress) {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/user_actions?ip_address=eq.${ipAddress}&action_type=eq.pixel_draw&created_at=gte.${new Date(Date.now() - CONFIG.RATE_LIMIT_MS).toISOString()}&select=count`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const recentActions = data.length;
                return Math.max(0, CONFIG.MAX_PIXEL_STOCK - recentActions);
            }
        } catch (error) {
            console.error('Failed to check server stock:', error);
        }
        
        return CONFIG.MAX_PIXEL_STOCK; // Default to max if check fails
    }
    
    async getCachedIP() {
        const now = Date.now();
        
        // Use cached IP if less than 5 minutes old
        if (this.cachedIP && (now - this.ipCacheTime) < 300000) {
            return this.cachedIP;
        }
        
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            this.cachedIP = data.ip;
            this.ipCacheTime = now;
            return this.cachedIP;
        } catch (error) {
            console.error('Failed to get IP address:', error);
            return this.cachedIP || 'unknown';
        }
    }
    
    logUserActionLazy(actionType) {
        // Fire-and-forget user action logging
        this.logUserAction(actionType).catch(error => {
            console.error('Failed to log user action:', error);
        });
    }
    
    async logUserAction(actionType) {
        try {
            const ipAddress = await this.getCachedIP();
            
            const actionData = {
                device_id: this.pixelCanvas.deviceId,
                ip_address: ipAddress,
                action_type: actionType,
                created_at: new Date().toISOString()
            };
            
            await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/user_actions`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(actionData)
            });
        } catch (error) {
            console.error('Failed to log user action:', error);
        }
    }
    
    async syncWithServerStock() {
        try {
            const ipAddress = await this.getCachedIP();
            const serverStock = await this.getServerSideStock(ipAddress);
            
            // Update local stock to match server
            this.pixelCanvas.pixelStock = Math.min(this.pixelCanvas.pixelStock, serverStock);
            this.pixelCanvas.updateStockDisplay();
            
            this.pixelCanvas.debugPanel.log(`📊 Stock synced: ${this.pixelCanvas.pixelStock}/${CONFIG.MAX_PIXEL_STOCK}`);
        } catch (error) {
            console.error('Failed to sync with server stock:', error);
        }
    }
    
    async loadPixelsFromSupabase() {
        
        try {
            // 🔧 CRITICAL FIX: Load from dense sectors first (0,0) then expand
            console.log('🎯 Loading pixels from highest density sectors first...');
            
            // Load from sector (0,0) first - contains 99% of all pixels
            const mainResponse = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=*&sector_x=eq.0&sector_y=eq.0&limit=5000`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (!mainResponse.ok) {
                throw new Error(`HTTP ${mainResponse.status}: ${mainResponse.statusText}`);
            }
            
            let allPixels = await mainResponse.json();
            console.log(`📦 Loaded ${allPixels.length} pixels from sector (0,0)`);
            
            // Load from adjacent sectors (-1,-1), (-1,0), (0,-1) etc.
            const adjacentSectors = [
                { x: -1, y: -1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
                { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 },
                { x: 3, y: -4 }, { x: -2, y: -1 } // High density sectors from data
            ];
            
            for (const sector of adjacentSectors) {
                try {
                    const sectorResponse = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=*&sector_x=eq.${sector.x}&sector_y=eq.${sector.y}&limit=1000`, {
                        headers: {
                            'apikey': CONFIG.SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                        }
                    });
                    
                    if (sectorResponse.ok) {
                        const sectorPixels = await sectorResponse.json();
                        if (sectorPixels.length > 0) {
                            allPixels = allPixels.concat(sectorPixels);
                            console.log(`📦 Added ${sectorPixels.length} pixels from sector (${sector.x},${sector.y})`);
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to load sector (${sector.x},${sector.y}):`, error);
                }
            }
            
            // Add each pixel to the pixels map and calculate occupied sectors
            const occupiedSectors = new Set();
            
            for (const pixel of allPixels) {
                this.pixelCanvas.pixelStorage.addPixel(
                    pixel.sector_x,
                    pixel.sector_y,
                    pixel.local_x,
                    pixel.local_y,
                    pixel.color
                );
                
                // Track which sectors have pixels
                const sectorKey = Utils.createSectorKey(pixel.sector_x, pixel.sector_y);
                occupiedSectors.add(sectorKey);
            }
            
            // Initialize active sectors: start with (0,0) and add neighbors of any occupied sectors
            this.initializeActiveSectors(occupiedSectors);
            
            // Also save to localStorage for offline access  
            const pixelsObject = {};
            for (const [key, color] of this.pixelCanvas.pixelStorage.pixels) {
                pixelsObject[key] = color;
            }
            localStorage.setItem('pixelcanvas_pixels', JSON.stringify(pixelsObject));
            
            console.log('✅ Pixels loaded and cached locally');
            
            // Force immediate render after loading
            this.pixelCanvas.render();
            
        } catch (error) {
            console.error('Failed to load pixels from Supabase:', error);
            this.pixelCanvas.debugPanel.log(`❌ Failed to load pixels: ${error.message}`);
            
            // Fallback to localStorage
            this.loadPixelsFromLocalStorage();
        }
    }
    
    /**
     * 🔧 NEW: Layer system data loading
     */
    async loadLayeredData() {
        try {
            console.log('🔧 Loading data via layer system - falling back to direct pixel loading');
            
            // 🚨 IMMEDIATE FIX: Load actual pixels instead of empty layer data
            console.log('📊 Loading pixels directly from database...');
            
            // Load more pixels for proper initialization  
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=*&limit=10000&offset=0`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Range': '0-9999'  // Request up to 10000 rows (0-indexed)
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const pixels = await response.json();
            console.log(`📦 Loaded ${pixels.length} pixels from database`);
            
            // Add all pixels to storage
            const occupiedSectors = new Set();
            for (const pixel of pixels) {
                this.pixelCanvas.pixelStorage.addPixel(
                    pixel.sector_x,
                    pixel.sector_y,
                    pixel.local_x,
                    pixel.local_y,
                    pixel.color
                );
                
                const sectorKey = Utils.createSectorKey(pixel.sector_x, pixel.sector_y);
                occupiedSectors.add(sectorKey);
            }
            
            // Initialize active sectors
            this.initializeActiveSectors(occupiedSectors);
            
            console.log('✅ Layer data loading complete');
            console.log('🔍 Final pixel count in storage:', this.pixelCanvas.pixelStorage.pixels.size);
            
        } catch (error) {
            console.error('❌ Layer data loading failed:', error);
            
            // Fallback to minimal legacy loading
            return this.loadPixelsFromLocalStorage();
        }
    }
    
    loadPixelsFromLocalStorage() {
        try {
            const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
            // 🚨 EMERGENCY FIX: Set pixels directly to PixelStorage.pixels
            for (const [key, color] of Object.entries(savedPixels)) {
                this.pixelCanvas.pixelStorage.pixels.set(key, color);
            }
            console.error(`🚨 EMERGENCY DEBUG: 📱 Loaded ${Object.keys(savedPixels).length} pixels from local storage`);
        } catch (error) {
            console.error('Failed to load pixels from localStorage:', error);
        }
    }
    
    async loadSectorCounts() {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors?select=*`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (response.ok) {
                const sectors = await response.json();
                this.pixelCanvas.debugPanel.log(`📊 Loaded ${sectors.length} sector counts from database`);
                
                // Note: We no longer store these in a separate map, 
                // using real-time pixel counting instead
                return sectors;
            }
        } catch (error) {
            console.error('Failed to load sector counts:', error);
        }
        
        return [];
    }
    
    initializeActiveSectors(occupiedSectors) {
        // Clear existing active sectors
        this.pixelCanvas.activeSectors.clear();
        
        // Always start with (0,0) as active
        this.pixelCanvas.activeSectors.add('0,0');
        
        // CRITICAL FIX: Add all occupied sectors as active first
        for (const sectorKey of occupiedSectors) {
            this.pixelCanvas.activeSectors.add(sectorKey);
        }
        
        // Then add empty neighbors around occupied sectors
        for (const sectorKey of occupiedSectors) {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            
            // Add all neighbors (empty or not) around this occupied sector
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const neighborKey = Utils.createSectorKey(sectorX + dx, sectorY + dy);
                    this.pixelCanvas.activeSectors.add(neighborKey);
                }
            }
        }
        
        this.pixelCanvas.debugPanel.log(`🎯 Initialized ${this.pixelCanvas.activeSectors.size} active sectors (${occupiedSectors.size} occupied + neighbors)`);
        this.pixelCanvas.debugPanel.log(`📍 Active sectors: ${Array.from(this.pixelCanvas.activeSectors).slice(0, 10).join(', ')}${this.pixelCanvas.activeSectors.size > 10 ? '...' : ''}`);
    }
}
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
                    // this.pixelCanvas.debugPanel.log(`📡 Real-time: ${status}`);
                });
        } catch (error) {
            console.error('Failed to setup real-time subscription:', error);
            // this.pixelCanvas.debugPanel.log(`❌ Real-time setup failed: ${error.message}`);
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
            // this.pixelCanvas.debugPanel.log('📴 Offline: Queueing pixel');
            this.queuePixel(pixel);
            return;
        }
        
        try {
            // Check rate limit before sending
            if (!(await this.checkRateLimit())) {
                // this.pixelCanvas.debugPanel.log('🚫 Rate limited: Cannot send pixel');
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
                // this.pixelCanvas.debugPanel.log(`✅ Pixel sent: (${sectorX},${sectorY},${pixel.x},${pixel.y})`);
                
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
            console.error('Failed to send pixel:', error);
            // this.pixelCanvas.debugPanel.log(`❌ Send failed: ${error.message}`);
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
        
        // this.pixelCanvas.debugPanel.log(`📤 Flushing ${queue.length} queued pixels...`);
        
        for (const pixel of queue) {
            await this.sendPixel(pixel);
        }
        
        await window.idb.del('queue');
        // this.pixelCanvas.debugPanel.log('✅ Queue flushed successfully');
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
        // 🔧 EMERGENCY SWITCH: Use layer system instead of heavy pixel loading
        if (this.pixelCanvas.layerManager && this.pixelCanvas.layerManager.supabase) {
            console.log('🔧 Using lightweight layer system for data loading...');
            return this.loadLayeredData();
        }
        
        console.log('⚠️ Layer system not ready, using minimal legacy load...');
        
        try {
            // 🔧 EMERGENCY: Load only first 1000 pixels to prevent freezing
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=*&limit=1000&offset=0`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const allPixels = await response.json();
            console.log(`📦 Loaded ${allPixels.length} pixels (limited for performance)`);
            
            // Add each pixel to the pixels map and calculate occupied sectors
            const occupiedSectors = new Set();
            
            for (const pixel of allPixels) {
                // 🚨 EMERGENCY FIX: Use PixelStorage.addPixel instead of direct map access
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
            console.log('🔧 Loading initial layer data...');
            
            // Get current zoom level to determine which layer to load
            const zoomLevel = this.pixelCanvas.scale || 0.1;
            const optimalLayer = this.pixelCanvas.layerManager.getOptimalLayer(zoomLevel);
            
            console.log(`📊 Using layer: ${optimalLayer.name} for zoom ${zoomLevel}`);
            
            // Calculate viewport bounds
            const bounds = {
                minSectorX: -5,
                maxSectorX: 5,
                minSectorY: -5,
                maxSectorY: 5
            };
            
            // Load layer data
            const layerData = await this.pixelCanvas.layerManager.loadLayerData(optimalLayer, bounds);
            
            // If no layer data exists, load some base pixels and create layers
            if (layerData.length === 0) {
                console.log('📊 No layer data found, loading base pixels...');
                
                // Load a sample of pixels to build initial layers
                const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=*&limit=100&offset=0`, {
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                    }
                });
                
                if (response.ok) {
                    const pixels = await response.json();
                    
                    // Add to pixel storage
                    for (const pixel of pixels) {
                        this.pixelCanvas.pixelStorage.addPixel(
                            pixel.sector_x,
                            pixel.sector_y,
                            pixel.local_x,
                            pixel.local_y,
                            pixel.color
                        );
                    }
                    
                    console.log(`📦 Loaded ${pixels.length} base pixels for layer system`);
                }
            }
            
            console.log('✅ Layer data loading complete');
            
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
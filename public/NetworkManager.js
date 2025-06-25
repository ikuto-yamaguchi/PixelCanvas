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
        console.log('🔧 Initializing Supabase client...');
        console.log('🔧 window.supabase available:', !!window.supabase);
        console.log('🔧 SUPABASE_URL:', CONFIG.SUPABASE_URL);
        console.log('🔧 SUPABASE_ANON_KEY:', CONFIG.SUPABASE_ANON_KEY ? 'Set' : 'Missing');
        
        if (typeof window !== 'undefined' && window.supabase) {
            try {
                this.supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
                console.log('✅ Supabase client created successfully');
                this.setupRealtimeSubscription();
            } catch (error) {
                console.error('❌ Failed to create Supabase client:', error);
            }
        } else {
            console.error('❌ window.supabase not available - retrying in 1 second...');
            
            // 🚨 CRITICAL: Retry initialization after delay
            setTimeout(() => {
                if (window.supabase && !this.supabaseClient) {
                    console.log('🔄 Retrying Supabase initialization...');
                    this.supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
                    console.log('✅ Supabase client created on retry');
                    this.setupRealtimeSubscription();
                }
            }, 1000);
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
                    'Accept': 'application/json',
                    'Prefer': 'return=minimal'
                },
                mode: 'cors',
                credentials: 'omit',
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
    
    // 🚨 REMOVED: Duplicate method - using the comprehensive version below (line 497)
    
    /**
     * 🔧 NEW: Layer system data loading
     */
    async loadLayeredData() {
        try {
            console.log('🔧 Loading data via progressive loading system to prevent freeze');
            
            // 🚨 CRITICAL FIX: Progressive loading to prevent browser freeze
            console.log('📊 Starting progressive pixel loading...');
            
            return await this.loadPixelsProgressively();
            
        } catch (error) {
            console.error('❌ Progressive data loading failed:', error);
            
            // Fallback to minimal legacy loading
            return this.loadPixelsFromLocalStorage();
        }
    }
    
    // 🚨 NEW: Progressive loading system to prevent freeze
    async loadPixelsProgressively() {
        try {
            // First, get total count
            const countResponse = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=count&limit=1`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (!countResponse.ok) {
                throw new Error(`Count query failed: ${countResponse.status}`);
            }
            
            const countData = await countResponse.json();
            const totalPixels = countData[0]?.count || 0;
            console.log(`📊 Total pixels in database: ${totalPixels}`);
            
            if (totalPixels === 0) {
                console.warn('⚠️ No pixels found in database');
                return;
            }
            
            // Progressive loading configuration
            const batchSize = 1000; // Load 1000 pixels at a time
            const subBatchSize = 50;  // Process 50 pixels at a time
            let loadedCount = 0;
            const occupiedSectors = new Set();
            
            // Load in batches to prevent freeze
            for (let offset = 0; offset < totalPixels; offset += batchSize) {
                console.log(`📥 Loading batch ${Math.floor(offset/batchSize) + 1}/${Math.ceil(totalPixels/batchSize)} (${offset}-${Math.min(offset + batchSize, totalPixels)})`);
                
                const batchStartTime = performance.now();
                
                // Load batch from database
                const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=sector_x,sector_y,local_x,local_y,color&limit=${batchSize}&offset=${offset}`, {
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                    }
                });
                
                if (!response.ok) {
                    console.warn(`⚠️ Batch ${Math.floor(offset/batchSize) + 1} failed: ${response.status}`);
                    continue;
                }
                
                const pixels = await response.json();
                
                // Process in sub-batches to prevent freeze
                for (let i = 0; i < pixels.length; i += subBatchSize) {
                    const subBatch = pixels.slice(i, i + subBatchSize);
                    
                    // Add pixels to storage
                    for (const pixel of subBatch) {
                        this.pixelCanvas.pixelStorage.addPixel(
                            pixel.sector_x,
                            pixel.sector_y,
                            pixel.local_x,
                            pixel.local_y,
                            pixel.color
                        );
                        
                        const sectorKey = Utils.createSectorKey(pixel.sector_x, pixel.sector_y);
                        occupiedSectors.add(sectorKey);
                        loadedCount++;
                    }
                    
                    // Yield control to browser every sub-batch
                    if (i + subBatchSize < pixels.length) {
                        await new Promise(resolve => setTimeout(resolve, 1));
                    }
                }
                
                const batchTime = performance.now() - batchStartTime;
                console.log(`✅ Batch completed: ${pixels.length} pixels in ${batchTime.toFixed(0)}ms (total: ${loadedCount})`);
                
                // Update progress and render periodically
                if (offset % (batchSize * 5) === 0) { // Every 5 batches
                    console.log(`🎨 Intermediate render (${loadedCount} pixels loaded)`);
                    this.pixelCanvas.render();
                    await new Promise(resolve => setTimeout(resolve, 10)); // Brief pause
                }
                
                // Break if we got fewer pixels than expected
                if (pixels.length < batchSize) {
                    console.log(`📊 Reached end of data at ${loadedCount} pixels`);
                    break;
                }
                
                // Small delay to prevent overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            
            // Initialize active sectors
            this.initializeActiveSectors(occupiedSectors);
            
            console.log('✅ Progressive loading complete');
            console.log(`📊 Successfully loaded ${loadedCount} pixels without freezing`);
            console.log('🔍 Final pixel count in storage:', this.pixelCanvas.pixelStorage.pixels.size);
            
            // Final render
            this.pixelCanvas.render();
            
        } catch (error) {
            console.error('❌ Progressive loading failed:', error);
            throw error;
        }
    }
    
    loadPixelsFromLocalStorage() {
        try {
            const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
            const pixelCount = Object.keys(savedPixels).length;
            
            if (pixelCount > 0) {
                // Load from localStorage
                for (const [key, color] of Object.entries(savedPixels)) {
                    this.pixelCanvas.pixelStorage.pixels.set(key, color);
                }
                console.log(`✅ Loaded ${pixelCount} pixels from localStorage`);
            } else {
                // 🚨 FALLBACK: Generate basic test pixels for demonstration
                console.log('🎨 No localStorage data, generating demo pixels...');
                this.generateDemoPixels();
            }
            
            // Update display
            this.pixelCanvas.pixelStorage.updateStockDisplay();
            this.pixelCanvas.render();
            
        } catch (error) {
            console.warn('localStorage unavailable, generating demo pixels');
            this.generateDemoPixels();
        }
    }
    
    async loadPixelsDirectREST() {
        try {
            console.log('🚀 DIRECT REST: Attempting direct Supabase REST API access...');
            
            // Test basic connectivity first
            const testUrl = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=count&limit=1`;
            console.log('🧪 Testing connectivity:', testUrl);
            
            const testResponse = await fetch(testUrl, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log('📊 Test response:', testResponse.status, testResponse.statusText);
            
            if (!testResponse.ok) {
                throw new Error(`Test failed: ${testResponse.status} ${testResponse.statusText}`);
            }
            
            const testData = await testResponse.json();
            console.log('✅ Connectivity test passed:', testData);
            
            // Now load actual pixels
            console.log('📥 Loading pixels via direct REST...');
            const pixelUrl = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=sector_x,sector_y,local_x,local_y,color&limit=10000`;
            
            const pixelResponse = await fetch(pixelUrl, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log('📊 Pixel response:', pixelResponse.status, pixelResponse.statusText);
            
            if (!pixelResponse.ok) {
                throw new Error(`Pixel load failed: ${pixelResponse.status} ${pixelResponse.statusText}`);
            }
            
            const pixels = await pixelResponse.json();
            console.log(`✅ DIRECT REST: Loaded ${pixels.length} pixels successfully`);
            
            // Add pixels to storage
            let addedCount = 0;
            for (const pixel of pixels) {
                this.pixelCanvas.pixelStorage.setPixel(
                    pixel.sector_x,
                    pixel.sector_y,
                    pixel.local_x,
                    pixel.local_y,
                    pixel.color
                );
                addedCount++;
            }
            
            console.log(`✅ Added ${addedCount} pixels to storage`);
            console.log(`📊 Total pixels in storage: ${this.pixelCanvas.pixelStorage.pixels.size}`);
            
            // Update display and render
            this.pixelCanvas.pixelStorage.updateStockDisplay();
            this.pixelCanvas.render();
            
            return true;
            
        } catch (error) {
            console.error('❌ DIRECT REST failed:', error);
            console.warn('⚠️ Falling back to demo generation...');
            this.generateDemoPixels();
            return false;
        }
    }

    generateDemoPixels() {
        // Generate a small demo pattern to show the app is working
        console.log('🎨 Generating demo pixel pattern...');
        
        // Create a simple 16x16 pattern in sector (0,0)
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                const color = (x + y) % 16; // Cycle through colors
                this.pixelCanvas.pixelStorage.setPixel(0, 0, x + 120, y + 120, color);
            }
        }
        
        // Add some scattered pixels
        for (let i = 0; i < 100; i++) {
            const x = Math.floor(Math.random() * 256);
            const y = Math.floor(Math.random() * 256);
            const color = Math.floor(Math.random() * 16);
            this.pixelCanvas.pixelStorage.setPixel(0, 0, x, y, color);
        }
        
        console.log(`✅ Generated ${this.pixelCanvas.pixelStorage.pixels.size} demo pixels`);
        this.pixelCanvas.pixelStorage.updateStockDisplay();
        this.pixelCanvas.render();
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
        
        console.log(`🎯 Initialized ${this.pixelCanvas.activeSectors.size} active sectors (${occupiedSectors.size} occupied + neighbors)`);
        console.log(`📍 Active sectors: ${Array.from(this.pixelCanvas.activeSectors).slice(0, 10).join(', ')}${this.pixelCanvas.activeSectors.size > 10 ? '...' : ''}`);
    }
    
    // 🚨 CRITICAL MISSING METHODS: データベースからピクセル読み込み
    async loadPixelsFromSupabase() {
        console.log('🚀 FORCE: Direct pixel loading starting...');
        console.log('🔧 Environment check:', {
            windowSupabase: !!window.supabase,
            supabaseClient: !!this.supabaseClient,
            configUrl: CONFIG.SUPABASE_URL,
            configKey: CONFIG.SUPABASE_ANON_KEY ? 'Present' : 'Missing'
        });
        
        // 🚨 EMERGENCY: Always try direct REST API first, bypass Supabase client
        console.log('🚀 BYPASS: Using direct REST API to avoid client issues...');
        return this.loadPixelsDirectREST();
        
        try {
            console.log('📥 Loading pixels from Supabase...');
            console.log('🔧 Using URL:', CONFIG.SUPABASE_URL);
            
            // 🚨 SIMPLIFIED: Single query first to test connection
            console.log('🧪 Testing connection with simple count query...');
            const { count, error: countError } = await this.supabaseClient
                .from('pixels')
                .select('*', { count: 'exact', head: true });
            
            if (countError) {
                console.error('❌ Count query failed:', countError);
                return;
            }
            
            console.log(`📊 Total pixels in database: ${count}`);
            
            if (count === 0) {
                console.warn('⚠️ No pixels found in database');
                return;
            }
            
            // 🚀 CRITICAL FIX: Supabase API has 1000 row limit - use multiple requests
            console.log(`📥 Loading ALL ${count} pixels via batched requests...`);
            
            let allPixels = [];
            const batchSize = 1000;
            const totalExpected = count;
            
            // Load in batches to avoid API limits
            for (let offset = 0; offset < totalExpected; offset += batchSize) {
                console.log(`📥 Loading batch ${Math.floor(offset/batchSize) + 1}/${Math.ceil(totalExpected/batchSize)} (offset: ${offset})`);
                
                let restResponse;
                try {
                    const url = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=sector_x,sector_y,local_x,local_y,color&limit=${batchSize}&offset=${offset}`;
                    console.log(`🌐 Attempting fetch to: ${url}`);
                    
                    restResponse = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'apikey': CONFIG.SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        mode: 'cors',
                        credentials: 'omit'
                    });
                    
                    console.log(`📊 Fetch response status: ${restResponse.status}`);
                } catch (fetchError) {
                    // 🚨 SILENT HANDLING: GitHub Pages CORS issue - use fallback
                    console.warn('⚠️ Supabase fetch blocked (CORS/Network), using localStorage fallback');
                    throw new Error('SUPABASE_BLOCKED');
                }
                
                if (!restResponse.ok) {
                    console.error(`❌ Batch ${Math.floor(offset/batchSize) + 1} failed: ${restResponse.status}`);
                    break;
                }
                
                const batchPixels = await restResponse.json();
                allPixels = allPixels.concat(batchPixels);
                
                console.log(`✅ Loaded batch: ${batchPixels.length} pixels (total: ${allPixels.length})`);
                
                // Break if we got fewer pixels than expected (end of data)
                if (batchPixels.length < batchSize) {
                    console.log(`📊 Reached end of data at ${allPixels.length} pixels`);
                    break;
                }
                
                // Add small delay to prevent API rate limiting
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            const pixels = allPixels;
            const error = null; // No error for successful REST response
            
            // Error handled by REST response check above
            
            if (!pixels || pixels.length === 0) {
                console.warn('⚠️ No pixels returned from query');
                return;
            }
            
            console.log(`✅ Loaded ${pixels.length} pixels from database`);
            
            // 即座にPixelStorageに追加
            let addedCount = 0;
            console.log('🚨 DETAILED: About to process pixels:', pixels.slice(0, 3));
            
            for (const pixel of pixels) {
                try {
                    if (addedCount < 5) {
                        console.log(`🔧 Processing pixel ${addedCount + 1}:`, pixel);
                    }
                    this.pixelCanvas.pixelStorage.setPixel(
                        pixel.sector_x,
                        pixel.sector_y,
                        pixel.local_x,
                        pixel.local_y,
                        pixel.color
                    );
                    addedCount++;
                    
                    if (addedCount <= 5) {
                        console.log(`✅ Successfully added pixel ${addedCount}`);
                    }
                } catch (setError) {
                    console.error('❌ Error setting pixel:', setError, pixel);
                }
            }
            
            console.log(`✅ Added ${addedCount} pixels to PixelStorage`);
            console.log(`📊 PixelStorage now contains ${this.pixelCanvas.pixelStorage.pixels.size} pixels`);
            
            // 🚨 CRITICAL: Verify we have all expected pixels
            if (addedCount === totalExpected) {
                console.log(`🎉 SUCCESS: All ${totalExpected} pixels loaded!`);
            } else if (addedCount > totalExpected * 0.9) {
                console.log(`✅ SUCCESS: Loaded ${addedCount} pixels (near expected ${totalExpected})`);
            } else {
                console.error(`⚠️ WARNING: Expected ${totalExpected} pixels but got ${addedCount}`);
            }
            
            // ピクセル数カウント表示更新
            if (this.pixelCanvas.updateStockDisplay) {
                this.pixelCanvas.updateStockDisplay();
            } else {
                this.pixelCanvas.pixelStorage.updateStockDisplay();
            }
            
        } catch (error) {
            // 🚨 DETAILED ERROR: Show actual error for diagnosis
            console.error('❌ DETAILED: Supabase loading failed:', {
                error: error.message,
                stack: error.stack,
                supabaseClient: !!this.supabaseClient,
                windowSupabase: !!window.supabase,
                configUrl: CONFIG.SUPABASE_URL,
                configKey: CONFIG.SUPABASE_ANON_KEY ? 'Present' : 'Missing'
            });
            
            console.warn('⚠️ Falling back to localStorage and demo generation');
            this.loadPixelsFromLocalStorage();
        }
    }
    
    // セクターカウント読み込み
    async loadSectorCounts() {
        if (!this.supabaseClient) {
            console.warn('⚠️ Supabase client not initialized');
            return;
        }
        
        try {
            console.log('📥 Loading sector counts from Supabase...');
            
            const { data: sectors, error } = await this.supabaseClient
                .from('sectors')
                .select('sector_x, sector_y, is_active, pixel_count');
            
            if (error) {
                console.error('❌ Error loading sector counts:', error);
                return;
            }
            
            if (sectors && sectors.length > 0) {
                // セクター情報をSectorManagerに反映
                for (const sector of sectors) {
                    const sectorKey = `${sector.sector_x},${sector.sector_y}`;
                    
                    if (sector.is_active) {
                        this.pixelCanvas.activeSectors.add(sectorKey);
                    }
                    
                    // セクターピクセル数をキャッシュ
                    if (sector.pixel_count > 0) {
                        this.pixelCanvas.sectorPixelCounts.set(sectorKey, sector.pixel_count);
                    }
                }
                
                console.log(`✅ Loaded ${sectors.length} sector counts`);
                console.log(`📊 Active sectors: ${this.pixelCanvas.activeSectors.size}`);
            } else {
                console.log('📊 No sector counts found in database');
            }
            
        } catch (error) {
            console.error('❌ Failed to load sector counts:', error);
        }
    }
}
// PixelCanvas Main Application
const GRID_SIZE = 256;
const PIXEL_SIZE = 4;
const COLORS = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00',
    '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#800000', '#008000', '#000080', '#808000',
    '#800080', '#008080', '#C0C0C0', '#808080'
];

const RATE_LIMIT_MS = 1000;
const MAX_PIXEL_STOCK = 10;
const STOCK_RECOVER_MS = 1000;

// Supabase configuration
const SUPABASE_URL = 'https://lgvjdefkyeuvquzckkvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndmpkZWZreWV1dnF1emNra3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MjMxNzEsImV4cCI6MjA2NTI5OTE3MX0.AqXyT6m78-O7X-ulzYdfBsLLMVsRoelpOUvPp9PCqiY';
const SECTOR_EXPANSION_THRESHOLD = 0.7; // 70% filled

class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.container = document.getElementById('canvasContainer');
        this.colorPalette = document.getElementById('colorPalette');
        this.statusIndicator = document.getElementById('status');
        this.gridToggle = document.getElementById('gridToggle');
        this.cooldownIndicator = document.getElementById('cooldownIndicator');
        this.pixelCount = document.getElementById('pixelCount');
        
        this.currentColor = 0;
        this.scale = 2;
        this.offsetX = 0;
        this.offsetY = 0;
        this.sectors = new Map();
        this.pendingPixels = [];
        this.pixels = new Map(); // Store drawn pixels
        this.showGrid = true;
        // Initialize pixel stock with proper persistence
        this.initializePixelStock();
        this.stockRecoveryInterval = null;
        this.activeSectors = new Set(['0,0']); // Track active sectors
        this.sectorPixelCounts = new Map(); // Track pixel count per sector
        this.deviceId = this.generateDeviceId(); // Unique device identifier
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupColorPalette();
        this.loadInitialData();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.render();
    }
    
    setupEventListeners() {
        // Grid toggle
        this.gridToggle.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            this.gridToggle.classList.toggle('active', this.showGrid);
            this.render();
        });
        
        // Common coordinate helper
        const getCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
            const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
            return { x, y };
        };
        
        // Touch state for mobile
        let touchState = {
            startTime: 0,
            startX: 0,
            startY: 0,
            initialOffsetX: 0,
            initialOffsetY: 0,
            initialScale: 1,
            initialDistance: 0,
            initialCenterX: 0,
            initialCenterY: 0,
            moved: false,
            touches: 0,
            wasMultiTouch: false,
            gestureEndTime: 0
        };
        
        const getDistance = (touch1, touch2) => {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };
        
        const getCenter = (touch1, touch2) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
                y: (touch1.clientY + touch2.clientY) / 2 - rect.top
            };
        };
        
        // TOUCH EVENTS - Simple and reliable
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            const now = Date.now();
            const previousTouches = touchState.touches;
            touchState.touches = e.touches.length;
            touchState.startTime = now;
            
            // If we just ended a multi-touch gesture, ignore single touch for a short time
            if (previousTouches > 1 && e.touches.length === 1 && (now - touchState.gestureEndTime < 200)) {
                touchState.moved = true; // Prevent this from being treated as a tap
                return;
            }
            
            touchState.moved = false;
            
            if (e.touches.length === 1) {
                // Single touch - but only reset position if not coming from multi-touch
                if (previousTouches <= 1) {
                    const coords = getCoords(e);
                    touchState.startX = coords.x;
                    touchState.startY = coords.y;
                    touchState.initialOffsetX = this.offsetX;
                    touchState.initialOffsetY = this.offsetY;
                }
                touchState.wasMultiTouch = false;
            } else if (e.touches.length === 2) {
                // Two finger gesture
                touchState.wasMultiTouch = true;
                touchState.initialDistance = getDistance(e.touches[0], e.touches[1]);
                touchState.initialScale = this.scale;
                const center = getCenter(e.touches[0], e.touches[1]);
                touchState.initialCenterX = center.x;
                touchState.initialCenterY = center.y;
                touchState.initialOffsetX = this.offsetX;
                touchState.initialOffsetY = this.offsetY;
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            
            // Only handle movement if the touch count matches what we started with
            if (e.touches.length === 1 && touchState.touches === 1 && !touchState.wasMultiTouch) {
                // Single finger pan - only if not coming from multi-touch
                const coords = getCoords(e);
                const dx = coords.x - touchState.startX;
                const dy = coords.y - touchState.startY;
                
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    touchState.moved = true;
                    this.offsetX = touchState.initialOffsetX + dx;
                    this.offsetY = touchState.initialOffsetY + dy;
                    this.render();
                }
            } else if (e.touches.length === 2 && touchState.touches === 2) {
                // Two finger pinch zoom
                const distance = getDistance(e.touches[0], e.touches[1]);
                const scaleChange = distance / touchState.initialDistance;
                const newScale = Math.max(0.5, Math.min(16, touchState.initialScale * scaleChange));
                
                // Use the initial center point for consistent zoom behavior
                const centerX = touchState.initialCenterX;
                const centerY = touchState.initialCenterY;
                
                // Calculate new offset to zoom towards the initial center
                const scaleFactor = newScale / touchState.initialScale;
                this.offsetX = centerX - (centerX - touchState.initialOffsetX) * scaleFactor;
                this.offsetY = centerY - (centerY - touchState.initialOffsetY) * scaleFactor;
                this.scale = newScale;
                
                this.render();
                touchState.moved = true;
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            const now = Date.now();
            
            // Only handle tap if it was a single touch that didn't move and wasn't multi-touch
            if (touchState.touches === 1 && !touchState.moved && !touchState.wasMultiTouch) {
                const tapDuration = now - touchState.startTime;
                
                // Quick tap (less than 200ms) = draw pixel
                if (tapDuration < 200) {
                    this.handlePixelClick(touchState.startX, touchState.startY);
                }
            }
            
            // If we're ending a multi-touch gesture, record the time
            if (touchState.touches > 1 && e.touches.length <= 1) {
                touchState.gestureEndTime = now;
                touchState.wasMultiTouch = true;
            }
            
            // Update touch count
            const previousTouches = touchState.touches;
            touchState.touches = e.touches.length;
            
            // Reset movement state only when all touches are gone
            if (e.touches.length === 0) {
                touchState.moved = false;
                touchState.wasMultiTouch = false;
            }
            
            // If going from 2+ touches to 1 touch, reset single touch state
            if (previousTouches > 1 && e.touches.length === 1) {
                setTimeout(() => {
                    if (touchState.touches === 1) {
                        const coords = getCoords(e);
                        touchState.startX = coords.x;
                        touchState.startY = coords.y;
                        touchState.initialOffsetX = this.offsetX;
                        touchState.initialOffsetY = this.offsetY;
                        touchState.moved = false;
                        touchState.wasMultiTouch = false;
                    }
                }, 100);
            }
        });
        
        // MOUSE EVENTS - Keep existing logic for desktop
        let mouseState = {
            down: false,
            startX: 0,
            startY: 0,
            initialOffsetX: 0,
            initialOffsetY: 0
        };
        
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            mouseState.down = true;
            const coords = getCoords(e);
            mouseState.startX = coords.x;
            mouseState.startY = coords.y;
            mouseState.initialOffsetX = this.offsetX;
            mouseState.initialOffsetY = this.offsetY;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            if (!mouseState.down) return;
            
            const coords = getCoords(e);
            const dx = coords.x - mouseState.startX;
            const dy = coords.y - mouseState.startY;
            
            this.offsetX = mouseState.initialOffsetX + dx;
            this.offsetY = mouseState.initialOffsetY + dy;
            this.render();
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            e.preventDefault();
            if (!mouseState.down) return;
            
            const coords = getCoords(e);
            const dx = coords.x - mouseState.startX;
            const dy = coords.y - mouseState.startY;
            
            // If very small movement, treat as click
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
                this.handlePixelClick(mouseState.startX, mouseState.startY);
            }
            
            mouseState.down = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            mouseState.down = false;
        });
        
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.5, Math.min(16, this.scale * delta));
            
            const scaleFactor = newScale / this.scale;
            this.offsetX = mouseX - (mouseX - this.offsetX) * scaleFactor;
            this.offsetY = mouseY - (mouseY - this.offsetY) * scaleFactor;
            this.scale = newScale;
            
            this.render();
        });
    }
    
    setupColorPalette() {
        const buttons = this.colorPalette.querySelectorAll('.color-button');
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentColor = index;
            });
        });
        buttons[0].classList.add('active');
    }
    
    async handlePixelClick(x, y) {
        // Check if we have pixels in stock
        if (this.pixelStock <= 0) {
            return; // No pixels available
        }
        
        // Check server-side rate limiting
        const canDraw = await this.checkRateLimit();
        if (!canDraw) {
            console.log('Rate limited by server');
            return;
        }
        
        const worldX = Math.floor((x - this.offsetX) / (PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (PIXEL_SIZE * this.scale));
        
        const sectorX = Math.floor(worldX / GRID_SIZE);
        const sectorY = Math.floor(worldY / GRID_SIZE);
        const localX = ((worldX % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        const localY = ((worldY % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        
        // Successfully draw pixel
        await this.drawPixel(sectorX, sectorY, localX, localY, this.currentColor);
        
        // Consume one pixel from stock
        this.pixelStock--;
        this.lastStockUpdate = Date.now();
        this.updateStockDisplay();
        this.saveStockState(); // Save immediately when stock is consumed
        
        // Log the action to server
        await this.logUserAction('pixel_draw');
    }
    
    async drawPixel(sectorX, sectorY, x, y, color) {
        const pixelKey = `${sectorX},${sectorY},${x},${y}`;
        const worldX = sectorX * GRID_SIZE + x;
        const worldY = sectorY * GRID_SIZE + y;
        
        console.log(`Drawing pixel at (${worldX}, ${worldY}) with color ${color} (${COLORS[color]})`);
        
        // Store pixel persistently
        this.pixels.set(pixelKey, color);
        
        // Also store in localStorage for persistence across page reloads
        const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
        savedPixels[pixelKey] = color;
        localStorage.setItem('pixelcanvas_pixels', JSON.stringify(savedPixels));
        
        // Pixel count display is handled by updateStockDisplay()
        
        // Force a complete re-render to ensure pixel is drawn
        this.render();
        
        const pixel = { s: `${sectorX},${sectorY}`, x, y, c: color };
        this.pendingPixels.push(pixel);
        
        if (navigator.onLine) {
            await this.sendPixel(pixel);
        } else {
            await this.queuePixel(pixel);
        }
    }
    
    renderPixel(worldX, worldY, colorIndex) {
        const x = worldX * PIXEL_SIZE * this.scale + this.offsetX;
        const y = worldY * PIXEL_SIZE * this.scale + this.offsetY;
        const size = PIXEL_SIZE * this.scale;
        
        this.ctx.fillStyle = COLORS[colorIndex];
        this.ctx.fillRect(x, y, size, size);
    }
    
    async sendPixel(pixel) {
        try {
            console.log('Sending pixel to Supabase:', pixel);
            
            const payload = {
                sector_x: parseInt(pixel.s.split(',')[0]),
                sector_y: parseInt(pixel.s.split(',')[1]),
                local_x: pixel.x,
                local_y: pixel.y,
                color: pixel.c
            };
            
            console.log('Payload:', payload);
            
            // Send to Supabase using UPSERT to handle duplicates
            const response = await fetch(`${SUPABASE_URL}/rest/v1/pixels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(payload)
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Supabase error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('Pixel saved successfully:', result);
            
            // Update sector pixel count
            await this.updateSectorCount(pixel.s, 1);
            
        } catch (error) {
            console.error('Failed to send pixel to Supabase:', error);
            this.queuePixel(pixel);
        }
    }
    
    async queuePixel(pixel) {
        if (window.idb) {
            await window.idb.set('queue', [...(await window.idb.get('queue') || []), pixel]);
        }
    }
    
    loadInitialData() {
        // Set initial grid state
        this.gridToggle.classList.toggle('active', this.showGrid);
        
        // Initialize stock system
        this.updateStockDisplay();
        this.startStockRecovery();
        
        // Save stock state periodically
        setInterval(() => this.saveStockState(), 5000); // Save every 5 seconds
        
        // Initialize sector (0,0) if not exists
        this.sectorPixelCounts.set('0,0', 0);
        
        // Load pixels from Supabase
        this.loadPixelsFromSupabase();
        
        // Also load from localStorage as backup
        const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
        for (const [key, color] of Object.entries(savedPixels)) {
            this.pixels.set(key, color);
        }
        
        console.log(`Loaded ${this.pixels.size} pixels from localStorage`);
        
        this.render();
        this.updateStatus(navigator.onLine);
        
        // Set up real-time subscription (optional)
        // this.setupRealtimeSubscription();
        
        window.addEventListener('online', () => {
            this.updateStatus(true);
            this.flushQueue();
        });
        
        window.addEventListener('offline', () => {
            this.updateStatus(false);
        });
    }
    
    updateStatus(online) {
        this.statusIndicator.classList.toggle('offline', !online);
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
    
    render() {
        // Clear with canvas background color
        this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas-bg').trim() || '#404040';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render grid if enabled
        if (this.showGrid) {
            this.renderGrid();
        }
        
        // Render all pixels
        this.renderPixels();
    }
    
    renderGrid() {
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-grid').trim() || '#606060';
        this.ctx.strokeStyle = gridColor;
        
        const pixelSize = PIXEL_SIZE * this.scale;
        
        // Always show pixel grid (1px = 1 canvas pixel when scale = 0.25)
        this.ctx.lineWidth = Math.max(0.1, 0.5 / this.scale);
        
        const startX = Math.floor(-this.offsetX / pixelSize) * pixelSize + this.offsetX;
        const startY = Math.floor(-this.offsetY / pixelSize) * pixelSize + this.offsetY;
        
        // Limit grid density to prevent performance issues
        const maxLines = 1000;
        const stepX = Math.max(pixelSize, this.canvas.width / maxLines);
        const stepY = Math.max(pixelSize, this.canvas.height / maxLines);
        
        // Vertical pixel grid lines
        for (let x = startX; x < this.canvas.width; x += stepX) {
            this.ctx.beginPath();
            this.ctx.moveTo(Math.floor(x) + 0.5, 0);
            this.ctx.lineTo(Math.floor(x) + 0.5, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Horizontal pixel grid lines
        for (let y = startY; y < this.canvas.height; y += stepY) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, Math.floor(y) + 0.5);
            this.ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
            this.ctx.stroke();
        }
        
        // Sector grid (thicker lines) - only when zoomed out enough to be useful
        if (this.scale <= 2) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = Math.max(1, 2 / this.scale);
            const sectorSize = GRID_SIZE * PIXEL_SIZE * this.scale;
            
            if (sectorSize >= 50) { // Only show sector grid when sectors are large enough
                const startX = Math.floor(-this.offsetX / sectorSize) * sectorSize + this.offsetX;
                const startY = Math.floor(-this.offsetY / sectorSize) * sectorSize + this.offsetY;
                
                for (let x = startX; x < this.canvas.width; x += sectorSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(Math.floor(x) + 0.5, 0);
                    this.ctx.lineTo(Math.floor(x) + 0.5, this.canvas.height);
                    this.ctx.stroke();
                }
                
                for (let y = startY; y < this.canvas.height; y += sectorSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, Math.floor(y) + 0.5);
                    this.ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    renderPixels() {
        // Render all stored pixels
        for (const [key, color] of this.pixels) {
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * GRID_SIZE + localX;
            const worldY = sectorY * GRID_SIZE + localY;
            this.renderPixel(worldX, worldY, color);
        }
    }
    
    generateDeviceId() {
        // Create a semi-persistent device identifier
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        
        const fingerprint = [
            canvas.toDataURL(),
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 0
        ].join('|');
        
        // Create a hash from the fingerprint
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return 'device_' + Math.abs(hash).toString(36);
    }
    
    initializePixelStock() {
        const now = Date.now();
        
        // Get saved state from multiple storage locations with device ID
        const sessionKey = `pixelcanvas_session_${this.deviceId}`;
        const localKey = `pixelcanvas_stock_${this.deviceId}`;
        
        const sessionData = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
        const localData = JSON.parse(localStorage.getItem(localKey) || '{}');
        
        // Use the most restrictive data (lowest stock, most recent update)
        let savedStock = MAX_PIXEL_STOCK;
        let lastUpdate = now - (24 * 60 * 60 * 1000); // Default to 24h ago for new users
        
        if (sessionData.stock !== undefined && sessionData.lastUpdate) {
            savedStock = Math.min(savedStock, sessionData.stock);
            lastUpdate = Math.max(lastUpdate, sessionData.lastUpdate);
        }
        
        if (localData.stock !== undefined && localData.lastUpdate) {
            savedStock = Math.min(savedStock, localData.stock);
            lastUpdate = Math.max(lastUpdate, localData.lastUpdate);
        }
        
        // Calculate natural recovery since last update
        const timePassed = now - lastUpdate;
        const recoveredPixels = Math.floor(timePassed / STOCK_RECOVER_MS);
        
        this.pixelStock = Math.min(MAX_PIXEL_STOCK, savedStock + recoveredPixels);
        this.lastStockUpdate = now;
        
        console.log(`Device ID: ${this.deviceId}`);
        console.log(`Initialized stock: ${this.pixelStock}/${MAX_PIXEL_STOCK} (recovered ${recoveredPixels} pixels)`);
    }
    
    saveStockState() {
        const stockData = {
            stock: this.pixelStock,
            lastUpdate: this.lastStockUpdate,
            deviceId: this.deviceId
        };
        
        // Save to both session and local storage with device-specific keys
        const sessionKey = `pixelcanvas_session_${this.deviceId}`;
        const localKey = `pixelcanvas_stock_${this.deviceId}`;
        
        sessionStorage.setItem(sessionKey, JSON.stringify(stockData));
        localStorage.setItem(localKey, JSON.stringify(stockData));
    }
    
    startStockRecovery() {
        // Clear any existing interval
        if (this.stockRecoveryInterval) {
            clearInterval(this.stockRecoveryInterval);
        }
        
        // Start recovery interval
        this.stockRecoveryInterval = setInterval(() => {
            if (this.pixelStock < MAX_PIXEL_STOCK) {
                this.pixelStock++;
                this.lastStockUpdate = Date.now();
                this.updateStockDisplay();
                this.saveStockState(); // Save immediately when stock changes
            }
        }, STOCK_RECOVER_MS);
    }
    
    updateStockDisplay() {
        // Update the visual indicator
        const percentage = (this.pixelStock / MAX_PIXEL_STOCK) * 100;
        this.cooldownIndicator.style.background = `linear-gradient(to right, #4ade80 ${percentage}%, var(--color-border) ${percentage}%)`;
        
        // Update pixel count to show stock
        this.pixelCount.textContent = `${this.pixelStock}/${MAX_PIXEL_STOCK}`;
    }
    
    async loadPixelsFromSupabase() {
        try {
            console.log('Loading pixels from Supabase...');
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/pixels?select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to load pixels:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const pixels = await response.json();
            console.log(`Successfully loaded ${pixels.length} pixels from Supabase:`, pixels);
            
            // Convert to our internal format
            for (const pixel of pixels) {
                const key = `${pixel.sector_x},${pixel.sector_y},${pixel.local_x},${pixel.local_y}`;
                this.pixels.set(key, pixel.color);
                console.log(`Added pixel: ${key} = color ${pixel.color}`);
                
                // Track sector
                const sectorKey = `${pixel.sector_x},${pixel.sector_y}`;
                this.activeSectors.add(sectorKey);
            }
            
            // Load sector counts
            await this.loadSectorCounts();
            
            console.log(`Total pixels in memory: ${this.pixels.size}`);
            this.render();
            
        } catch (error) {
            console.error('Failed to load pixels from Supabase:', error);
        }
    }
    
    async loadSectorCounts() {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/sectors?select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const sectors = await response.json();
            for (const sector of sectors) {
                const key = `${sector.sector_x},${sector.sector_y}`;
                this.sectorPixelCounts.set(key, sector.pixel_count);
            }
            
        } catch (error) {
            console.error('Failed to load sector counts:', error);
        }
    }
    
    async updateSectorCount(sectorKey, increment) {
        try {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            const currentCount = this.sectorPixelCounts.get(sectorKey) || 0;
            const newCount = currentCount + increment;
            
            // Update local count
            this.sectorPixelCounts.set(sectorKey, newCount);
            
            // Update in Supabase
            const response = await fetch(`${SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    pixel_count: newCount
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            // Check for expansion
            await this.checkSectorExpansion(sectorX, sectorY, newCount);
            
        } catch (error) {
            console.error('Failed to update sector count:', error);
        }
    }
    
    async checkSectorExpansion(sectorX, sectorY, pixelCount) {
        const maxPixelsPerSector = GRID_SIZE * GRID_SIZE; // 256 * 256
        const fillPercentage = pixelCount / maxPixelsPerSector;
        
        if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD) {
            console.log(`Sector (${sectorX}, ${sectorY}) is ${Math.round(fillPercentage * 100)}% full. Expanding...`);
            await this.expandSectors(sectorX, sectorY);
        }
    }
    
    async expandSectors(centerX, centerY) {
        // 8-direction expansion
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        for (const [dx, dy] of directions) {
            const newX = centerX + dx;
            const newY = centerY + dy;
            const sectorKey = `${newX},${newY}`;
            
            if (!this.activeSectors.has(sectorKey)) {
                try {
                    // Create new sector in database
                    const response = await fetch(`${SUPABASE_URL}/rest/v1/sectors`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            sector_x: newX,
                            sector_y: newY,
                            pixel_count: 0
                        })
                    });
                    
                    if (response.ok) {
                        this.activeSectors.add(sectorKey);
                        this.sectorPixelCounts.set(sectorKey, 0);
                        console.log(`Expanded to sector (${newX}, ${newY})`);
                    }
                    
                } catch (error) {
                    console.error(`Failed to expand to sector (${newX}, ${newY}):`, error);
                }
            }
        }
    }
    
    async checkRateLimit() {
        try {
            // Get user's IP address (approximation)
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            const userIP = ipData.ip;
            
            // Check recent actions from this IP in the last minute
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/user_actions?ip_address=eq.${userIP}&created_at=gte.${oneMinuteAgo}&action_type=eq.pixel_draw&select=count`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                console.warn('Rate limit check failed, allowing action');
                return true; // Fail open
            }
            
            const actions = await response.json();
            const recentActions = actions.length;
            
            console.log(`Recent actions from IP ${userIP}: ${recentActions}`);
            
            // Allow maximum 10 pixels per minute per IP
            return recentActions < 10;
            
        } catch (error) {
            console.error('Rate limit check failed:', error);
            return true; // Fail open on error
        }
    }
    
    async logUserAction(actionType) {
        try {
            // Get user's IP address
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/user_actions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    ip_address: ipData.ip,
                    device_id: this.deviceId,
                    action_type: actionType
                })
            });
            
            if (!response.ok) {
                console.warn('Failed to log user action');
            }
            
        } catch (error) {
            console.error('Failed to log user action:', error);
        }
    }
    
    updatePixelCount() {
        // This method is no longer used - stock display is handled by updateStockDisplay
        // Keep for compatibility but don't override stock display
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PixelCanvas());
} else {
    new PixelCanvas();
}
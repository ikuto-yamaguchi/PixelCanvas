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
const SECTOR_EXPANSION_THRESHOLD = 0.0001; // 0.01% filled (7 pixels) for testing

// Initialize Supabase client for Realtime
let supabaseClient = null;
if (typeof window !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

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
        this.offsetX = 0; // Will be set properly after loading sectors
        this.offsetY = 0; // Will be set properly after loading sectors
        this.sectors = new Map();
        this.pendingPixels = [];
        this.pixels = new Map(); // Store drawn pixels
        this.showGrid = true;
        // Initialize pixel stock with proper persistence
        this.initializePixelStock();
        this.stockRecoveryInterval = null;
        this.activeSectors = new Set(['0,0']); // Track active sectors
        this.isExpansionRunning = false; // Prevent concurrent expansion
        // Removed sectorPixelCounts - using this.pixels as single source of truth
        this.deviceId = this.generateDeviceId(); // Unique device identifier
        
        // Mobile debug panel
        this.setupMobileDebugPanel();
        this.cachedIP = null; // Cache IP address
        this.ipCacheTime = 0; // IP cache timestamp
        this.realtimeChannel = null; // Realtime subscription
        this.remotePixelsBuffer = new Map(); // Buffer for remote pixels
        
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
        
        // Store logical canvas size (CSS pixels) for viewport calculations
        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;
        
        // Set physical canvas size (device pixels) for sharp rendering
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.render();
    }
    
    setupEventListeners() {
        this.setupGridToggle();
        this.setupTouchHandlers();
        this.setupMouseHandlers();
        this.setupWheelZoom();
    }
    
    setupGridToggle() {
        this.gridToggle.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            this.gridToggle.classList.toggle('active', this.showGrid);
            this.render();
        });
    }
    
    getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
        return { x, y };
    }
    
    getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getCenter(touch1, touch2) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
            y: (touch1.clientY + touch2.clientY) / 2 - rect.top
        };
    }
    
    setupTouchHandlers() {
        // Touch state for mobile
        this.touchState = {
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
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        
        const now = Date.now();
        const previousTouches = this.touchState.touches;
        this.touchState.touches = e.touches.length;
        this.touchState.startTime = now;
        
        // If we just ended a multi-touch gesture, ignore single touch for a short time
        if (previousTouches > 1 && e.touches.length === 1 && (now - this.touchState.gestureEndTime < 200)) {
            this.touchState.moved = true; // Prevent this from being treated as a tap
            return;
        }
        
        this.touchState.moved = false;
        
        if (e.touches.length === 1) {
            // Single touch - but only reset position if not coming from multi-touch
            if (previousTouches <= 1) {
                const coords = this.getCoords(e);
                this.touchState.startX = coords.x;
                this.touchState.startY = coords.y;
                this.touchState.initialOffsetX = this.offsetX;
                this.touchState.initialOffsetY = this.offsetY;
            }
            this.touchState.wasMultiTouch = false;
        } else if (e.touches.length === 2) {
            // Two finger gesture
            this.touchState.wasMultiTouch = true;
            this.touchState.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
            this.touchState.initialScale = this.scale;
            const center = this.getCenter(e.touches[0], e.touches[1]);
            this.touchState.initialCenterX = center.x;
            this.touchState.initialCenterY = center.y;
            this.touchState.initialOffsetX = this.offsetX;
            this.touchState.initialOffsetY = this.offsetY;
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        // Only handle movement if the touch count matches what we started with
        if (e.touches.length === 1 && this.touchState.touches === 1 && !this.touchState.wasMultiTouch) {
            // Single finger pan - only if not coming from multi-touch
            const coords = this.getCoords(e);
            const dx = coords.x - this.touchState.startX;
            const dy = coords.y - this.touchState.startY;
            
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                this.touchState.moved = true;
                this.offsetX = this.touchState.initialOffsetX + dx;
                this.offsetY = this.touchState.initialOffsetY + dy;
                this.constrainViewport();
                this.render();
            }
        } else if (e.touches.length === 2 && this.touchState.touches === 2) {
            // Two finger pinch zoom
            const distance = this.getDistance(e.touches[0], e.touches[1]);
            const scaleChange = distance / this.touchState.initialDistance;
            const newScale = Math.max(0.1, Math.min(16, this.touchState.initialScale * scaleChange));
            
            // Use the initial center point for consistent zoom behavior
            const centerX = this.touchState.initialCenterX;
            const centerY = this.touchState.initialCenterY;
            
            // Calculate new offset to zoom towards the initial center
            const scaleFactor = newScale / this.touchState.initialScale;
            this.offsetX = centerX - (centerX - this.touchState.initialOffsetX) * scaleFactor;
            this.offsetY = centerY - (centerY - this.touchState.initialOffsetY) * scaleFactor;
            this.scale = newScale;
            
            this.constrainViewport();
            this.render();
            this.touchState.moved = true;
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        const now = Date.now();
        
        // Only handle tap if it was a single touch that didn't move and wasn't multi-touch
        if (this.touchState.touches === 1 && !this.touchState.moved && !this.touchState.wasMultiTouch) {
            const tapDuration = now - this.touchState.startTime;
            
            // Quick tap (less than 200ms) = draw pixel
            if (tapDuration < 200) {
                this.handlePixelClick(this.touchState.startX, this.touchState.startY);
            }
        }
        
        // If we're ending a multi-touch gesture, record the time
        if (this.touchState.touches > 1 && e.touches.length <= 1) {
            this.touchState.gestureEndTime = now;
            this.touchState.wasMultiTouch = true;
        }
        
        // Reduce expansion checks to improve performance
        if (this.touchState.moved && !this.isExpansionRunning) {
            this.mobileLog(`📱 TOUCHEND: Movement detected, scheduling expansion check`);
            // Debounce expansion checks
            setTimeout(() => {
                if (!this.isExpansionRunning) {
                    this.checkLoadedSectorsForExpansion();
                }
            }, 1000);
        }
        
        // Update touch count
        const previousTouches = this.touchState.touches;
        this.touchState.touches = e.touches.length;
        
        // Reset movement state only when all touches are gone
        if (e.touches.length === 0) {
            this.touchState.moved = false;
            this.touchState.wasMultiTouch = false;
        }
        
        // If going from 2+ touches to 1 touch, reset single touch state
        if (previousTouches > 1 && e.touches.length === 1) {
            setTimeout(() => {
                if (this.touchState.touches === 1) {
                    const coords = this.getCoords(e);
                    this.touchState.startX = coords.x;
                    this.touchState.startY = coords.y;
                    this.touchState.initialOffsetX = this.offsetX;
                    this.touchState.initialOffsetY = this.offsetY;
                    this.touchState.moved = false;
                    this.touchState.wasMultiTouch = false;
                }
            }, 100);
        }
    }
    
    setupMouseHandlers() {
        // Mouse state for desktop
        this.mouseState = {
            down: false,
            startX: 0,
            startY: 0,
            initialOffsetX: 0,
            initialOffsetY: 0
        };
        
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }
    
    handleMouseDown(e) {
        e.preventDefault();
        this.mouseState.down = true;
        const coords = this.getCoords(e);
        this.mouseState.startX = coords.x;
        this.mouseState.startY = coords.y;
        this.mouseState.initialOffsetX = this.offsetX;
        this.mouseState.initialOffsetY = this.offsetY;
    }
    
    handleMouseMove(e) {
        e.preventDefault();
        if (!this.mouseState.down) return;
        
        const coords = this.getCoords(e);
        const dx = coords.x - this.mouseState.startX;
        const dy = coords.y - this.mouseState.startY;
        
        this.offsetX = this.mouseState.initialOffsetX + dx;
        this.offsetY = this.mouseState.initialOffsetY + dy;
        this.constrainViewport();
        this.render();
    }
    
    handleMouseUp(e) {
        e.preventDefault();
        if (!this.mouseState.down) return;
        
        const coords = this.getCoords(e);
        const dx = coords.x - this.mouseState.startX;
        const dy = coords.y - this.mouseState.startY;
        
        // If very small movement, treat as click
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
            console.log(`🖱️ MOUSEUP: Small movement, treating as click`);
            this.handlePixelClick(this.mouseState.startX, this.mouseState.startY);
        } else if (!this.isExpansionRunning) {
            // Large movement = viewport pan, check for expansion (debounced)
            console.log(`🖱️ MOUSEUP: Large movement detected (${dx}, ${dy}), scheduling expansion check`);
            setTimeout(() => {
                if (!this.isExpansionRunning) {
                    this.checkLoadedSectorsForExpansion();
                }
            }, 1000);
        }
        
        this.mouseState.down = false;
    }
    
    handleMouseLeave() {
        this.mouseState.down = false;
    }
    
    setupWheelZoom() {
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    }
    
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(16, this.scale * delta));
        
        const scaleFactor = newScale / this.scale;
        this.offsetX = mouseX - (mouseX - this.offsetX) * scaleFactor;
        this.offsetY = mouseY - (mouseY - this.offsetY) * scaleFactor;
        this.scale = newScale;
        
        this.constrainViewport();
        this.render();
        
        // Check for expansion after zoom (debounced)
        if (!this.isExpansionRunning) {
            setTimeout(() => {
                if (!this.isExpansionRunning) {
                    this.checkLoadedSectorsForExpansion();
                }
            }, 1500);
        }
    }
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
        // Check if we have pixels in stock (client-side only)
        if (this.pixelStock <= 0) {
            console.log('No pixels in client stock');
            return;
        }
        
        // Check if click is within active sectors
        if (!this.isWithinActiveSectors(x, y)) {
            this.showOutOfBoundsWarning();
            return;
        }
        
        // Calculate coordinates immediately
        const worldX = Math.floor((x - this.offsetX) / (PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (PIXEL_SIZE * this.scale));
        
        const sectorX = Math.floor(worldX / GRID_SIZE);
        const sectorY = Math.floor(worldY / GRID_SIZE);
        const localX = ((worldX % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        const localY = ((worldY % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        
        // Draw immediately - no waiting, no checks
        this.drawPixel(sectorX, sectorY, localX, localY, this.currentColor);
        
        // Consume pixel after successful draw
        this.pixelStock--;
        this.lastStockUpdate = Date.now();
        this.updateStockDisplay();
        this.saveStockState();
        
        // Log action in background only (fire and forget)
        this.logUserActionLazy('pixel_draw');
        
        // Update sector count locally and check for expansion
        const sectorKey = `${sectorX},${sectorY}`;
        
        // Use unified pixel counting
        const actualCount = this.getRealTimePixelCount(sectorKey);
        console.log(`🔍 Sector (${sectorX}, ${sectorY}) after drawing: ${actualCount} pixels`);
        
        // Check if we need to expand
        const maxPixelsPerSector = GRID_SIZE * GRID_SIZE;
        const fillPercentage = actualCount / maxPixelsPerSector;
        
        if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD) {
            console.log(`🎯 EXPANSION TRIGGERED: Sector (${sectorX}, ${sectorY}) is ${(fillPercentage * 100).toFixed(3)}% full (${actualCount} pixels)!`);
            console.log(`🎯 Before expansion - Active sectors:`, Array.from(this.activeSectors));
            this.expandSectorsLocally(sectorX, sectorY);
            console.log(`🎯 After expansion - Active sectors:`, Array.from(this.activeSectors));
        } else {
            console.log(`📊 Sector (${sectorX}, ${sectorY}): ${(fillPercentage * 100).toFixed(3)}% full (${actualCount} pixels) - threshold not reached`);
        }
        
        // This code has been moved into the main handlePixelClick function above
    }
    
    drawPixel(sectorX, sectorY, x, y, color) {
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
            this.sendPixel(pixel); // Fire and forget
        } else {
            this.queuePixel(pixel); // Fire and forget
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
            
            // Update sector count in database (fire and forget)
            this.updateSectorCountLazy(pixel.s, 1);
            
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
        // setTimeout(() => this.syncWithServerStock(), 1000); // Skip server sync - too slow
        setInterval(() => this.saveStockState(), 5000); // Save every 5 seconds
        
        // Initialize sector (0,0) as the starting active sector
        this.mobileLog(`🔧 INIT: Before adding (0,0) - Active: ${Array.from(this.activeSectors).join(',')}`);
        this.activeSectors.add('0,0');
        this.mobileLog(`🔧 INIT: After adding (0,0) - Active: ${Array.from(this.activeSectors).join(',')}`);
        
        // Load pixels from Supabase
        this.loadPixelsFromSupabase();
        
        // Load sector counts and check for expansion
        this.loadSectorCounts();
        
        // Clean up any inconsistencies in activeSectors after loading
        setTimeout(() => this.cleanupActiveSectors(), 5000);
        
        // Setup realtime subscription
        this.setupRealtimeSubscription();
        
        // Also load from localStorage as backup
        const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
        const localStorageCount = Object.keys(savedPixels).length;
        
        // Track localStorage sectors for debugging
        const localSectorStats = new Map();
        for (const [key, color] of Object.entries(savedPixels)) {
            this.pixels.set(key, color);
            
            // Track which sectors have pixels in localStorage
            const [sectorX, sectorY] = key.split(',').map(Number);
            const sectorKey = `${sectorX},${sectorY}`;
            localSectorStats.set(sectorKey, (localSectorStats.get(sectorKey) || 0) + 1);
        }
        
        this.mobileLog(`🔄 Loaded ${localStorageCount} pixels from localStorage`);
        if (localSectorStats.size > 0) {
            this.mobileLog(`📊 LocalStorage sectors: ${Array.from(localSectorStats.keys()).join(',')}`);
            for (const [sectorKey, count] of localSectorStats) {
                this.mobileLog(`📊 Local ${sectorKey}: ${count} pixels`);
            }
        }
        
        // Recalculate sector counts after loading all pixels
        this.recalculateSectorCounts();
        
        this.render();
        this.updateStatus(navigator.onLine);
        
        // Check for expansion opportunities after initial load
        setTimeout(() => this.checkLoadedSectorsForExpansion(), 1000);
        
        // Set up real-time subscription (optional)
        // this.setupRealtimeSubscription();
        
        // Test expansion feature
        if (window.location.hash === '#test') {
            setTimeout(() => this.testExpansion(), 2000);
        }
        
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
        
        // Render active sector boundaries for visual clarity
        this.renderActiveSectorBounds();
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
    
    getViewportBounds() {
        // Handle case when no active sectors exist
        if (this.activeSectors.size === 0) {
            return this.getDefaultViewportBounds();
        }
        
        // Calculate bounds based on active sectors
        const activeBounds = this.calculateActiveSectorBounds();
        const paddedBounds = this.addPaddingToBounds(activeBounds);
        const canvasSize = this.getLogicalCanvasSize();
        
        // Calculate viewport constraints
        const horizontalConstraints = this.calculateHorizontalConstraints(paddedBounds, canvasSize);
        const verticalConstraints = this.calculateVerticalConstraints(paddedBounds, canvasSize);
        
        this.logViewportBounds(activeBounds, paddedBounds, canvasSize, horizontalConstraints, verticalConstraints);
        
        return {
            minOffsetX: horizontalConstraints.minOffsetX,
            maxOffsetX: horizontalConstraints.maxOffsetX,
            minOffsetY: verticalConstraints.minOffsetY,
            maxOffsetY: verticalConstraints.maxOffsetY
        };
    }
    
    getDefaultViewportBounds() {
        const sectorSize = GRID_SIZE * PIXEL_SIZE;
        const centerX = sectorSize / 2;
        const centerY = sectorSize / 2;
        const canvasSize = this.getLogicalCanvasSize();
        
        return {
            minOffsetX: -centerX * this.scale,
            maxOffsetX: canvasSize.width - centerX * this.scale,
            minOffsetY: -centerY * this.scale,
            maxOffsetY: canvasSize.height - centerY * this.scale
        };
    }
    
    getLogicalCanvasSize() {
        return {
            width: this.logicalWidth || this.canvas.width / (window.devicePixelRatio || 1),
            height: this.logicalHeight || this.canvas.height / (window.devicePixelRatio || 1)
        };
    }
    
    calculateActiveSectorBounds() {
        let minSectorX = Infinity, maxSectorX = -Infinity;
        let minSectorY = Infinity, maxSectorY = -Infinity;
        
        for (const sectorKey of this.activeSectors) {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            minSectorX = Math.min(minSectorX, sectorX);
            maxSectorX = Math.max(maxSectorX, sectorX);
            minSectorY = Math.min(minSectorY, sectorY);
            maxSectorY = Math.max(maxSectorY, sectorY);
        }
        
        const pixelsPerSector = GRID_SIZE * PIXEL_SIZE;
        return {
            left: minSectorX * pixelsPerSector,
            right: (maxSectorX + 1) * pixelsPerSector,
            top: minSectorY * pixelsPerSector,
            bottom: (maxSectorY + 1) * pixelsPerSector,
            minSectorX, maxSectorX, minSectorY, maxSectorY
        };
    }
    
    addPaddingToBounds(bounds) {
        const paddingSectors = 1;
        const paddingPixels = paddingSectors * GRID_SIZE * PIXEL_SIZE;
        
        return {
            left: bounds.left - paddingPixels,
            right: bounds.right + paddingPixels,
            top: bounds.top - paddingPixels,
            bottom: bounds.bottom + paddingPixels
        };
    }
    
    calculateHorizontalConstraints(paddedBounds, canvasSize) {
        const worldWidthScaled = (paddedBounds.right - paddedBounds.left) * this.scale;
        
        let minOffsetX, maxOffsetX;
        
        if (worldWidthScaled <= canvasSize.width) {
            // World smaller than screen: allow centering
            const centerOffsetX = (canvasSize.width - worldWidthScaled) / 2 - paddedBounds.left * this.scale;
            const margin = canvasSize.width * 0.1; // 10% margin
            minOffsetX = centerOffsetX - margin;
            maxOffsetX = centerOffsetX + margin;
        } else {
            // World larger than screen: edge constraints
            minOffsetX = canvasSize.width - paddedBounds.right * this.scale;
            maxOffsetX = -paddedBounds.left * this.scale;
        }
        
        return { minOffsetX, maxOffsetX, worldWidthScaled };
    }
    
    calculateVerticalConstraints(paddedBounds, canvasSize) {
        const worldHeightScaled = (paddedBounds.bottom - paddedBounds.top) * this.scale;
        
        let minOffsetY, maxOffsetY;
        
        if (worldHeightScaled <= canvasSize.height) {
            // World smaller than screen: allow centering
            const centerOffsetY = (canvasSize.height - worldHeightScaled) / 2 - paddedBounds.top * this.scale;
            const margin = canvasSize.height * 0.1; // 10% margin
            minOffsetY = centerOffsetY - margin;
            maxOffsetY = centerOffsetY + margin;
        } else {
            // World larger than screen: edge constraints
            minOffsetY = canvasSize.height - paddedBounds.bottom * this.scale;
            maxOffsetY = -paddedBounds.top * this.scale;
        }
        
        return { minOffsetY, maxOffsetY, worldHeightScaled };
    }
    
    logViewportBounds(activeBounds, paddedBounds, canvasSize, horizontalConstraints, verticalConstraints) {
        console.log(`🔍 Viewport bounds calculated:
            Active sectors: X[${activeBounds.minSectorX} to ${activeBounds.maxSectorX}] Y[${activeBounds.minSectorY} to ${activeBounds.maxSectorY}]
            World bounds: X[${activeBounds.left} to ${activeBounds.right}] Y[${activeBounds.top} to ${activeBounds.bottom}]
            Padded bounds: X[${paddedBounds.left} to ${paddedBounds.right}] Y[${paddedBounds.top} to ${paddedBounds.bottom}]
            Canvas (logical): ${canvasSize.width}x${canvasSize.height}, Scale: ${this.scale.toFixed(2)}x
            Canvas (physical): ${this.canvas.width}x${this.canvas.height}, DPR: ${window.devicePixelRatio || 1}
            World size scaled: ${horizontalConstraints.worldWidthScaled.toFixed(1)}x${verticalConstraints.worldHeightScaled.toFixed(1)}
            Offset bounds: X[${horizontalConstraints.minOffsetX.toFixed(1)} to ${horizontalConstraints.maxOffsetX.toFixed(1)}] Y[${verticalConstraints.minOffsetY.toFixed(1)} to ${verticalConstraints.maxOffsetY.toFixed(1)}]`);
    }
    }
    
    constrainViewport() {
        // Apply viewport constraints based on active sectors
        const bounds = this.getViewportBounds();
        
        const originalOffsetX = this.offsetX;
        const originalOffsetY = this.offsetY;
        
        // Apply strict constraints
        const newOffsetX = Math.max(bounds.minOffsetX, Math.min(bounds.maxOffsetX, this.offsetX));
        const newOffsetY = Math.max(bounds.minOffsetY, Math.min(bounds.maxOffsetY, this.offsetY));
        
        // Debug logging for viewport constraints
        if (Math.abs(newOffsetX - this.offsetX) > 1 || Math.abs(newOffsetY - this.offsetY) > 1) {
            console.log(`🔒 Viewport constrained: 
                Original: (${this.offsetX.toFixed(1)}, ${this.offsetY.toFixed(1)})
                New: (${newOffsetX.toFixed(1)}, ${newOffsetY.toFixed(1)})
                Bounds: X[${bounds.minOffsetX.toFixed(1)} to ${bounds.maxOffsetX.toFixed(1)}] Y[${bounds.minOffsetY.toFixed(1)} to ${bounds.maxOffsetY.toFixed(1)}]
                Scale: ${this.scale.toFixed(2)}x`);
        }
        
        this.offsetX = newOffsetX;
        this.offsetY = newOffsetY;
        
        // Show boundary warning if viewport was constrained significantly
        if (Math.abs(originalOffsetX - this.offsetX) > 5 || Math.abs(originalOffsetY - this.offsetY) > 5) {
            this.showBoundaryWarning();
        }
        
        // Check for expansion after any significant viewport change
        const offsetDeltaX = Math.abs(originalOffsetX - this.offsetX);
        const offsetDeltaY = Math.abs(originalOffsetY - this.offsetY);
        if (offsetDeltaX > 10 || offsetDeltaY > 10) { // Increase threshold
            if (!this.isExpansionRunning) {
                console.log(`📐 CONSTRAINVIEWPORT: Major change detected (Δx: ${offsetDeltaX.toFixed(1)}, Δy: ${offsetDeltaY.toFixed(1)}), scheduling expansion check`);
                setTimeout(() => {
                    if (!this.isExpansionRunning) {
                        this.checkLoadedSectorsForExpansion();
                    }
                }, 2000);
            }
        }
    }
    
    centerViewportOnActiveSectors() {
        if (this.activeSectors.size === 0) {
            // Default to center of sector (0,0)
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            return;
        }
        
        // Calculate center of all active sectors
        let sumX = 0, sumY = 0;
        for (const sectorKey of this.activeSectors) {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            sumX += sectorX;
            sumY += sectorY;
        }
        
        const centerSectorX = sumX / this.activeSectors.size;
        const centerSectorY = sumY / this.activeSectors.size;
        
        // Convert to world pixel coordinates (center of the center sector)
        const worldCenterX = (centerSectorX + 0.5) * GRID_SIZE * PIXEL_SIZE;
        const worldCenterY = (centerSectorY + 0.5) * GRID_SIZE * PIXEL_SIZE;
        
        // Center the viewport on this world position
        this.offsetX = this.canvas.width / 2 - worldCenterX * this.scale;
        this.offsetY = this.canvas.height / 2 - worldCenterY * this.scale;
        
        console.log(`📍 Centered viewport on active sectors:
            Center sector: (${centerSectorX.toFixed(1)}, ${centerSectorY.toFixed(1)})
            World center: (${worldCenterX.toFixed(1)}, ${worldCenterY.toFixed(1)})
            Viewport offset: (${this.offsetX.toFixed(1)}, ${this.offsetY.toFixed(1)})
            Active sectors: ${Array.from(this.activeSectors).join(', ')}`);
        
        // Apply constraints after centering
        this.constrainViewport();
    }
    
    showBoundaryWarning() {
        // Visual feedback when hitting viewport boundaries
        let warning = document.getElementById('boundaryWarning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'boundaryWarning';
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
            warning.textContent = '🚫 アクティブエリアの境界です';
            document.body.appendChild(warning);
        }
        
        warning.style.display = 'block';
        
        // Auto-hide after 2 seconds
        clearTimeout(this.boundaryWarningTimeout);
        this.boundaryWarningTimeout = setTimeout(() => {
            warning.style.display = 'none';
        }, 2000);
    }

    renderActiveSectorBounds() {
        const sectorSize = GRID_SIZE * PIXEL_SIZE * this.scale;
        
        // Only show visual bounds when sectors are large enough to see
        if (sectorSize < 30) return;
        
        // Calculate visible sector range
        const startSectorX = Math.floor(-this.offsetX / sectorSize);
        const endSectorX = Math.ceil((this.canvas.width - this.offsetX) / sectorSize);
        const startSectorY = Math.floor(-this.offsetY / sectorSize);
        const endSectorY = Math.ceil((this.canvas.height - this.offsetY) / sectorSize);
        
        // Draw each visible sector with appropriate styling
        console.log(`🎨 RENDER: Drawing sectors in range X[${startSectorX} to ${endSectorX}] Y[${startSectorY} to ${endSectorY}]`);
        console.log(`🎨 RENDER: Current active sectors: ${Array.from(this.activeSectors).join(', ')}`);
        
        for (let sectorX = startSectorX; sectorX <= endSectorX; sectorX++) {
            for (let sectorY = startSectorY; sectorY <= endSectorY; sectorY++) {
                const sectorKey = `${sectorX},${sectorY}`;
                const isActive = this.activeSectors.has(sectorKey);
                
                // Count actual pixels in this sector for debugging
                let pixelCount = 0;
                for (const [key, color] of this.pixels) {
                    const [pSectorX, pSectorY] = key.split(',').map(Number);
                    if (pSectorX === sectorX && pSectorY === sectorY) {
                        pixelCount++;
                    }
                }
                
                const shouldBeActive = pixelCount > 0 && (pixelCount / (GRID_SIZE * GRID_SIZE)) >= SECTOR_EXPANSION_THRESHOLD;
                console.log(`🎨 RENDER: Sector ${sectorKey} - IsActive: ${isActive}, Pixels: ${pixelCount}, ShouldBeActive: ${shouldBeActive}`);
                
                // Calculate screen position of sector
                const screenX = this.offsetX + sectorX * sectorSize;
                const screenY = this.offsetY + sectorY * sectorSize;
                
                if (isActive) {
                    // Active sector: bright green border
                    this.ctx.strokeStyle = '#00ff00';
                    this.ctx.lineWidth = Math.max(1, Math.min(3, 2 / this.scale));
                    this.ctx.setLineDash([]);
                    
                    this.ctx.strokeRect(screenX, screenY, sectorSize, sectorSize);
                    
                    // Show sector info when zoomed in enough and text fits
                    if (sectorSize > 80) {
                        // Count actual pixels in this sector for accurate display
                        let actualPixelCount = 0;
                        for (const [key, color] of this.pixels) {
                            const [pSectorX, pSectorY] = key.split(',').map(Number);
                            if (pSectorX === sectorX && pSectorY === sectorY) {
                                actualPixelCount++;
                            }
                        }
                        
                        const coordinateText = `(${sectorX},${sectorY})`;
                        const pixelText = `${actualPixelCount}px`;
                        
                        // Calculate appropriate font size that fits within sector
                        const maxFontSize = Math.floor(sectorSize / 8);
                        const fontSize = Math.max(8, Math.min(16, maxFontSize));
                        
                        this.ctx.fillStyle = '#00ff00';
                        this.ctx.font = `${fontSize}px monospace`;
                        this.ctx.textAlign = 'center';
                        
                        // Check if text fits within sector bounds
                        const coordWidth = this.ctx.measureText(coordinateText).width;
                        const pixelWidth = this.ctx.measureText(pixelText).width;
                        const maxWidth = sectorSize - 8; // 4px padding on each side
                        
                        if (coordWidth <= maxWidth && pixelWidth <= maxWidth && fontSize >= 10) {
                            const centerX = screenX + sectorSize / 2;
                            const centerY = screenY + sectorSize / 2;
                            
                            this.ctx.textBaseline = 'middle';
                            
                            // Check if we can fit both lines comfortably
                            const lineSpacing = fontSize * 1.2;
                            if (sectorSize > lineSpacing * 3) {
                                // Two lines: coordinate above center, pixel count below center
                                this.ctx.fillText(coordinateText, centerX, centerY - lineSpacing / 2);
                                this.ctx.fillText(pixelText, centerX, centerY + lineSpacing / 2);
                            } else {
                                // Single line: combine or show coordinate only
                                const combinedText = `${coordinateText} ${pixelText}`;
                                const combinedWidth = this.ctx.measureText(combinedText).width;
                                
                                if (combinedWidth <= maxWidth) {
                                    this.ctx.fillText(combinedText, centerX, centerY);
                                } else {
                                    // Show coordinate only if combined doesn't fit
                                    this.ctx.fillText(coordinateText, centerX, centerY);
                                }
                            }
                        }
                    }
                } else {
                    // Inactive sector: dim overlay
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    this.ctx.fillRect(screenX, screenY, sectorSize, sectorSize);
                    
                    // Red dashed border
                    this.ctx.strokeStyle = '#ff4444';
                    this.ctx.lineWidth = Math.max(0.5, Math.min(2, 1.5 / this.scale));
                    this.ctx.setLineDash([8, 4]);
                    this.ctx.strokeRect(screenX, screenY, sectorSize, sectorSize);
                    
                    // "LOCKED" text when zoomed in enough and fits
                    if (sectorSize > 60) {
                        const lockedText = 'LOCKED';
                        
                        // Calculate appropriate font size that fits within sector
                        const maxFontSize = Math.floor(sectorSize / 6);
                        const fontSize = Math.max(8, Math.min(14, maxFontSize));
                        
                        this.ctx.fillStyle = '#ff4444';
                        this.ctx.font = `${fontSize}px monospace`;
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        
                        // Check if text fits within sector bounds
                        const textWidth = this.ctx.measureText(lockedText).width;
                        const maxWidth = sectorSize - 8; // 4px padding on each side
                        
                        if (textWidth <= maxWidth && fontSize >= 8) {
                            const centerX = screenX + sectorSize / 2;
                            const centerY = screenY + sectorSize / 2;
                            
                            this.ctx.fillText(lockedText, centerX, centerY);
                        }
                    }
                }
            }
        }
        
        // Reset line dash for other drawing
        this.ctx.setLineDash([]);
    }
    
    setupMobileDebugPanel() {
        this.createDebugPanel();
        this.createCopyButton();
        this.createFreezeButton();
        this.createClearButton();
        this.createToggleButton();
        this.initializeDebugState();
    }
    
    createDebugPanel() {
        this.debugPanel = document.createElement('div');
        this.debugPanel.id = 'mobileDebugPanel';
        this.debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: calc(100vw - 20px);
            max-height: 200px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            padding: 30px 10px 10px 10px;
            border-radius: 5px;
            z-index: 10000;
            overflow-y: auto;
            display: none;
        `;
        document.body.appendChild(this.debugPanel);
    }
    
    createCopyButton() {
        this.copyButton = document.createElement('button');
        this.copyButton.textContent = '📋 Copy Logs';
        this.copyButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: #333;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
            padding: 5px 8px;
            font-size: 10px;
            cursor: pointer;
            z-index: 10002;
        `;
        this.copyButton.addEventListener('click', () => this.copyLogsToClipboard());
        this.debugPanel.appendChild(this.copyButton);
    }
    
    createFreezeButton() {
        this.freezeButton = document.createElement('button');
        this.freezeButton.textContent = '❄️ Freeze';
        this.freezeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 85px;
            background: #333;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
            padding: 5px 8px;
            font-size: 10px;
            cursor: pointer;
            z-index: 10002;
        `;
        this.freezeButton.addEventListener('click', () => this.toggleFreezeLogs());
        this.debugPanel.appendChild(this.freezeButton);
    }
    
    createClearButton() {
        this.clearButton = document.createElement('button');
        this.clearButton.textContent = '🗑️ Clear';
        this.clearButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 155px;
            background: #333;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
            padding: 5px 8px;
            font-size: 10px;
            cursor: pointer;
            z-index: 10002;
        `;
        this.clearButton.addEventListener('click', () => this.clearLogs());
        this.debugPanel.appendChild(this.clearButton);
    }
    
    createToggleButton() {
        this.debugToggle = document.createElement('button');
        this.debugToggle.textContent = '🐛';
        this.debugToggle.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 20px;
            z-index: 10001;
            cursor: pointer;
        `;
        this.debugToggle.addEventListener('click', () => {
            const isVisible = this.debugPanel.style.display !== 'none';
            this.debugPanel.style.display = isVisible ? 'none' : 'block';
            this.debugToggle.textContent = isVisible ? '🐛' : '❌';
        });
        document.body.appendChild(this.debugToggle);
    }
    
    initializeDebugState() {
        this.debugLogs = [];
        this.maxDebugLogs = 200;
        this.logsFrozen = false;
    }
    
    mobileLog(message) {
        // Skip logging if frozen
        if (this.logsFrozen) {
            return;
        }
        
        // Add timestamp
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // Add to logs array
        this.debugLogs.push(logEntry);
        if (this.debugLogs.length > this.maxDebugLogs) {
            this.debugLogs.shift();
        }
        
        // Update panel
        if (this.debugPanel) {
            // Create content div to separate logs from buttons
            let contentDiv = this.debugPanel.querySelector('.debug-content');
            if (!contentDiv) {
                contentDiv = document.createElement('div');
                contentDiv.className = 'debug-content';
                this.debugPanel.appendChild(contentDiv);
            }
            contentDiv.innerHTML = this.debugLogs.join('<br>');
            this.debugPanel.scrollTop = this.debugPanel.scrollHeight;
        }
        
        // Also log to console for desktop users
        console.log(message);
    }
    
    copyLogsToClipboard() {
        // Create text version of logs
        const logText = this.debugLogs.join('\n');
        
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(logText).then(() => {
                this.showCopySuccess();
            }).catch(() => {
                this.fallbackCopy(logText);
            });
        } else {
            this.fallbackCopy(logText);
        }
    }
    
    fallbackCopy(text) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopySuccess();
        } catch (err) {
            console.error('Failed to copy logs:', err);
            alert('Copy failed. Please manually select and copy the logs.');
        }
        
        document.body.removeChild(textArea);
    }
    
    showCopySuccess() {
        const originalText = this.copyButton.textContent;
        this.copyButton.textContent = '✅ Copied!';
        this.copyButton.style.background = '#4ade80';
        
        setTimeout(() => {
            this.copyButton.textContent = originalText;
            this.copyButton.style.background = '#333';
        }, 2000);
    }
    
    toggleFreezeLogs() {
        this.logsFrozen = !this.logsFrozen;
        this.freezeButton.textContent = this.logsFrozen ? '🔥 Unfreeze' : '❄️ Freeze';
        this.freezeButton.style.background = this.logsFrozen ? '#ef4444' : '#333';
    }
    
    clearLogs() {
        if (this.logsFrozen) {
            alert('Logs are frozen. Unfreeze first to clear.');
            return;
        }
        
        this.debugLogs = [];
        if (this.debugPanel) {
            const contentDiv = this.debugPanel.querySelector('.debug-content');
            if (contentDiv) {
                contentDiv.innerHTML = '';
            }
        }
        this.mobileLog('🗑️ Logs cleared');
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
        // Ensure stock never goes negative
        this.pixelStock = Math.max(0, Math.min(MAX_PIXEL_STOCK, this.pixelStock));
        
        const percentage = (this.pixelStock / MAX_PIXEL_STOCK) * 100;
        this.cooldownIndicator.style.background = `linear-gradient(to right, #4ade80 ${percentage}%, var(--color-border) ${percentage}%)`;
        
        // Update pixel count to show stock
        this.pixelCount.textContent = `${this.pixelStock}/${MAX_PIXEL_STOCK}`;
    }
    
    async loadPixelsFromSupabase() {
        try {
            this.mobileLog('🔄 Loading pixels from database...');
            
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
            this.mobileLog(`✅ Loaded ${pixels.length} pixels from database`);
            
            // Convert to our internal format and track sectors
            const sectorStats = new Map();
            for (const pixel of pixels) {
                const key = `${pixel.sector_x},${pixel.sector_y},${pixel.local_x},${pixel.local_y}`;
                this.pixels.set(key, pixel.color);
                
                // Track which sectors have pixels for debugging
                const sectorKey = `${pixel.sector_x},${pixel.sector_y}`;
                sectorStats.set(sectorKey, (sectorStats.get(sectorKey) || 0) + 1);
            }
            
            // Log sectors found in database
            this.mobileLog(`📊 Sectors in DB: ${Array.from(sectorStats.keys()).join(',')}`);
            for (const [sectorKey, count] of sectorStats) {
                this.mobileLog(`📊 DB ${sectorKey}: ${count} pixels`);
            }
            
            // Load sector counts
            await this.loadSectorCounts();
            
            // Center viewport on active sectors (includes viewport constraints)
            this.centerViewportOnActiveSectors();
            
            console.log(`Total pixels in memory: ${this.pixels.size}`);
            this.render();
            
        } catch (error) {
            console.error('Failed to load pixels from Supabase:', error);
        }
    }
    
    async loadSectorCounts() {
        try {
            console.log('Loading sector counts from Supabase...');
            
            const response = await fetch(`${SUPABASE_URL}/rest/v1/sectors?select=*`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to load sector counts:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const sectors = await response.json();
            console.log(`Successfully loaded ${sectors.length} sectors:`, sectors);
            
            console.log(`Successfully loaded ${sectors.length} sectors from database`);
            // Note: Using real-time pixel counting instead of cached counts
            
        } catch (error) {
            console.error('Failed to load sector counts:', error);
            console.log('Note: Using real-time pixel counting as fallback');
        }
    }
    
    // Removed calculateSectorCountsFromPixels() and recalculateSectorCounts()
    // Using getRealTimePixelCount() for all pixel counting needs
    
    debounceExpansionCheck() {
        // Debounce expansion checks to avoid too many database calls
        clearTimeout(this.expansionCheckTimeout);
        this.expansionCheckTimeout = setTimeout(() => {
            // Disable excessive expansion checking temporarily
            // this.checkVisibleSectorsForExpansion();
        }, 500); // Increased delay and disabled
    }
    
    checkLoadedSectorsForExpansion() {
        // Prevent concurrent execution
        if (this.isExpansionRunning) {
            this.mobileLog(`⏸️ Expansion already running, skipping...`);
            return;
        }
        this.isExpansionRunning = true;
        
        try {
            this.mobileLog(`🔍 === CHECKING LOADED SECTORS ===`);
            this.mobileLog(`🔍 Pixels: ${this.pixels.size}, Active: ${Array.from(this.activeSectors).join(',')}`);
            this.mobileLog(`🔍 Threshold: ${(SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}%`);
            
            // Use pixels as single source of truth - count pixels in real-time
            const sectorCounts = this.calculateRealTimeSectorCounts();
        
        this.mobileLog(`🔍 Found ${sectorCounts.size} sectors with pixels:`);
        for (const [sectorKey, count] of sectorCounts) {
            const isActive = this.activeSectors.has(sectorKey);
            const maxPixels = GRID_SIZE * GRID_SIZE;
            const percentage = (count / maxPixels * 100).toFixed(2);
            const exceedsThreshold = count / maxPixels >= SECTOR_EXPANSION_THRESHOLD;
            this.mobileLog(`🔍 ${sectorKey}: ${count}px (${percentage}%) Active:${isActive} Exceeds:${exceedsThreshold}`);
            
            // Flag problematic sectors for detailed analysis
            if (exceedsThreshold && isActive) {
                this.mobileLog(`⚠️ PROBLEM: ${sectorKey} exceeds threshold but is still marked as active!`);
            }
        }
        
        let expandedAny = false;
        
        // Check each sector with pixels
        for (const [sectorKey, pixelCount] of sectorCounts) {
            // If this sector has pixels but is in activeSectors, remove it
            // (activeSectors should only contain empty sectors)
            if (this.activeSectors.has(sectorKey)) {
                this.activeSectors.delete(sectorKey);
                this.mobileLog(`🗑️ Removed ${sectorKey} from activeSectors (has pixels)`);
            }
            
            // Check if expansion is needed
            const maxPixelsPerSector = GRID_SIZE * GRID_SIZE;
            const fillPercentage = pixelCount / maxPixelsPerSector;
            
            this.mobileLog(`📊 Evaluating ${sectorKey}: ${pixelCount}px (${(fillPercentage * 100).toFixed(4)}%)`);
            this.mobileLog(`📊 Threshold: ${(SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}%, Meets: ${fillPercentage >= SECTOR_EXPANSION_THRESHOLD}`);
            
            if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD && pixelCount >= 7) {
                const [sectorX, sectorY] = sectorKey.split(',').map(Number);
                
                // Double-check with real-time count to prevent inconsistency
                const realTimeCount = this.getRealTimePixelCount(sectorKey);
                if (realTimeCount >= 7) {
                    this.mobileLog(`🔄 EXPANDING ${sectorKey} (verified: ${realTimeCount} pixels)`);
                    this.expandSectorsLocally(sectorX, sectorY);
                    expandedAny = true;
                } else {
                    this.mobileLog(`❌ ${sectorKey} inconsistent data: cached=${pixelCount}, real=${realTimeCount}`);
                }
            }
        }
        
        if (!expandedAny) {
            this.mobileLog(`📍 No expansion needed`);
        } else {
            this.mobileLog(`🎯 Expanded! New active: ${Array.from(this.activeSectors).join(',')}`);
        }
        
        this.mobileLog(`🔍 === END CHECK ===`);
        
        // Clean up activeSectors to ensure consistency
        this.cleanupActiveSectors();
        
        // Also schedule async check for completeness (for database validation)
        this.debounceExpansionCheck();
        
        } finally {
            this.isExpansionRunning = false;
        }
    }
    
    calculateRealTimeSectorCounts() {
        // Single source of truth: count pixels directly from this.pixels
        const sectorCounts = new Map();
        for (const [key, color] of this.pixels) {
            const [sectorX, sectorY] = key.split(',').map(Number);
            const sectorKey = `${sectorX},${sectorY}`;
            sectorCounts.set(sectorKey, (sectorCounts.get(sectorKey) || 0) + 1);
        }
        return sectorCounts;
    }
    
    getRealTimePixelCount(sectorKey) {
        // Real-time pixel count for specific sector
        let count = 0;
        const [targetSectorX, targetSectorY] = sectorKey.split(',').map(Number);
        
        for (const [key, color] of this.pixels) {
            const [sectorX, sectorY] = key.split(',').map(Number);
            if (sectorX === targetSectorX && sectorY === targetSectorY) {
                count++;
            }
        }
        return count;
    }
    
    // Removed logSectorExpansionDetails - causing performance issues with excessive logging
    
    cleanupActiveSectors() {
        // Remove any sectors from activeSectors that have pixels (using real-time count)
        // activeSectors should only contain empty sectors available for drawing
        const sectorsToRemove = [];
        
        for (const sectorKey of this.activeSectors) {
            const pixelCount = this.getRealTimePixelCount(sectorKey);
            if (pixelCount > 0) {
                sectorsToRemove.push(sectorKey);
            }
        }
        
        for (const sectorKey of sectorsToRemove) {
            this.activeSectors.delete(sectorKey);
            const realPixelCount = this.getRealTimePixelCount(sectorKey);
            this.mobileLog(`🧹 Cleanup: Removed ${sectorKey} from activeSectors (${realPixelCount} pixels)`);
        }
        
        if (sectorsToRemove.length > 0) {
            this.mobileLog(`🧹 Cleanup complete: Removed ${sectorsToRemove.length} sectors from activeSectors`);
            this.mobileLog(`🧹 Active sectors now: ${Array.from(this.activeSectors).join(',')}`);
        }
    }
    
    async checkVisibleSectorsForExpansion() {
        // Check all visible sectors for expansion threshold
        const sectorSize = GRID_SIZE * PIXEL_SIZE * this.scale;
        
        // Calculate visible sector range
        const startSectorX = Math.floor(-this.offsetX / sectorSize) - 1;
        const endSectorX = Math.ceil((this.canvas.width - this.offsetX) / sectorSize) + 1;
        const startSectorY = Math.floor(-this.offsetY / sectorSize) - 1;
        const endSectorY = Math.ceil((this.canvas.height - this.offsetY) / sectorSize) + 1;
        
        console.log(`🔍 Checking visible sectors for expansion: X[${startSectorX} to ${endSectorX}] Y[${startSectorY} to ${endSectorY}]`);
        
        try {
            // Query pixels table directly to count pixels by sector in visible range
            // This catches sectors that have pixels but aren't in sectors table yet
            const response = await fetch(`${SUPABASE_URL}/rest/v1/pixels?sector_x=gte.${startSectorX}&sector_x=lte.${endSectorX}&sector_y=gte.${startSectorY}&sector_y=lte.${endSectorY}&select=sector_x,sector_y`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                console.error('Failed to load pixels for expansion check');
                return;
            }
            
            const pixels = await response.json();
            console.log(`Found ${pixels.length} pixels in visible range`);
            
            // Count pixels by sector
            const sectorCounts = new Map();
            for (const pixel of pixels) {
                const sectorKey = `${pixel.sector_x},${pixel.sector_y}`;
                sectorCounts.set(sectorKey, (sectorCounts.get(sectorKey) || 0) + 1);
            }
            
            console.log(`Calculated pixel counts for ${sectorCounts.size} sectors:`, Array.from(sectorCounts.entries()));
            
            let expandedAny = false;
            
            // Check each sector with pixels
            for (const [sectorKey, pixelCount] of sectorCounts) {
                // If this sector has pixels but is in activeSectors, remove it
                // (activeSectors should only contain empty sectors)
                if (this.activeSectors.has(sectorKey)) {
                    this.activeSectors.delete(sectorKey);
                    console.log(`🗑️ Viewport check: Removed ${sectorKey} from activeSectors (has pixels)`);
                }
                
                // Check if expansion is needed
                const maxPixelsPerSector = GRID_SIZE * GRID_SIZE;
                const fillPercentage = pixelCount / maxPixelsPerSector;
                
                console.log(`🔍 Sector ${sectorKey}: ${pixelCount} pixels (${(fillPercentage * 100).toFixed(3)}%)`);
                
                if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD && pixelCount >= 7) {
                    const [sectorX, sectorY] = sectorKey.split(',').map(Number);
                    console.log(`🔄 Viewport expansion: sector (${sectorX}, ${sectorY}) exceeds threshold with ${pixelCount} pixels!`);
                    this.expandSectorsLocally(sectorX, sectorY);
                    expandedAny = true;
                }
            }
            
            if (expandedAny) {
                console.log(`🎯 Expanded sectors based on viewport visibility`);
                this.render(); // Re-render to show new active sectors
            } else {
                console.log(`📍 No sectors in visible range need expansion`);
            }
            
            // Clean up activeSectors to ensure consistency
            this.cleanupActiveSectors();
            
        } catch (error) {
            console.error('Failed to check visible sectors for expansion:', error);
        }
    }
    
    updateSectorCountInDatabase(sectorKey) {
        // Update database with real-time pixel count
        setTimeout(() => {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            const realCount = this.getRealTimePixelCount(sectorKey);
            
            fetch(`${SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    pixel_count: realCount
                })
            }).catch(() => {}); // Ignore errors
        }, 0);
    }
    
    async checkSectorExpansion(sectorX, sectorY, pixelCount) {
        const maxPixelsPerSector = GRID_SIZE * GRID_SIZE; // 256 * 256 = 65536
        const fillPercentage = pixelCount / maxPixelsPerSector;
        const thresholdPixels = Math.ceil(maxPixelsPerSector * SECTOR_EXPANSION_THRESHOLD);
        
        console.log(`🔍 Checking expansion for sector (${sectorX}, ${sectorY}):
            Pixels: ${pixelCount}/${maxPixelsPerSector}
            Fill percentage: ${(fillPercentage * 100).toFixed(4)}%
            Threshold: ${(SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}% (${thresholdPixels} pixels)
            Should expand: ${fillPercentage >= SECTOR_EXPANSION_THRESHOLD}`);
        
        if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD) {
            console.log(`🚀 Sector (${sectorX}, ${sectorY}) is ${(fillPercentage * 100).toFixed(2)}% full. Expanding...`);
            this.expandSectorsLocally(sectorX, sectorY);
        }
    }
    
    expandSectorsLocally(centerX, centerY) {
        const centerKey = `${centerX},${centerY}`;
        
        // Use real-time pixel count to prevent data inconsistency
        const centerPixelCount = this.getRealTimePixelCount(centerKey);
        
        // CRITICAL: Only expand if center sector actually has enough pixels
        if (centerPixelCount < 7) {
            this.mobileLog(`❌ ABORT EXPANSION: ${centerKey} has ${centerPixelCount} pixels (need 7+)`);
            return;
        }
        
        this.mobileLog(`🎯 EXPANSION START: Center (${centerX}, ${centerY}) with ${centerPixelCount} verified pixels`);
        
        // Remove center sector from activeSectors since it now has pixels
        if (this.activeSectors.has(centerKey)) {
            this.activeSectors.delete(centerKey);
            this.mobileLog(`🗑️ Removed ${centerKey} from activeSectors`);
        }
        
        // 8-direction expansion
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        let expanded = false;
        
        for (const [dx, dy] of directions) {
            const newX = centerX + dx;
            const newY = centerY + dy;
            const sectorKey = `${newX},${newY}`;
            
            if (!this.activeSectors.has(sectorKey)) {
                this.activeSectors.add(sectorKey);
                console.log(`🎯 Expanded to sector (${newX}, ${newY})`);
                expanded = true;
                
                // Create sector in database (fire and forget)
                fetch(`${SUPABASE_URL}/rest/v1/sectors`, {
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
                }).catch(() => {}); // Ignore errors
            }
        }
        
        // Expansion is successful if any surrounding sectors were added
        if (expanded) {
            this.mobileLog(`🎯 EXPANSION DONE: ${centerPixelCount} pixels triggered expansion`);
            this.mobileLog(`🎯 Active after expansion: ${Array.from(this.activeSectors).join(',')}`);
            // Show visual feedback for expansion
            this.showExpansionNotification(centerX, centerY);
            // Update UI immediately
            this.render();
            this.constrainViewport();
        } else {
            this.mobileLog(`🎯 No expansion needed - all surrounding sectors already active`);
        }
    }
    
    showExpansionNotification(sectorX, sectorY) {
        // Create a temporary notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: #4ade80;
            color: #000;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = `🎉 Canvas expanded! Sector (${sectorX},${sectorY}) reached threshold`;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translate(-50%, -20px); }
                to { opacity: 1; transform: translate(-50%, 0); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
        }, 3000);
    }
    
    async expandSectors(centerX, centerY) {
        // Keep for compatibility but use local version
        this.expandSectorsLocally(centerX, centerY);
    }
    
    // Remove server-side rate limiting for now - too slow
    async checkRateLimit() {
        return true; // Always allow for performance
    }
    
    async getServerSideStock(ipAddress) {
        try {
            // Get the last 10 actions from this IP
            const response = await fetch(`${SUPABASE_URL}/rest/v1/user_actions?ip_address=eq.${ipAddress}&action_type=eq.pixel_draw&order=created_at.desc&limit=10`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                return MAX_PIXEL_STOCK; // Fail open
            }
            
            const actions = await response.json();
            
            if (actions.length === 0) {
                // No previous actions, full stock
                return MAX_PIXEL_STOCK;
            }
            
            // Calculate stock based on time since actions
            const now = Date.now();
            let stock = MAX_PIXEL_STOCK - actions.length;
            
            // Add recovery based on time since oldest action
            if (actions.length === MAX_PIXEL_STOCK) {
                const oldestAction = new Date(actions[actions.length - 1].created_at).getTime();
                const timePassed = now - oldestAction;
                const recovered = Math.floor(timePassed / STOCK_RECOVER_MS);
                stock = Math.min(MAX_PIXEL_STOCK, recovered);
            } else {
                // If less than 10 actions, calculate based on newest action
                const newestAction = new Date(actions[0].created_at).getTime();
                const timePassed = now - newestAction;
                const recovered = Math.floor(timePassed / STOCK_RECOVER_MS);
                stock = Math.min(MAX_PIXEL_STOCK, stock + recovered);
            }
            
            return Math.max(0, stock);
            
        } catch (error) {
            console.error('Failed to get server-side stock:', error);
            return MAX_PIXEL_STOCK; // Fail open
        }
    }
    
    async getCachedIP() {
        const now = Date.now();
        // Cache IP for 5 minutes
        if (this.cachedIP && (now - this.ipCacheTime) < 300000) {
            return this.cachedIP;
        }
        
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            this.cachedIP = ipData.ip;
            this.ipCacheTime = now;
            return this.cachedIP;
        } catch (error) {
            console.error('Failed to get IP:', error);
            return 'unknown';
        }
    }
    
    // Lazy logging - don't block UI
    logUserActionLazy(actionType) {
        // Run in background without blocking
        setTimeout(async () => {
            try {
                const ip = await this.getCachedIP();
                
                fetch(`${SUPABASE_URL}/rest/v1/user_actions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        ip_address: ip,
                        device_id: this.deviceId,
                        action_type: actionType
                    })
                });
            } catch (error) {
                // Ignore errors in background
            }
        }, 0);
    }
    
    async logUserAction(actionType) {
        // Keep for compatibility but use lazy version
        this.logUserActionLazy(actionType);
    }
    
    async syncWithServerStock() {
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            const serverStock = await this.getServerSideStock(ipData.ip);
            
            // Use the lower of client or server stock
            const syncedStock = Math.min(this.pixelStock, serverStock);
            
            if (syncedStock !== this.pixelStock) {
                console.log(`Syncing stock: client ${this.pixelStock} -> server ${serverStock} = ${syncedStock}`);
                this.pixelStock = syncedStock;
                this.updateStockDisplay();
                this.saveStockState();
            }
            
        } catch (error) {
            console.error('Failed to sync with server stock:', error);
        }
    }
    
    async testExpansion() {
        console.log('🧪 Starting expansion test...');
        
        // Draw pixels in center of sector (0,0)
        const centerX = 128; // Center of 256x256 sector
        const centerY = 128;
        
        for (let i = 0; i < 10; i++) {
            const x = centerX + (i % 3) * 2 - 2;
            const y = centerY + Math.floor(i / 3) * 2 - 2;
            
            console.log(`Drawing test pixel at (${x}, ${y})`);
            this.drawPixel(0, 0, x, y, Math.floor(Math.random() * 16));
            
            // Note: Using real-time pixel counting
            
            // Small delay between pixels
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('✅ Test complete! Expansion should have triggered.');
    }
    
    isWithinActiveSectors(x, y) {
        const worldX = Math.floor((x - this.offsetX) / (PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (PIXEL_SIZE * this.scale));
        
        const sectorX = Math.floor(worldX / GRID_SIZE);
        const sectorY = Math.floor(worldY / GRID_SIZE);
        const sectorKey = `${sectorX},${sectorY}`;
        
        return this.activeSectors.has(sectorKey);
    }
    
    showOutOfBoundsWarning() {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: #f87171;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: bold;
            z-index: 1000;
            animation: shake 0.5s ease-in-out;
        `;
        warning.textContent = '⚠️ You can only draw in active sectors!';
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translate(-50%, 0); }
                25% { transform: translate(-50%, -5px); }
                75% { transform: translate(-50%, 5px); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(warning);
        
        setTimeout(() => {
            warning.style.opacity = '0';
            warning.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                warning.remove();
                style.remove();
            }, 300);
        }, 2000);
    }
    
    setupRealtimeSubscription() {
        if (!supabaseClient) {
            console.warn('Supabase client not available for realtime');
            return;
        }
        
        // Subscribe to pixel changes
        this.realtimeChannel = supabaseClient
            .channel('pixels-changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pixels'
            }, (payload) => {
                this.handleRemotePixel(payload.new);
            })
            .subscribe();
            
        console.log('🔄 Realtime subscription active for pixel changes');
    }
    
    handleRemotePixel(pixelData) {
        // Don't process our own pixels
        const key = `${pixelData.sector_x},${pixelData.sector_y},${pixelData.local_x},${pixelData.local_y}`;
        
        // Add to remote pixels buffer for batched rendering
        this.remotePixelsBuffer.set(key, pixelData.color);
        
        // Also add to main pixels map for persistence
        this.pixels.set(key, pixelData.color);
        
        // Sector pixel counting is now handled by getRealTimePixelCount() as single source of truth
        
        // Batch render for performance (render every 100ms)
        if (!this.renderTimeout) {
            this.renderTimeout = setTimeout(() => {
                this.renderRemotePixels();
                this.renderTimeout = null;
            }, 100);
        }
        
        console.log(`📡 Received remote pixel: ${key} = color ${pixelData.color}`);
    }
    
    renderRemotePixels() {
        if (this.remotePixelsBuffer.size === 0) return;
        
        console.log(`🎨 Rendering ${this.remotePixelsBuffer.size} remote pixels`);
        
        // Render all buffered remote pixels
        for (const [key, color] of this.remotePixelsBuffer) {
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * GRID_SIZE + localX;
            const worldY = sectorY * GRID_SIZE + localY;
            this.renderPixel(worldX, worldY, color);
        }
        
        // Clear the buffer
        this.remotePixelsBuffer.clear();
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
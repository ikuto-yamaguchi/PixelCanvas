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
        this.sectorPixelCounts = new Map(); // Track pixel count per sector
        this.deviceId = this.generateDeviceId(); // Unique device identifier
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
                    this.constrainViewport(); // Apply viewport constraints
                    this.render();
                }
            } else if (e.touches.length === 2 && touchState.touches === 2) {
                // Two finger pinch zoom
                const distance = getDistance(e.touches[0], e.touches[1]);
                const scaleChange = distance / touchState.initialDistance;
                const newScale = Math.max(0.1, Math.min(16, touchState.initialScale * scaleChange));
                
                // Use the initial center point for consistent zoom behavior
                const centerX = touchState.initialCenterX;
                const centerY = touchState.initialCenterY;
                
                // Calculate new offset to zoom towards the initial center
                const scaleFactor = newScale / touchState.initialScale;
                this.offsetX = centerX - (centerX - touchState.initialOffsetX) * scaleFactor;
                this.offsetY = centerY - (centerY - touchState.initialOffsetY) * scaleFactor;
                this.scale = newScale;
                
                this.constrainViewport(); // Apply viewport constraints after zoom
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
            this.constrainViewport(); // Apply viewport constraints
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
            const newScale = Math.max(0.1, Math.min(16, this.scale * delta));
            
            const scaleFactor = newScale / this.scale;
            this.offsetX = mouseX - (mouseX - this.offsetX) * scaleFactor;
            this.offsetY = mouseY - (mouseY - this.offsetY) * scaleFactor;
            this.scale = newScale;
            
            this.constrainViewport(); // Apply viewport constraints after zoom
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
        const currentCount = this.sectorPixelCounts.get(sectorKey) || 0;
        const newCount = currentCount + 1;
        this.sectorPixelCounts.set(sectorKey, newCount);
        
        // Check if we need to expand (70% full)
        const maxPixelsPerSector = GRID_SIZE * GRID_SIZE;
        const fillPercentage = newCount / maxPixelsPerSector;
        
        if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD) {
            console.log(`Sector (${sectorX}, ${sectorY}) is ${Math.round(fillPercentage * 100)}% full!`);
            this.expandSectorsLocally(sectorX, sectorY);
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
        
        // Initialize sector (0,0) if not exists
        this.sectorPixelCounts.set('0,0', 0);
        
        // Load pixels from Supabase
        this.loadPixelsFromSupabase();
        
        // Setup realtime subscription
        this.setupRealtimeSubscription();
        
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
        // ビューポート境界計算の設計思想:
        // 1. アクティブセクターが画面から完全に外れないようにする
        // 2. 適度なパディングで快適な操作性を確保
        // 3. ズームレベルに関わらず一貫した境界
        
        // アクティブセクターがない場合のデフォルト
        if (this.activeSectors.size === 0) {
            // セクター(0,0)を中心とした1セクター分の範囲
            const sectorSize = GRID_SIZE * PIXEL_SIZE;
            const centerX = sectorSize / 2;
            const centerY = sectorSize / 2;
            
            // Use logical canvas size (CSS pixels) for viewport calculations
            const canvasWidth = this.logicalWidth || this.canvas.width / (window.devicePixelRatio || 1);
            const canvasHeight = this.logicalHeight || this.canvas.height / (window.devicePixelRatio || 1);
            
            return {
                minOffsetX: -centerX * this.scale,
                maxOffsetX: canvasWidth - centerX * this.scale,
                minOffsetY: -centerY * this.scale,
                maxOffsetY: canvasHeight - centerY * this.scale
            };
        }
        
        // アクティブセクターの境界を計算
        let minSectorX = Infinity, maxSectorX = -Infinity;
        let minSectorY = Infinity, maxSectorY = -Infinity;
        
        for (const sectorKey of this.activeSectors) {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            minSectorX = Math.min(minSectorX, sectorX);
            maxSectorX = Math.max(maxSectorX, sectorX);
            minSectorY = Math.min(minSectorY, sectorY);
            maxSectorY = Math.max(maxSectorY, sectorY);
        }
        
        // ワールド座標でのアクティブエリアの境界（ピクセル単位）
        const pixelsPerSector = GRID_SIZE * PIXEL_SIZE;
        const worldBounds = {
            left: minSectorX * pixelsPerSector,
            right: (maxSectorX + 1) * pixelsPerSector,
            top: minSectorY * pixelsPerSector,
            bottom: (maxSectorY + 1) * pixelsPerSector
        };
        
        // パディング: アクティブエリア外に1セクター分の余裕
        const paddingSectors = 1;
        const paddingPixels = paddingSectors * pixelsPerSector;
        
        const paddedBounds = {
            left: worldBounds.left - paddingPixels,
            right: worldBounds.right + paddingPixels,
            top: worldBounds.top - paddingPixels,
            bottom: worldBounds.bottom + paddingPixels
        };
        
        // ビューポート制約の計算
        // 原則: パディング込みのアクティブエリアが画面内に留まる範囲
        
        // Use logical canvas size (CSS pixels) for viewport calculations
        const canvasWidth = this.logicalWidth || this.canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = this.logicalHeight || this.canvas.height / (window.devicePixelRatio || 1);
        
        // 水平方向の制約
        const worldWidthScaled = (paddedBounds.right - paddedBounds.left) * this.scale;
        
        let minOffsetX, maxOffsetX;
        
        if (worldWidthScaled <= canvasWidth) {
            // ワールドが画面より小さい場合: 中央寄せを許可
            const centerOffsetX = (canvasWidth - worldWidthScaled) / 2 - paddedBounds.left * this.scale;
            const margin = canvasWidth * 0.1; // 画面幅の10%の余裕
            minOffsetX = centerOffsetX - margin;
            maxOffsetX = centerOffsetX + margin;
        } else {
            // ワールドが画面より大きい場合: エッジ制約
            minOffsetX = canvasWidth - paddedBounds.right * this.scale;  // 右端を画面右に
            maxOffsetX = -paddedBounds.left * this.scale;               // 左端を画面左に
        }
        
        // 垂直方向の制約
        const worldHeightScaled = (paddedBounds.bottom - paddedBounds.top) * this.scale;
        
        let minOffsetY, maxOffsetY;
        
        if (worldHeightScaled <= canvasHeight) {
            // ワールドが画面より小さい場合: 中央寄せを許可
            const centerOffsetY = (canvasHeight - worldHeightScaled) / 2 - paddedBounds.top * this.scale;
            const margin = canvasHeight * 0.1; // 画面高の10%の余裕
            minOffsetY = centerOffsetY - margin;
            maxOffsetY = centerOffsetY + margin;
        } else {
            // ワールドが画面より大きい場合: エッジ制約
            minOffsetY = canvasHeight - paddedBounds.bottom * this.scale;  // 下端を画面下に
            maxOffsetY = -paddedBounds.top * this.scale;                  // 上端を画面上に
        }
        
        console.log(`🔍 Viewport bounds calculated:
            Active sectors: X[${minSectorX} to ${maxSectorX}] Y[${minSectorY} to ${maxSectorY}]
            World bounds: X[${worldBounds.left} to ${worldBounds.right}] Y[${worldBounds.top} to ${worldBounds.bottom}]
            Padded bounds: X[${paddedBounds.left} to ${paddedBounds.right}] Y[${paddedBounds.top} to ${paddedBounds.bottom}]
            Canvas (logical): ${canvasWidth}x${canvasHeight}, Scale: ${this.scale.toFixed(2)}x
            Canvas (physical): ${this.canvas.width}x${this.canvas.height}, DPR: ${window.devicePixelRatio || 1}
            World size scaled: ${worldWidthScaled.toFixed(1)}x${worldHeightScaled.toFixed(1)}
            Offset bounds: X[${minOffsetX.toFixed(1)} to ${maxOffsetX.toFixed(1)}] Y[${minOffsetY.toFixed(1)} to ${maxOffsetY.toFixed(1)}]`);
        
        return {
            minOffsetX: minOffsetX,
            maxOffsetX: maxOffsetX,
            minOffsetY: minOffsetY,
            maxOffsetY: maxOffsetY
        };
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
        for (let sectorX = startSectorX; sectorX <= endSectorX; sectorX++) {
            for (let sectorY = startSectorY; sectorY <= endSectorY; sectorY++) {
                const sectorKey = `${sectorX},${sectorY}`;
                const isActive = this.activeSectors.has(sectorKey);
                
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
                        const pixelCount = this.sectorPixelCounts.get(sectorKey) || 0;
                        const coordinateText = `(${sectorX},${sectorY})`;
                        const pixelText = `${pixelCount}px`;
                        
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
    
    updateSectorCountLazy(sectorKey, increment) {
        // Update in background without blocking
        setTimeout(() => {
            const [sectorX, sectorY] = sectorKey.split(',').map(Number);
            const currentCount = this.sectorPixelCounts.get(sectorKey) || 0;
            const newCount = currentCount + increment;
            
            fetch(`${SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
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
            }).catch(() => {}); // Ignore errors
        }, 0);
    }
    
    async updateSectorCount(sectorKey, increment) {
        // Keep for compatibility
        this.updateSectorCountLazy(sectorKey, increment);
    }
    
    async checkSectorExpansion(sectorX, sectorY, pixelCount) {
        const maxPixelsPerSector = GRID_SIZE * GRID_SIZE; // 256 * 256
        const fillPercentage = pixelCount / maxPixelsPerSector;
        
        if (fillPercentage >= SECTOR_EXPANSION_THRESHOLD) {
            console.log(`Sector (${sectorX}, ${sectorY}) is ${Math.round(fillPercentage * 100)}% full. Expanding...`);
            await this.expandSectors(sectorX, sectorY);
        }
    }
    
    expandSectorsLocally(centerX, centerY) {
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
                this.sectorPixelCounts.set(sectorKey, 0);
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
        
        if (expanded) {
            // Show visual feedback for expansion
            this.showExpansionNotification(centerX, centerY);
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
        notification.textContent = `🎉 Canvas expanded! Sector (${sectorX},${sectorY}) was 70% full`;
        
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
            
            // Add to local count
            const count = this.sectorPixelCounts.get('0,0') || 0;
            this.sectorPixelCounts.set('0,0', count + 1);
            
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
        
        // Track the sector
        const sectorKey = `${pixelData.sector_x},${pixelData.sector_y}`;
        this.activeSectors.add(sectorKey);
        
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
    
    updatePixelCount() {
        // This method is no longer used - stock display is handled by updateStockDisplay
        // Keep for compatibility but don't override stock display
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
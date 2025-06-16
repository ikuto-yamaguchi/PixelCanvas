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
        this.lastDrawTime = 0;
        
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
        let lastTap = 0;
        let touches = [];
        let initialDistance = 0;
        let initialScale = 1;
        let initialOffsetX = 0;
        let initialOffsetY = 0;
        let isGestureInProgress = false;
        
        // Grid toggle
        this.gridToggle.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            this.gridToggle.classList.toggle('active', this.showGrid);
            this.render();
        });
        
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
        
        const getCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches[0].clientX) - rect.left;
            const y = (e.clientY || e.touches[0].clientY) - rect.top;
            return { x, y };
        };
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touches = Array.from(e.touches);
            
            if (touches.length === 1) {
                // Single touch - potential tap or pan
                const coords = getCoords(e);
                initialOffsetX = this.offsetX;
                initialOffsetY = this.offsetY;
                touches[0].startX = coords.x;
                touches[0].startY = coords.y;
                isGestureInProgress = false;
            } else if (touches.length === 2) {
                // Two fingers - pinch zoom
                isGestureInProgress = true;
                initialDistance = getDistance(touches[0], touches[1]);
                initialScale = this.scale;
                const center = getCenter(touches[0], touches[1]);
                initialOffsetX = this.offsetX;
                initialOffsetY = this.offsetY;
                touches.centerX = center.x;
                touches.centerY = center.y;
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            touches = Array.from(e.touches);
            
            if (touches.length === 1 && !isGestureInProgress) {
                // Single finger pan
                const coords = getCoords(e);
                const dx = coords.x - touches[0].startX;
                const dy = coords.y - touches[0].startY;
                
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    this.offsetX = initialOffsetX + dx;
                    this.offsetY = initialOffsetY + dy;
                    this.render();
                    isGestureInProgress = true;
                }
            } else if (touches.length === 2) {
                // Pinch zoom
                const distance = getDistance(touches[0], touches[1]);
                const scale = (distance / initialDistance) * initialScale;
                const newScale = Math.max(0.5, Math.min(16, scale));
                
                const center = getCenter(touches[0], touches[1]);
                const scaleFactor = newScale / this.scale;
                
                this.offsetX = center.x - (center.x - initialOffsetX) * scaleFactor;
                this.offsetY = center.y - (center.y - initialOffsetY) * scaleFactor;
                this.scale = newScale;
                
                this.render();
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            if (touches.length === 1 && !isGestureInProgress) {
                // Single tap - draw pixel
                const now = Date.now();
                const tapTime = now - lastTap;
                
                if (tapTime < 300 && tapTime > 0) {
                    // Double tap detected - ignore
                    lastTap = 0;
                    return;
                }
                
                lastTap = now;
                setTimeout(() => {
                    if (lastTap === now) {
                        // Single tap confirmed
                        this.handlePixelClick(touches[0].startX, touches[0].startY);
                    }
                }, 300);
            }
            
            isGestureInProgress = false;
            touches = Array.from(e.touches);
        });
        
        // Mouse events for desktop
        let mouseDown = false;
        let startX = 0;
        let startY = 0;
        
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            mouseDown = true;
            const coords = getCoords(e);
            startX = coords.x;
            startY = coords.y;
            initialOffsetX = this.offsetX;
            initialOffsetY = this.offsetY;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            if (!mouseDown) return;
            
            const coords = getCoords(e);
            const dx = coords.x - startX;
            const dy = coords.y - startY;
            
            this.offsetX = initialOffsetX + dx;
            this.offsetY = initialOffsetY + dy;
            this.render();
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            e.preventDefault();
            if (!mouseDown) return;
            
            const coords = getCoords(e);
            const dx = coords.x - startX;
            const dy = coords.y - startY;
            
            // If very small movement, treat as click
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
                this.handlePixelClick(startX, startY);
            }
            
            mouseDown = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            mouseDown = false;
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
    
    handlePixelClick(x, y) {
        const now = Date.now();
        if (now - this.lastDrawTime < RATE_LIMIT_MS) {
            this.showCooldown();
            return;
        }
        
        const worldX = Math.floor((x - this.offsetX) / (PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (PIXEL_SIZE * this.scale));
        
        const sectorX = Math.floor(worldX / GRID_SIZE);
        const sectorY = Math.floor(worldY / GRID_SIZE);
        const localX = ((worldX % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        const localY = ((worldY % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
        
        this.drawPixel(sectorX, sectorY, localX, localY, this.currentColor);
        this.lastDrawTime = now;
        this.showCooldown();
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
        
        // Update pixel count display
        this.updatePixelCount();
        
        // Force a complete re-render to ensure pixel is drawn
        this.render();
        
        const pixel = { s: `${sectorX},${sectorY}`, x, y, c: color };
        this.pendingPixels.push(pixel);
        
        if (navigator.onLine) {
            this.sendPixel(pixel);
        } else {
            this.queuePixel(pixel);
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
            await fetch('/api/draw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pixel)
            });
        } catch (error) {
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
        
        // Load saved pixels from localStorage
        const savedPixels = JSON.parse(localStorage.getItem('pixelcanvas_pixels') || '{}');
        for (const [key, color] of Object.entries(savedPixels)) {
            this.pixels.set(key, color);
        }
        
        console.log(`Loaded ${this.pixels.size} pixels from localStorage`);
        
        this.updatePixelCount();
        this.render();
        this.updateStatus(navigator.onLine);
        
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
    
    showCooldown() {
        this.cooldownIndicator.classList.add('active');
        setTimeout(() => {
            this.cooldownIndicator.classList.remove('active');
        }, RATE_LIMIT_MS);
    }
    
    updatePixelCount() {
        this.pixelCount.textContent = `${this.pixels.size}px`;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PixelCanvas());
} else {
    new PixelCanvas();
}
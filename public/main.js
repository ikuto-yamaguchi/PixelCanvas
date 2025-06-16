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
        let isDrawing = false;
        let isPanning = false;
        let startX = 0;
        let startY = 0;
        let initialOffsetX = 0;
        let initialOffsetY = 0;
        
        // Grid toggle
        this.gridToggle.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            this.gridToggle.classList.toggle('active', this.showGrid);
            this.render();
        });
        
        const getCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
            const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
            return { x, y };
        };
        
        const handleStart = (e) => {
            e.preventDefault();
            const coords = getCoords(e);
            startX = coords.x;
            startY = coords.y;
            initialOffsetX = this.offsetX;
            initialOffsetY = this.offsetY;
            isDrawing = true;
            isPanning = false;
        };
        
        const handleMove = (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            
            const coords = getCoords(e);
            const dx = coords.x - startX;
            const dy = coords.y - startY;
            
            // If moved more than 10px, switch to panning mode
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                isPanning = true;
                this.offsetX = initialOffsetX + dx;
                this.offsetY = initialOffsetY + dy;
                this.render();
            }
        };
        
        const handleEnd = (e) => {
            e.preventDefault();
            if (isDrawing && !isPanning) {
                // Only draw pixel if we didn't pan
                this.handlePixelClick(startX, startY);
            }
            isDrawing = false;
            isPanning = false;
        };
        
        // Mouse events
        this.canvas.addEventListener('mousedown', handleStart);
        this.canvas.addEventListener('mousemove', handleMove);
        this.canvas.addEventListener('mouseup', handleEnd);
        this.canvas.addEventListener('mouseleave', handleEnd);
        
        // Touch events
        this.canvas.addEventListener('touchstart', handleStart);
        this.canvas.addEventListener('touchmove', handleMove);
        this.canvas.addEventListener('touchend', handleEnd);
        
        // Zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.5, Math.min(8, this.scale * delta));
            
            // Zoom towards mouse position
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
        
        // Store pixel
        this.pixels.set(pixelKey, color);
        
        // Render immediately
        this.renderPixel(worldX, worldY, color);
        
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
        this.ctx.lineWidth = 0.3;
        
        const pixelSize = PIXEL_SIZE * this.scale;
        
        // Only show pixel grid when zoomed in enough
        if (pixelSize >= 2) {
            const startX = Math.floor(-this.offsetX / pixelSize) * pixelSize + this.offsetX;
            const startY = Math.floor(-this.offsetY / pixelSize) * pixelSize + this.offsetY;
            
            // Vertical lines
            for (let x = startX; x < this.canvas.width; x += pixelSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
            
            // Horizontal lines
            for (let y = startY; y < this.canvas.height; y += pixelSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        }
        
        // Sector grid (thicker lines)
        if (this.scale >= 0.1) {
            this.ctx.strokeStyle = gridColor;
            this.ctx.lineWidth = 1;
            const sectorSize = GRID_SIZE * PIXEL_SIZE * this.scale;
            const startX = Math.floor(-this.offsetX / sectorSize) * sectorSize + this.offsetX;
            const startY = Math.floor(-this.offsetY / sectorSize) * sectorSize + this.offsetY;
            
            for (let x = startX; x < this.canvas.width; x += sectorSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
            
            for (let y = startY; y < this.canvas.height; y += sectorSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PixelCanvas());
} else {
    new PixelCanvas();
}
// PixelCanvas Main Application
const GRID_SIZE = 256;
const PIXEL_SIZE = 2;
const COLORS = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00',
    '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#800000', '#008000', '#000080', '#808000',
    '#800080', '#008080', '#C0C0C0', '#808080'
];

class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.container = document.getElementById('canvasContainer');
        this.colorPalette = document.getElementById('colorPalette');
        this.statusIndicator = document.getElementById('status');
        
        this.currentColor = 0;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.sectors = new Map();
        this.pendingPixels = [];
        
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
        let lastX = 0;
        let lastY = 0;
        let lastDrawTime = 0;
        
        const getCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches[0].clientX) - rect.left;
            const y = (e.clientY || e.touches[0].clientY) - rect.top;
            return { x, y };
        };
        
        const handleStart = (e) => {
            e.preventDefault();
            isDrawing = true;
            const coords = getCoords(e);
            lastX = coords.x;
            lastY = coords.y;
            this.handlePixelClick(coords.x, coords.y);
        };
        
        const handleMove = (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            
            const coords = getCoords(e);
            const dx = coords.x - lastX;
            const dy = coords.y - lastY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                isDrawing = false;
                this.offsetX += dx;
                this.offsetY += dy;
                lastX = coords.x;
                lastY = coords.y;
                this.render();
            }
        };
        
        const handleEnd = (e) => {
            e.preventDefault();
            isDrawing = false;
        };
        
        this.canvas.addEventListener('mousedown', handleStart);
        this.canvas.addEventListener('mousemove', handleMove);
        this.canvas.addEventListener('mouseup', handleEnd);
        this.canvas.addEventListener('mouseleave', handleEnd);
        
        this.canvas.addEventListener('touchstart', handleStart);
        this.canvas.addEventListener('touchmove', handleMove);
        this.canvas.addEventListener('touchend', handleEnd);
        
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.scale = Math.max(0.5, Math.min(10, this.scale * delta));
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
        if (now - this.lastDrawTime < 1000) return;
        
        const worldX = Math.floor((x - this.offsetX) / (PIXEL_SIZE * this.scale));
        const worldY = Math.floor((y - this.offsetY) / (PIXEL_SIZE * this.scale));
        
        const sectorX = Math.floor(worldX / GRID_SIZE);
        const sectorY = Math.floor(worldY / GRID_SIZE);
        const localX = worldX % GRID_SIZE;
        const localY = worldY % GRID_SIZE;
        
        this.drawPixel(sectorX, sectorY, localX, localY, this.currentColor);
        this.lastDrawTime = now;
    }
    
    drawPixel(sectorX, sectorY, x, y, color) {
        const pixel = { s: `${sectorX},${sectorY}`, x, y, c: color };
        this.pendingPixels.push(pixel);
        
        this.renderPixel(sectorX * GRID_SIZE + x, sectorY * GRID_SIZE + y, color);
        
        if (navigator.onLine) {
            this.sendPixel(pixel);
        } else {
            this.queuePixel(pixel);
        }
    }
    
    renderPixel(worldX, worldY, colorIndex) {
        const x = worldX * PIXEL_SIZE * this.scale + this.offsetX;
        const y = worldY * PIXEL_SIZE * this.scale + this.offsetY;
        
        this.ctx.fillStyle = COLORS[colorIndex];
        this.ctx.fillRect(x, y, PIXEL_SIZE * this.scale, PIXEL_SIZE * this.scale);
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
        this.renderGrid();
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
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.renderGrid();
        
        for (const [key, sector] of this.sectors) {
            this.renderSector(sector);
        }
    }
    
    renderGrid() {
        this.ctx.strokeStyle = '#2a2a2a';
        this.ctx.lineWidth = 0.5;
        
        const gridSize = GRID_SIZE * PIXEL_SIZE * this.scale;
        const startX = Math.floor(-this.offsetX / gridSize) * gridSize + this.offsetX;
        const startY = Math.floor(-this.offsetY / gridSize) * gridSize + this.offsetY;
        
        for (let x = startX; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = startY; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    renderSector(sector) {
        // Placeholder for sector rendering
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PixelCanvas());
} else {
    new PixelCanvas();
}
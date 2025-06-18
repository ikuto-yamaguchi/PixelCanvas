// Rendering engine for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class RenderEngine {
    constructor(canvas, ctx, pixelCanvas) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.pixelCanvas = pixelCanvas;
        this.remotePixelsBuffer = new Map();
        this.renderTimeout = null;
    }
    
    render() {
        // Clear with canvas background color
        this.ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-canvas-bg').trim() || '#404040';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render grid if enabled
        if (this.pixelCanvas.showGrid) {
            this.renderGrid();
        }
        
        // Render all pixels
        this.renderPixels();
        
        // Render active sector boundaries
        this.renderActiveSectorBounds();
    }
    
    renderGrid() {
        const gridColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-grid').trim() || '#606060';
        this.ctx.strokeStyle = gridColor;
        
        const pixelSize = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        
        // Always show pixel grid
        this.ctx.lineWidth = Math.max(0.1, 0.5 / this.pixelCanvas.scale);
        
        const startX = Math.floor(-this.pixelCanvas.offsetX / pixelSize) * pixelSize + this.pixelCanvas.offsetX;
        const startY = Math.floor(-this.pixelCanvas.offsetY / pixelSize) * pixelSize + this.pixelCanvas.offsetY;
        
        // Limit grid density to prevent performance issues
        const stepX = Math.max(pixelSize, this.canvas.width / CONFIG.MAX_GRID_LINES);
        const stepY = Math.max(pixelSize, this.canvas.height / CONFIG.MAX_GRID_LINES);
        
        this.renderGridLines(startX, startY, stepX, stepY);
        this.renderSectorGrid(pixelSize);
    }
    
    renderGridLines(startX, startY, stepX, stepY) {
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
    }
    
    renderSectorGrid(pixelSize) {
        // Sector grid (thicker lines) - only when zoomed out enough
        if (this.pixelCanvas.scale <= 2) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = Math.max(1, 2 / this.pixelCanvas.scale);
            const sectorSize = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
            
            if (sectorSize >= 50) { // Only show sector grid when sectors are large enough
                const startX = Math.floor(-this.pixelCanvas.offsetX / sectorSize) * sectorSize + this.pixelCanvas.offsetX;
                const startY = Math.floor(-this.pixelCanvas.offsetY / sectorSize) * sectorSize + this.pixelCanvas.offsetY;
                
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
        for (const [key, color] of this.pixelCanvas.pixels) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            this.renderPixel(world.x, world.y, color);
        }
    }
    
    renderPixel(worldX, worldY, colorIndex) {
        const screenX = worldX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
        const screenY = worldY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
        const size = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        
        // Only render if visible on screen (with small margin)
        if (screenX + size >= -10 && screenX <= this.canvas.width + 10 &&
            screenY + size >= -10 && screenY <= this.canvas.height + 10) {
            
            this.ctx.fillStyle = CONFIG.COLORS[colorIndex] || '#000000';
            this.ctx.fillRect(Math.floor(screenX), Math.floor(screenY), Math.ceil(size), Math.ceil(size));
        }
    }
    
    renderActiveSectorBounds() {
        const sectorSize = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        
        // Only show visual bounds when sectors are large enough to see
        if (sectorSize < 30) return;
        
        // Calculate visible sector range
        const startSectorX = Math.floor(-this.pixelCanvas.offsetX / sectorSize);
        const endSectorX = Math.ceil((this.canvas.width - this.pixelCanvas.offsetX) / sectorSize);
        const startSectorY = Math.floor(-this.pixelCanvas.offsetY / sectorSize);
        const endSectorY = Math.ceil((this.canvas.height - this.pixelCanvas.offsetY) / sectorSize);
        
        // Draw each visible sector using database state
        for (let sectorX = startSectorX; sectorX <= endSectorX; sectorX++) {
            for (let sectorY = startSectorY; sectorY <= endSectorY; sectorY++) {
                const sectorKey = `${sectorX},${sectorY}`;
                const sectorState = this.pixelCanvas.sectorManager.getSectorState(sectorKey);
                
                // Calculate screen position of sector
                const screenX = this.pixelCanvas.offsetX + sectorX * sectorSize;
                const screenY = this.pixelCanvas.offsetY + sectorY * sectorSize;
                
                // Only render if visible on screen
                if (this.isSectorVisible(screenX, screenY, sectorSize)) {
                    if (sectorState.isActive) {
                        this.renderActiveSectorBounds_Active(screenX, screenY, sectorSize, sectorX, sectorY, sectorState.pixelCount);
                    } else if (sectorState.pixelCount > 0) {
                        this.renderActiveSectorBounds_Inactive(screenX, screenY, sectorSize, sectorX, sectorY, sectorState.pixelCount);
                    }
                }
            }
        }
        
        // Reset line dash for other drawing
        this.ctx.setLineDash([]);
    }
    
    isSectorVisible(screenX, screenY, sectorSize) {
        return screenX + sectorSize >= 0 && screenX <= this.canvas.width &&
               screenY + sectorSize >= 0 && screenY <= this.canvas.height;
    }
    
    renderActiveSectorBounds_Active(screenX, screenY, sectorSize, sectorX, sectorY, pixelCount = 0) {
        // Active sector: bright green border
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = Math.max(1, Math.min(3, 2 / this.pixelCanvas.scale));
        this.ctx.setLineDash([]);
        
        this.ctx.strokeRect(screenX, screenY, sectorSize, sectorSize);
        
        // Show sector info when zoomed in enough and text fits
        if (sectorSize > 80) {
            
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
    }
    
    renderActiveSectorBounds_Inactive(screenX, screenY, sectorSize, sectorX, sectorY, pixelCount = 0) {
        // Inactive sector: dim overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(screenX, screenY, sectorSize, sectorSize);
        
        // Red dashed border
        this.ctx.strokeStyle = '#ff4444';
        this.ctx.lineWidth = Math.max(0.5, Math.min(2, 1.5 / this.pixelCanvas.scale));
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
    
    // Handle remote pixels with batched rendering
    addRemotePixel(pixelData) {
        const key = Utils.createPixelKey(
            pixelData.sector_x, 
            pixelData.sector_y, 
            pixelData.local_x, 
            pixelData.local_y
        );
        
        // Add to remote pixels buffer for batched rendering
        this.remotePixelsBuffer.set(key, pixelData.color);
        
        // Also add to main pixels map for persistence
        this.pixelCanvas.pixels.set(key, pixelData.color);
        
        // Batch render for performance
        if (!this.renderTimeout) {
            this.renderTimeout = setTimeout(() => {
                this.renderRemotePixels();
                this.renderTimeout = null;
            }, CONFIG.RENDER_BATCH_MS);
        }
        
        console.log(`📡 Received remote pixel: ${key} = color ${pixelData.color}`);
    }
    
    renderRemotePixels() {
        if (this.remotePixelsBuffer.size === 0) return;
        
        console.log(`🎨 Rendering ${this.remotePixelsBuffer.size} remote pixels`);
        
        // Render each buffered remote pixel
        for (const [key, color] of this.remotePixelsBuffer) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            this.renderPixel(world.x, world.y, color);
        }
        
        // Clear the buffer
        this.remotePixelsBuffer.clear();
        
        console.log('✅ Remote pixels rendered and buffer cleared');
    }
    
    // Setup color palette UI
    setupColorPalette() {
        const colorPalette = document.getElementById('colorPalette');
        if (!colorPalette) return;
        
        colorPalette.innerHTML = '';
        
        CONFIG.COLORS.forEach((color, index) => {
            const colorButton = document.createElement('button');
            colorButton.className = 'color-button';
            colorButton.style.backgroundColor = color;
            colorButton.title = `Color ${index + 1}: ${color}`;
            
            if (index === this.pixelCanvas.currentColor) {
                colorButton.classList.add('active');
            }
            
            colorButton.addEventListener('click', () => {
                // Remove active class from all buttons
                colorPalette.querySelectorAll('.color-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Add active class to clicked button
                colorButton.classList.add('active');
                this.pixelCanvas.currentColor = index;
                
                console.log(`🎨 Selected color ${index}: ${color}`);
            });
            
            colorPalette.appendChild(colorButton);
        });
    }
}
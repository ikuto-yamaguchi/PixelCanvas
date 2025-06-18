// Rendering engine for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class RenderEngine {
    constructor(canvas, ctx, pixelCanvas) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.pixelCanvas = pixelCanvas;
        this.remotePixelsBuffer = new Map();
        this.renderTimeout = null;
        
        // Spatial partitioning system for performance
        this.TILE_SIZE = 16; // 16x16 pixel tiles
        this.tileCache = new Map(); // Cached rendered tiles
        this.visibleTiles = new Set(); // Currently visible tiles
        this.renderMode = 'optimized'; // 'legacy' or 'optimized'
        
        // Performance monitoring
        this.performanceStats = {
            frameCount: 0,
            tilesRendered: 0,
            pixelsRendered: 0,
            averageFPS: 60,
            lastFrameTime: performance.now()
        };
    }
    
    render() {
        const startTime = performance.now();
        
        // Clear with canvas background color
        this.ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-canvas-bg').trim() || '#404040';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render grid if enabled
        if (this.pixelCanvas.showGrid) {
            this.renderGrid();
        }
        
        // Use optimized tile-based rendering
        if (this.renderMode === 'optimized') {
            this.renderPixelsTiled();
        } else {
            this.renderPixelsLegacy();
        }
        
        // Render active sector boundaries
        this.renderActiveSectorBounds();
        
        // Update performance stats
        this.updatePerformanceStats(startTime);
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
    
    renderPixelsTiled() {
        // Step 1: Calculate visible tile range
        const visibleTileRange = this.calculateVisibleTileRange();
        const tilesRendered = [];
        
        // Step 2: Process only visible tiles
        for (let tileX = visibleTileRange.minX; tileX <= visibleTileRange.maxX; tileX++) {
            for (let tileY = visibleTileRange.minY; tileY <= visibleTileRange.maxY; tileY++) {
                const tileKey = `${tileX},${tileY}`;
                
                // Check if tile has pixels and needs rendering
                const tilePixels = this.getPixelsInTile(tileX, tileY);
                if (tilePixels.length > 0) {
                    this.renderTile(tileX, tileY, tilePixels);
                    tilesRendered.push(tileKey);
                }
            }
        }
        
        this.performanceStats.tilesRendered = tilesRendered.length;
        this.visibleTiles = new Set(tilesRendered);
    }
    
    renderPixelsLegacy() {
        // Simplified legacy rendering with basic viewport culling
        const visibleBounds = this.calculateSimpleVisibleBounds();
        let pixelsRendered = 0;
        
        for (const [key, color] of this.pixelCanvas.pixels) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            
            if (this.isPixelInBounds(world.x, world.y, visibleBounds)) {
                this.renderPixel(world.x, world.y, color);
                pixelsRendered++;
            }
        }
        
        this.performanceStats.pixelsRendered = pixelsRendered;
    }
    
    // Legacy methods removed - using clean tile-based or simple rendering
    
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
        if (sectorSize < 20) return;
        
        // Calculate visible sector range
        const startSectorX = Math.floor(-this.pixelCanvas.offsetX / sectorSize);
        const endSectorX = Math.ceil((this.canvas.width - this.pixelCanvas.offsetX) / sectorSize);
        const startSectorY = Math.floor(-this.pixelCanvas.offsetY / sectorSize);
        const endSectorY = Math.ceil((this.canvas.height - this.pixelCanvas.offsetY) / sectorSize);
        
        // Draw each visible sector using hybrid DB + client state
        for (let sectorX = startSectorX; sectorX <= endSectorX; sectorX++) {
            for (let sectorY = startSectorY; sectorY <= endSectorY; sectorY++) {
                const sectorKey = `${sectorX},${sectorY}`;
                const sectorState = this.pixelCanvas.sectorManager.getSectorState(sectorKey);
                
                // Count actual pixels in this sector (for accurate display)
                let actualPixelCount = 0;
                for (const [key, color] of this.pixelCanvas.pixels) {
                    const [pSectorX, pSectorY] = key.split(',').map(Number);
                    if (pSectorX === sectorX && pSectorY === sectorY) {
                        actualPixelCount++;
                    }
                }
                
                // Calculate screen position of sector
                const screenX = this.pixelCanvas.offsetX + sectorX * sectorSize;
                const screenY = this.pixelCanvas.offsetY + sectorY * sectorSize;
                
                // Only render if visible on screen
                if (this.isSectorVisible(screenX, screenY, sectorSize)) {
                    // Hybrid logic: use DB state when available, fallback to client state
                    const isActiveFromDB = sectorState.isActive;
                    const isActiveFromClient = this.pixelCanvas.activeSectors.has(sectorKey);
                    const isActive = isActiveFromDB || isActiveFromClient;
                    
                    if (isActive && this.pixelCanvas.showGrid) {
                        // Active sector - can draw here (green border) - only when grid is shown
                        this.renderActiveSectorBounds_Active(screenX, screenY, sectorSize, sectorX, sectorY, actualPixelCount);
                    } else if (!isActive) {
                        // Inactive sector - LOCKED (red border, dark overlay) - always show
                        this.renderActiveSectorBounds_Inactive(screenX, screenY, sectorSize, sectorX, sectorY, actualPixelCount);
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
        if (sectorSize > 60) {
            
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
        if (sectorSize > 40) {
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
    
    // Tile-based rendering helper methods
    calculateVisibleTileRange() {
        const pixelSize = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        const tileWorldSize = this.TILE_SIZE; // tiles are in world coordinates
        
        const minWorldX = Math.floor(-this.pixelCanvas.offsetX / pixelSize);
        const maxWorldX = Math.ceil((this.canvas.width - this.pixelCanvas.offsetX) / pixelSize);
        const minWorldY = Math.floor(-this.pixelCanvas.offsetY / pixelSize);
        const maxWorldY = Math.ceil((this.canvas.height - this.pixelCanvas.offsetY) / pixelSize);
        
        return {
            minX: Math.floor(minWorldX / tileWorldSize),
            maxX: Math.floor(maxWorldX / tileWorldSize),
            minY: Math.floor(minWorldY / tileWorldSize),
            maxY: Math.floor(maxWorldY / tileWorldSize)
        };
    }
    
    getPixelsInTile(tileX, tileY) {
        const tilePixels = [];
        const minWorldX = tileX * this.TILE_SIZE;
        const maxWorldX = minWorldX + this.TILE_SIZE - 1;
        const minWorldY = tileY * this.TILE_SIZE;
        const maxWorldY = minWorldY + this.TILE_SIZE - 1;
        
        for (const [key, color] of this.pixelCanvas.pixels) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            
            if (world.x >= minWorldX && world.x <= maxWorldX &&
                world.y >= minWorldY && world.y <= maxWorldY) {
                tilePixels.push({ world, color, key });
            }
        }
        
        return tilePixels;
    }
    
    renderTile(tileX, tileY, tilePixels) {
        // Use ImageData for efficient batch rendering of tile
        const pixelSize = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        const tileScreenSize = this.TILE_SIZE * pixelSize;
        
        // Calculate tile position on screen
        const tileScreenX = tileX * tileScreenSize + this.pixelCanvas.offsetX;
        const tileScreenY = tileY * tileScreenSize + this.pixelCanvas.offsetY;
        
        // Only render if tile is visible on screen
        if (tileScreenX + tileScreenSize < 0 || tileScreenX > this.canvas.width ||
            tileScreenY + tileScreenSize < 0 || tileScreenY > this.canvas.height) {
            return;
        }
        
        // Render each pixel in the tile
        for (const { world, color } of tilePixels) {
            this.renderPixel(world.x, world.y, color);
        }
    }
    
    calculateSimpleVisibleBounds() {
        const pixelSize = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        const margin = 10;
        
        return {
            minX: Math.floor((-this.pixelCanvas.offsetX - margin) / pixelSize),
            maxX: Math.ceil((this.canvas.width - this.pixelCanvas.offsetX + margin) / pixelSize),
            minY: Math.floor((-this.pixelCanvas.offsetY - margin) / pixelSize),
            maxY: Math.ceil((this.canvas.height - this.pixelCanvas.offsetY + margin) / pixelSize)
        };
    }
    
    isPixelInBounds(worldX, worldY, bounds) {
        return worldX >= bounds.minX && worldX <= bounds.maxX &&
               worldY >= bounds.minY && worldY <= bounds.maxY;
    }
    
    // Deprecated methods removed for cleaner codebase
    
    updatePerformanceStats(startTime) {
        const frameTime = performance.now() - startTime;
        this.performanceStats.frameCount++;
        
        // Calculate FPS every 60 frames
        if (this.performanceStats.frameCount % 60 === 0) {
            const currentTime = performance.now();
            const timeDiff = currentTime - this.performanceStats.lastFrameTime;
            this.performanceStats.averageFPS = 60000 / timeDiff;
            this.performanceStats.lastFrameTime = currentTime;
            
            // Log performance info periodically
            if (this.performanceStats.frameCount % 300 === 0) { // Every 5 seconds at 60fps
                console.log(`🎯 Performance: ${this.performanceStats.averageFPS.toFixed(1)} FPS, ${this.performanceStats.tilesRendered} tiles, Mode: ${this.renderMode}`);
            }
        }
    }
    
    // Clean performance control API
    setRenderMode(mode) {
        if (mode === 'optimized' || mode === 'legacy') {
            this.renderMode = mode;
            console.log(`🎯 Render mode: ${mode.toUpperCase()}`);
            return mode;
        }
        return this.renderMode;
    }
    
    toggleRenderMode() {
        const newMode = this.renderMode === 'optimized' ? 'legacy' : 'optimized';
        return this.setRenderMode(newMode);
    }
    
    getPerformanceStats() {
        return {
            ...this.performanceStats,
            renderMode: this.renderMode,
            totalPixelCount: this.pixelCanvas.pixels.size,
            visibleTileCount: this.visibleTiles.size,
            renderEfficiency: this.calculateRenderEfficiency()
        };
    }
    
    calculateRenderEfficiency() {
        const totalPixels = this.pixelCanvas.pixels.size;
        const renderedPixels = this.performanceStats.pixelsRendered || 0;
        const tilesRendered = this.performanceStats.tilesRendered || 0;
        
        if (totalPixels === 0) return 1;
        
        // For tile-based rendering, efficiency is based on tiles vs total pixels
        if (this.renderMode === 'optimized') {
            const estimatedPixelsInTiles = tilesRendered * (this.TILE_SIZE * this.TILE_SIZE);
            return Math.max(0, 1 - estimatedPixelsInTiles / totalPixels);
        } else {
            return Math.max(0, 1 - renderedPixels / totalPixels);
        }
    }
    
    // Simple benchmark
    benchmark(seconds = 3) {
        console.log(`🏁 Starting ${seconds}s performance benchmark...`);
        
        const originalMode = this.renderMode;
        const modes = ['legacy', 'optimized'];
        const results = {};
        
        let modeIndex = 0;
        const testMode = () => {
            if (modeIndex >= modes.length) {
                this.setRenderMode(originalMode);
                console.log('📊 Benchmark Results:', results);
                return;
            }
            
            const mode = modes[modeIndex];
            this.setRenderMode(mode);
            
            const startTime = performance.now();
            let frameCount = 0;
            
            const testFrame = () => {
                this.render();
                frameCount++;
                
                if (performance.now() - startTime < seconds * 1000) {
                    requestAnimationFrame(testFrame);
                } else {
                    const avgFPS = frameCount / seconds;
                    results[mode] = `${avgFPS.toFixed(1)} FPS`;
                    
                    console.log(`✅ ${mode}: ${avgFPS.toFixed(1)} FPS`);
                    modeIndex++;
                    setTimeout(testMode, 500);
                }
            };
            
            requestAnimationFrame(testFrame);
        };
        
        testMode();
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
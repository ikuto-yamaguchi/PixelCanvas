// Ultra Fast Rendering Engine
// Target: 60fps with intelligent LOD + dirty region rendering

import { CONFIG } from './Config.js';

export class UltraFastRenderer {
    constructor(canvas, pixelStorage) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pixelStorage = pixelStorage;
        
        // Performance settings
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        this.lastRenderTime = 0;
        
        // LOD thresholds (scale values)
        this.lodThresholds = [8, 4, 2, 1, 0.5, 0.25];
        this.currentLOD = 0;
        
        // Canvas state
        this.width = 0;
        this.height = 0;
        this.imageData = null;
        this.data = null;
        
        // Color palette cache
        this.paletteRGBA = this.createPaletteCache();
        
        // Dirty regions for differential rendering
        this.dirtyRegions = new Set();
        
        // Performance stats
        this.stats = {
            frameCount: 0,
            pixelsRendered: 0,
            averageRenderTime: 0,
            averageFPS: 0,
            lodLevel: 0
        };
        
        // Viewport cache
        this.lastViewport = null;
        this.viewportChanged = true;
    }
    
    // Main rendering function (optimized)
    render(viewport, scale) {
        const renderStartTime = performance.now();
        
        // Frame rate limiting
        if (renderStartTime - this.lastRenderTime < this.frameTime) {
            return; // Skip frame to maintain target FPS
        }
        
        try {
            // Viewport change detection
            this.detectViewportChange(viewport);
            
            // Canvas size adjustment
            this.resizeIfNeeded(viewport.width, viewport.height);
            
            // LOD level calculation
            const lodLevel = this.calculateLOD(scale);
            this.currentLOD = lodLevel;
            
            // Adaptive rendering strategy selection
            if (this.viewportChanged) {
                this.renderFullViewport(viewport, scale, lodLevel);
            } else if (this.dirtyRegions.size > 0) {
                this.renderDirtyRegions(viewport, scale, lodLevel);
            }
            
            // Update statistics
            this.updateStats(renderStartTime);
            
            this.lastRenderTime = renderStartTime;
            
        } catch (error) {
            console.error('Render error:', error);
        }
    }
    
    // LOD level calculation (adaptive)
    calculateLOD(scale) {
        for (let i = 0; i < this.lodThresholds.length; i++) {
            if (scale >= this.lodThresholds[i]) {
                return i;
            }
        }
        return this.lodThresholds.length;
    }
    
    // Full viewport rendering
    renderFullViewport(viewport, scale, lodLevel) {
        console.log(`Full render: LOD${lodLevel}, scale: ${scale.toFixed(2)}`);
        
        // Clear background
        this.clearCanvas();
        
        // LOD-based pixel sampling
        const skipFactor = Math.pow(2, lodLevel);
        const maxPixels = this.getMaxPixelsForLOD(lodLevel);
        
        // Get visible pixels within range
        const visiblePixels = this.getVisiblePixels(viewport, scale);
        
        // Sampling + rendering
        this.renderPixelsBatch(visiblePixels, viewport, scale, skipFactor, maxPixels);
        
        this.viewportChanged = false;
        this.stats.pixelsRendered = Math.min(visiblePixels.length, maxPixels);
    }
    
    // Differential region rendering
    renderDirtyRegions(viewport, scale, lodLevel) {
        console.log(`Dirty render: ${this.dirtyRegions.size} regions`);
        
        for (const region of this.dirtyRegions) {
            this.renderRegion(region, viewport, scale, lodLevel);
        }
        
        this.dirtyRegions.clear();
    }
    
    // Ultra-fast pixel batch rendering
    renderPixelsBatch(pixels, viewport, scale, skipFactor, maxPixels) {
        let rendered = 0;
        const pixelSize = Math.max(1, Math.floor(scale));
        
        // Direct ImageData manipulation
        if (!this.data) return;
        
        for (let i = 0; i < pixels.length && rendered < maxPixels; i += skipFactor) {
            const pixel = pixels[i];
            
            // World coordinates to screen coordinates
            const screenX = Math.floor((pixel.worldX * scale) - viewport.x);
            const screenY = Math.floor((pixel.worldY * scale) - viewport.y);
            
            // Boundary check
            if (screenX >= -pixelSize && screenX < this.width + pixelSize && 
                screenY >= -pixelSize && screenY < this.height + pixelSize) {
                
                this.drawPixelFast(screenX, screenY, pixel.color, pixelSize);
                rendered++;
            }
        }
        
        // Batch update
        this.ctx.putImageData(this.imageData, 0, 0);
        
        console.log(`Rendered ${rendered} pixels (skip: ${skipFactor})`);
    }
    
    // Ultra-fast pixel drawing (direct ImageData manipulation)
    drawPixelFast(x, y, colorIndex, size) {
        const color = this.paletteRGBA[colorIndex];
        if (!color) return;
        
        // Draw according to size
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const px = x + dx;
                const py = y + dy;
                
                if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
                    const index = (py * this.width + px) * 4;
                    this.data[index] = color[0];     // R
                    this.data[index + 1] = color[1]; // G
                    this.data[index + 2] = color[2]; // B
                    this.data[index + 3] = color[3]; // A
                }
            }
        }
    }
    
    // Color palette cache creation
    createPaletteCache() {
        const cache = [];
        
        for (let i = 0; i < CONFIG.PALETTE.length; i++) {
            const hex = CONFIG.PALETTE[i];
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            cache[i] = [r, g, b, 255];
        }
        
        return cache;
    }
    
    // Get visible pixels
    getVisiblePixels(viewport, scale) {
        // Calculate visible range in world coordinates
        const worldMinX = Math.floor(viewport.x / scale);
        const worldMinY = Math.floor(viewport.y / scale);
        const worldMaxX = Math.ceil((viewport.x + viewport.width) / scale);
        const worldMaxY = Math.ceil((viewport.y + viewport.height) / scale);
        
        const visiblePixels = [];
        
        // Get pixels within range from PixelStorage
        for (const [key, color] of this.pixelStorage.pixels) {
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
            
            if (worldX >= worldMinX && worldX <= worldMaxX && 
                worldY >= worldMinY && worldY <= worldMaxY) {
                visiblePixels.push({
                    worldX,
                    worldY,
                    color,
                    key
                });
            }
        }
        
        return visiblePixels;
    }
    
    // Canvas size adjustment
    resizeIfNeeded(width, height) {
        if (this.width !== width || this.height !== height) {
            this.width = width;
            this.height = height;
            
            // Update physical canvas size
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
            
            this.ctx.scale(dpr, dpr);
            
            // Recreate ImageData
            this.imageData = this.ctx.createImageData(width, height);
            this.data = this.imageData.data;
            
            console.log(`Canvas resized: ${width}x${height} (DPR: ${dpr})`);
        }
    }
    
    // Clear canvas
    clearCanvas() {
        if (this.data) {
            // Fast memory clear
            this.data.fill(0);
        }
    }
    
    // Region rendering
    renderRegion(region, viewport, scale, lodLevel) {
        const regionPixels = this.getPixelsInRegion(region);
        const skipFactor = Math.pow(2, lodLevel);
        const maxPixels = 1000; // Maximum pixels per region
        
        this.renderPixelsBatch(regionPixels, viewport, scale, skipFactor, maxPixels);
    }
    
    // Get pixels within region
    getPixelsInRegion(region) {
        const pixels = [];
        
        for (const [key, color] of this.pixelStorage.pixels) {
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
            
            if (worldX >= region.x && worldX < region.x + region.width &&
                worldY >= region.y && worldY < region.y + region.height) {
                pixels.push({ worldX, worldY, color, key });
            }
        }
        
        return pixels;
    }
    
    // Viewport change detection
    detectViewportChange(viewport) {
        if (!this.lastViewport) {
            this.viewportChanged = true;
            this.lastViewport = { ...viewport };
            return;
        }
        
        const threshold = 10; // Movement of 10+ pixels is considered a change
        
        this.viewportChanged = 
            Math.abs(viewport.x - this.lastViewport.x) > threshold ||
            Math.abs(viewport.y - this.lastViewport.y) > threshold ||
            viewport.width !== this.lastViewport.width ||
            viewport.height !== this.lastViewport.height;
            
        if (this.viewportChanged) {
            this.lastViewport = { ...viewport };
        }
    }
    
    // Add dirty region
    addDirtyRegion(x, y, width = 10, height = 10) {
        this.dirtyRegions.add({
            x: Math.max(0, x - 5),
            y: Math.max(0, y - 5),
            width: width + 10,
            height: height + 10
        });
    }
    
    // Maximum pixels per LOD level
    getMaxPixelsForLOD(lodLevel) {
        const maxPixels = [5000, 3000, 2000, 1000, 500, 250];
        return maxPixels[lodLevel] || 100;
    }
    
    // Update statistics
    updateStats(startTime) {
        const renderTime = performance.now() - startTime;
        this.stats.frameCount++;
        this.stats.averageRenderTime = (this.stats.averageRenderTime + renderTime) / 2;
        this.stats.lodLevel = this.currentLOD;
        
        // FPS calculation (every second)
        if (this.stats.frameCount % 60 === 0) {
            this.stats.averageFPS = 1000 / this.stats.averageRenderTime;
            console.log(`FPS: ${this.stats.averageFPS.toFixed(1)}, Render: ${this.stats.averageRenderTime.toFixed(1)}ms, LOD: ${this.currentLOD}`);
        }
    }
    
    // Get statistics
    getStats() {
        return {
            ...this.stats,
            targetFPS: this.targetFPS,
            dirtyRegions: this.dirtyRegions.size,
            isOptimal: this.stats.averageFPS >= this.targetFPS * 0.9
        };
    }
    
    // Cleanup
    cleanup() {
        this.dirtyRegions.clear();
        this.renderQueue = [];
        this.imageData = null;
        this.data = null;
        
        console.log('UltraFastRenderer cleaned up');
    }
}
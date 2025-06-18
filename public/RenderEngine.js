// Rendering engine for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class RenderEngine {
    constructor(canvas, ctx, pixelCanvas) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.pixelCanvas = pixelCanvas;
        this.remotePixelsBuffer = new Map();
        this.renderTimeout = null;
        
        // Performance optimization state
        this.performanceOptimizer = {
            enabled: false, // EMERGENCY: Disabled due to performance issues
            level: 1, // Start with basic level only
            lastPixelData: new Map(), // For diff rendering
            visiblePixelCache: new Map(), // For viewport culling
            pixelClusters: new Map(), // For clustering optimization
            renderStats: {
                frameCount: 0,
                totalPixelsRendered: 0,
                clustersRendered: 0,
                averageFPS: 60,
                lastFrameTime: performance.now()
            }
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
        
        // Render pixels with performance optimization
        if (this.performanceOptimizer.enabled) {
            this.renderPixelsOptimized();
        } else {
            this.renderPixels();
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
    
    renderPixels() {
        // EMERGENCY FIX: Aggressive viewport culling for performance
        const visibleBounds = this.calculateVisiblePixelBounds();
        let pixelsRendered = 0;
        const maxPixelsPerFrame = 2000; // Hard limit to prevent lag
        
        for (const [key, color] of this.pixelCanvas.pixels) {
            // Stop rendering if we hit the limit
            if (pixelsRendered >= maxPixelsPerFrame) {
                break;
            }
            
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            
            // Only render pixels that are definitely visible
            if (this.isPixelVisible(world.x, world.y, visibleBounds)) {
                this.renderPixel(world.x, world.y, color);
                pixelsRendered++;
            }
        }
        
        // Debug info if we hit the limit
        if (pixelsRendered >= maxPixelsPerFrame) {
            console.log(`⚠️ Render limit hit: ${pixelsRendered} pixels rendered this frame`);
        }
    }
    
    renderPixelsOptimized() {
        const level = this.performanceOptimizer.level;
        const visibleBounds = this.calculateVisiblePixelBounds();
        const resolutionScale = this.calculateDynamicResolution();
        
        if (level >= 2 && resolutionScale === 1) {
            // Level 2: Pixel clustering for high-density areas
            this.renderPixelsWithClustering(visibleBounds);
        } else {
            // Level 1: Basic optimization
            this.renderPixelsBasic(visibleBounds, resolutionScale);
        }
    }
    
    renderPixelsBasic(visibleBounds, resolutionScale) {
        const currentPixelData = new Map();
        let pixelsRendered = 0;
        
        for (const [key, color] of this.pixelCanvas.pixels) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            
            // Level 1: Skip pixels outside viewport
            if (!this.isPixelVisible(world.x, world.y, visibleBounds)) {
                continue;
            }
            
            // Diff rendering - only render changed pixels
            if (this.performanceOptimizer.lastPixelData.has(key) && 
                this.performanceOptimizer.lastPixelData.get(key) === color) {
                continue;
            }
            
            // Render pixel with dynamic resolution
            if (resolutionScale === 1) {
                this.renderPixel(world.x, world.y, color);
            } else {
                this.renderPixelLowRes(world.x, world.y, color, resolutionScale);
            }
            
            currentPixelData.set(key, color);
            pixelsRendered++;
        }
        
        this.performanceOptimizer.lastPixelData = currentPixelData;
        this.performanceOptimizer.renderStats.totalPixelsRendered = pixelsRendered;
    }
    
    renderPixelsWithClustering(visibleBounds) {
        // Level 2: Group adjacent same-color pixels into rectangles
        const visiblePixels = new Map();
        const changedPixels = new Map();
        
        // Collect visible and changed pixels
        for (const [key, color] of this.pixelCanvas.pixels) {
            const [sectorX, sectorY, localX, localY] = Utils.parsePixelKey(key);
            const world = Utils.localToWorld(sectorX, sectorY, localX, localY);
            
            if (!this.isPixelVisible(world.x, world.y, visibleBounds)) {
                continue;
            }
            
            visiblePixels.set(key, { world, color });
            
            // Track changes for diff rendering
            if (!this.performanceOptimizer.lastPixelData.has(key) || 
                this.performanceOptimizer.lastPixelData.get(key) !== color) {
                changedPixels.set(key, { world, color });
            }
        }
        
        // Only cluster if we have enough changed pixels to benefit
        if (changedPixels.size > 100) {
            const clusters = this.createPixelClusters(changedPixels);
            this.renderClusters(clusters);
            this.performanceOptimizer.renderStats.clustersRendered = clusters.length;
        } else {
            // Fallback to individual pixel rendering for small changes
            let pixelsRendered = 0;
            for (const [key, {world, color}] of changedPixels) {
                this.renderPixel(world.x, world.y, color);
                pixelsRendered++;
            }
            this.performanceOptimizer.renderStats.totalPixelsRendered = pixelsRendered;
        }
        
        // Update diff tracking
        this.performanceOptimizer.lastPixelData = new Map();
        for (const [key, {color}] of visiblePixels) {
            this.performanceOptimizer.lastPixelData.set(key, color);
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
    
    // EMERGENCY: Simplified viewport culling for max performance
    calculateVisiblePixelBounds() {
        const pixelSize = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        const margin = 10; // Reduced margin for performance
        
        const minWorldX = Math.floor((-this.pixelCanvas.offsetX - margin) / pixelSize);
        const maxWorldX = Math.ceil((this.canvas.width - this.pixelCanvas.offsetX + margin) / pixelSize);
        const minWorldY = Math.floor((-this.pixelCanvas.offsetY - margin) / pixelSize);
        const maxWorldY = Math.ceil((this.canvas.height - this.pixelCanvas.offsetY + margin) / pixelSize);
        
        return { minWorldX, maxWorldX, minWorldY, maxWorldY };
    }
    
    isPixelVisible(worldX, worldY, bounds) {
        return worldX >= bounds.minWorldX && worldX <= bounds.maxWorldX &&
               worldY >= bounds.minWorldY && worldY <= bounds.maxWorldY;
    }
    
    // Level 1 Optimization: Dynamic resolution scaling
    calculateDynamicResolution() {
        const scale = this.pixelCanvas.scale;
        if (scale < 0.5) {
            return 4; // 4x4 pixels combined
        } else if (scale < 1.0) {
            return 2; // 2x2 pixels combined
        }
        return 1; // Full resolution
    }
    
    renderPixelLowRes(worldX, worldY, colorIndex, resolutionScale) {
        // Group pixels and render as larger blocks for performance
        const blockWorldX = Math.floor(worldX / resolutionScale) * resolutionScale;
        const blockWorldY = Math.floor(worldY / resolutionScale) * resolutionScale;
        
        const screenX = blockWorldX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
        const screenY = blockWorldY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
        const size = CONFIG.PIXEL_SIZE * this.pixelCanvas.scale * resolutionScale;
        
        if (screenX + size >= -10 && screenX <= this.canvas.width + 10 &&
            screenY + size >= -10 && screenY <= this.canvas.height + 10) {
            
            this.ctx.fillStyle = CONFIG.COLORS[colorIndex] || '#000000';
            this.ctx.fillRect(Math.floor(screenX), Math.floor(screenY), Math.ceil(size), Math.ceil(size));
        }
    }
    
    // Performance monitoring
    updatePerformanceStats(startTime) {
        const frameTime = performance.now() - startTime;
        this.performanceOptimizer.renderStats.frameCount++;
        
        // Calculate FPS every 60 frames
        if (this.performanceOptimizer.renderStats.frameCount % 60 === 0) {
            const currentTime = performance.now();
            const timeDiff = currentTime - this.performanceOptimizer.renderStats.lastFrameTime;
            this.performanceOptimizer.renderStats.averageFPS = 60000 / timeDiff;
            this.performanceOptimizer.renderStats.lastFrameTime = currentTime;
            
            // Auto-disable optimization if causing issues
            if (this.performanceOptimizer.renderStats.averageFPS < 10) {
                console.warn('🐌 Performance very low, consider disabling optimization');
            }
        }
    }
    
    // Level 2 Optimization: Pixel clustering
    createPixelClusters(pixels) {
        const clusters = [];
        const processed = new Set();
        
        for (const [key, {world, color}] of pixels) {
            if (processed.has(key)) continue;
            
            // Try to create a rectangular cluster starting from this pixel
            const cluster = this.expandCluster(key, world, color, pixels, processed);
            if (cluster) {
                clusters.push(cluster);
            }
        }
        
        return clusters;
    }
    
    expandCluster(startKey, startWorld, color, allPixels, processed) {
        // Simple horizontal expansion for same-color pixels
        let minX = startWorld.x, maxX = startWorld.x;
        let minY = startWorld.y, maxY = startWorld.y;
        const clusterPixels = [startKey];
        
        // Expand horizontally first
        for (let x = startWorld.x + 1; x <= startWorld.x + 32; x++) {
            const checkKey = this.getPixelKeyAt(x, startWorld.y, allPixels);
            if (!checkKey || processed.has(checkKey) || 
                allPixels.get(checkKey)?.color !== color) break;
            
            clusterPixels.push(checkKey);
            maxX = x;
        }
        
        for (let x = startWorld.x - 1; x >= startWorld.x - 32; x--) {
            const checkKey = this.getPixelKeyAt(x, startWorld.y, allPixels);
            if (!checkKey || processed.has(checkKey) || 
                allPixels.get(checkKey)?.color !== color) break;
            
            clusterPixels.push(checkKey);
            minX = x;
        }
        
        // Mark all pixels in this cluster as processed
        clusterPixels.forEach(key => processed.add(key));
        
        // Only create cluster if it saves draw calls (3+ pixels)
        if (clusterPixels.length >= 3) {
            return {
                minX, maxX, minY, maxY,
                color,
                pixelCount: clusterPixels.length,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            };
        }
        
        return null;
    }
    
    getPixelKeyAt(worldX, worldY, allPixels) {
        const sector = Utils.worldToLocal(worldX, worldY);
        const key = Utils.createPixelKey(sector.sectorX, sector.sectorY, sector.localX, sector.localY);
        return allPixels.has(key) ? key : null;
    }
    
    renderClusters(clusters) {
        for (const cluster of clusters) {
            const screenX = cluster.minX * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetX;
            const screenY = cluster.minY * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale + this.pixelCanvas.offsetY;
            const width = cluster.width * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
            const height = cluster.height * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
            
            // Only render if visible
            if (screenX + width >= -10 && screenX <= this.canvas.width + 10 &&
                screenY + height >= -10 && screenY <= this.canvas.height + 10) {
                
                this.ctx.fillStyle = CONFIG.COLORS[cluster.color] || '#000000';
                this.ctx.fillRect(Math.floor(screenX), Math.floor(screenY), 
                                Math.ceil(width), Math.ceil(height));
            }
        }
    }
    
    // Public API for performance control
    toggleOptimization(enabled = null) {
        if (enabled !== null) {
            this.performanceOptimizer.enabled = enabled;
        } else {
            this.performanceOptimizer.enabled = !this.performanceOptimizer.enabled;
        }
        console.log(`🎯 Render optimization: ${this.performanceOptimizer.enabled ? 'ENABLED' : 'DISABLED'}`);
        return this.performanceOptimizer.enabled;
    }
    
    setOptimizationLevel(level) {
        if (level >= 1 && level <= 3) {
            this.performanceOptimizer.level = level;
            console.log(`🔧 Optimization level set to: ${level} (1=basic, 2=clustering, 3=advanced)`);
            
            // Clear caches when switching levels
            this.performanceOptimizer.lastPixelData.clear();
            this.performanceOptimizer.pixelClusters.clear();
            
            return level;
        }
        return this.performanceOptimizer.level;
    }
    
    getPerformanceStats() {
        return {
            ...this.performanceOptimizer.renderStats,
            optimizationEnabled: this.performanceOptimizer.enabled,
            optimizationLevel: this.performanceOptimizer.level,
            cachedPixels: this.performanceOptimizer.lastPixelData.size,
            totalPixelCount: this.pixelCanvas.pixels.size,
            renderEfficiency: this.calculateRenderEfficiency()
        };
    }
    
    calculateRenderEfficiency() {
        const totalPixels = this.pixelCanvas.pixels.size;
        const renderedPixels = this.performanceOptimizer.renderStats.totalPixelsRendered;
        const clustersRendered = this.performanceOptimizer.renderStats.clustersRendered;
        
        if (totalPixels === 0) return 1;
        
        const efficiency = clustersRendered > 0 ? 
            1 - (renderedPixels + clustersRendered) / totalPixels :
            1 - renderedPixels / totalPixels;
            
        return Math.max(0, Math.min(1, efficiency));
    }
    
    // Debug method for testing different optimization levels
    benchmark(seconds = 5) {
        console.log(`🏁 Starting ${seconds}s render benchmark...`);
        const results = {};
        
        const originalLevel = this.performanceOptimizer.level;
        const levels = [1, 2]; // Test different levels
        
        let currentLevelIndex = 0;
        const testLevel = () => {
            if (currentLevelIndex >= levels.length) {
                // Restore original level and show results
                this.setOptimizationLevel(originalLevel);
                console.log('📊 Benchmark Results:', results);
                return;
            }
            
            const level = levels[currentLevelIndex];
            this.setOptimizationLevel(level);
            
            const startTime = performance.now();
            let frameCount = 0;
            
            const testFrame = () => {
                this.render();
                frameCount++;
                
                if (performance.now() - startTime < seconds * 1000) {
                    requestAnimationFrame(testFrame);
                } else {
                    const avgFPS = frameCount / seconds;
                    const stats = this.getPerformanceStats();
                    results[`Level ${level}`] = {
                        avgFPS: avgFPS.toFixed(1),
                        efficiency: (stats.renderEfficiency * 100).toFixed(1) + '%',
                        totalFrames: frameCount
                    };
                    
                    console.log(`✅ Level ${level}: ${avgFPS.toFixed(1)} FPS, ${(stats.renderEfficiency * 100).toFixed(1)}% efficiency`);
                    currentLevelIndex++;
                    setTimeout(testLevel, 1000); // Brief pause between tests
                }
            };
            
            requestAnimationFrame(testFrame);
        };
        
        testLevel();
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
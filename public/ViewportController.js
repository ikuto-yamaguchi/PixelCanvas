// Viewport management for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class ViewportController {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
    }
    
    getViewportBounds() {
        // Handle case when no active sectors exist
        if (this.pixelCanvas.activeSectors.size === 0) {
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
        const sectorSize = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        const centerX = sectorSize / 2;
        const centerY = sectorSize / 2;
        const canvasSize = this.getLogicalCanvasSize();
        
        return {
            minOffsetX: -centerX * this.pixelCanvas.scale,
            maxOffsetX: canvasSize.width - centerX * this.pixelCanvas.scale,
            minOffsetY: -centerY * this.pixelCanvas.scale,
            maxOffsetY: canvasSize.height - centerY * this.pixelCanvas.scale
        };
    }
    
    getLogicalCanvasSize() {
        const dpr = window.devicePixelRatio || 1;
        return {
            width: this.pixelCanvas.logicalWidth || this.pixelCanvas.canvas.width / dpr,
            height: this.pixelCanvas.logicalHeight || this.pixelCanvas.canvas.height / dpr
        };
    }
    
    calculateActiveSectorBounds() {
        let minSectorX = Infinity, maxSectorX = -Infinity;
        let minSectorY = Infinity, maxSectorY = -Infinity;
        
        for (const sectorKey of this.pixelCanvas.activeSectors) {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            minSectorX = Math.min(minSectorX, sectorX);
            maxSectorX = Math.max(maxSectorX, sectorX);
            minSectorY = Math.min(minSectorY, sectorY);
            maxSectorY = Math.max(maxSectorY, sectorY);
        }
        
        const pixelsPerSector = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        return {
            left: minSectorX * pixelsPerSector,
            right: (maxSectorX + 1) * pixelsPerSector,
            top: minSectorY * pixelsPerSector,
            bottom: (maxSectorY + 1) * pixelsPerSector,
            minSectorX, maxSectorX, minSectorY, maxSectorY
        };
    }
    
    addPaddingToBounds(bounds) {
        const paddingPixels = CONFIG.PADDING_SECTORS * CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE;
        
        return {
            left: bounds.left - paddingPixels,
            right: bounds.right + paddingPixels,
            top: bounds.top - paddingPixels,
            bottom: bounds.bottom + paddingPixels
        };
    }
    
    calculateHorizontalConstraints(paddedBounds, canvasSize) {
        const worldWidthScaled = (paddedBounds.right - paddedBounds.left) * this.pixelCanvas.scale;
        
        let minOffsetX, maxOffsetX;
        
        if (worldWidthScaled <= canvasSize.width) {
            // World smaller than screen: allow centering
            const centerOffsetX = (canvasSize.width - worldWidthScaled) / 2 - paddedBounds.left * this.pixelCanvas.scale;
            const margin = canvasSize.width * CONFIG.VIEWPORT_MARGIN;
            minOffsetX = centerOffsetX - margin;
            maxOffsetX = centerOffsetX + margin;
        } else {
            // World larger than screen: edge constraints
            minOffsetX = canvasSize.width - paddedBounds.right * this.pixelCanvas.scale;
            maxOffsetX = -paddedBounds.left * this.pixelCanvas.scale;
        }
        
        return { minOffsetX, maxOffsetX, worldWidthScaled };
    }
    
    calculateVerticalConstraints(paddedBounds, canvasSize) {
        const worldHeightScaled = (paddedBounds.bottom - paddedBounds.top) * this.pixelCanvas.scale;
        
        let minOffsetY, maxOffsetY;
        
        if (worldHeightScaled <= canvasSize.height) {
            // World smaller than screen: allow centering
            const centerOffsetY = (canvasSize.height - worldHeightScaled) / 2 - paddedBounds.top * this.pixelCanvas.scale;
            const margin = canvasSize.height * CONFIG.VIEWPORT_MARGIN;
            minOffsetY = centerOffsetY - margin;
            maxOffsetY = centerOffsetY + margin;
        } else {
            // World larger than screen: edge constraints
            minOffsetY = canvasSize.height - paddedBounds.bottom * this.pixelCanvas.scale;
            maxOffsetY = -paddedBounds.top * this.pixelCanvas.scale;
        }
        
        return { minOffsetY, maxOffsetY, worldHeightScaled };
    }
    
    logViewportBounds(activeBounds, paddedBounds, canvasSize, horizontalConstraints, verticalConstraints) {
        console.log(`🔍 Viewport bounds calculated:
            Active sectors: X[${activeBounds.minSectorX} to ${activeBounds.maxSectorX}] Y[${activeBounds.minSectorY} to ${activeBounds.maxSectorY}]
            World bounds: X[${activeBounds.left} to ${activeBounds.right}] Y[${activeBounds.top} to ${activeBounds.bottom}]
            Padded bounds: X[${paddedBounds.left} to ${paddedBounds.right}] Y[${paddedBounds.top} to ${paddedBounds.bottom}]
            Canvas (logical): ${canvasSize.width}x${canvasSize.height}, Scale: ${this.pixelCanvas.scale.toFixed(2)}x
            Canvas (physical): ${this.pixelCanvas.canvas.width}x${this.pixelCanvas.canvas.height}, DPR: ${window.devicePixelRatio || 1}
            World size scaled: ${horizontalConstraints.worldWidthScaled.toFixed(1)}x${verticalConstraints.worldHeightScaled.toFixed(1)}
            Offset bounds: X[${horizontalConstraints.minOffsetX.toFixed(1)} to ${horizontalConstraints.maxOffsetX.toFixed(1)}] Y[${verticalConstraints.minOffsetY.toFixed(1)} to ${verticalConstraints.maxOffsetY.toFixed(1)}]`);
    }
    
    constrainViewport() {
        // Apply viewport constraints based on active sectors
        const bounds = this.getViewportBounds();
        
        const originalOffsetX = this.pixelCanvas.offsetX;
        const originalOffsetY = this.pixelCanvas.offsetY;
        
        // Apply constraints
        this.pixelCanvas.offsetX = Utils.clamp(this.pixelCanvas.offsetX, bounds.minOffsetX, bounds.maxOffsetX);
        this.pixelCanvas.offsetY = Utils.clamp(this.pixelCanvas.offsetY, bounds.minOffsetY, bounds.maxOffsetY);
        
        // Log constraint application if significant change
        const deltaX = Math.abs(this.pixelCanvas.offsetX - originalOffsetX);
        const deltaY = Math.abs(this.pixelCanvas.offsetY - originalOffsetY);
        
        if (deltaX > 1 || deltaY > 1) {
            console.log(`📏 Viewport constrained: (${originalOffsetX.toFixed(1)}, ${originalOffsetY.toFixed(1)}) → (${this.pixelCanvas.offsetX.toFixed(1)}, ${this.pixelCanvas.offsetY.toFixed(1)})`);
        }
    }
    
    centerViewportOnActiveSectors() {
        if (this.pixelCanvas.activeSectors.size === 0) {
            console.log('📍 No active sectors to center on');
            return;
        }
        
        const activeBounds = this.calculateActiveSectorBounds();
        const canvasSize = this.getLogicalCanvasSize();
        
        // Calculate center of active sectors in world coordinates
        const centerWorldX = (activeBounds.left + activeBounds.right) / 2;
        const centerWorldY = (activeBounds.top + activeBounds.bottom) / 2;
        
        // Calculate screen center
        const screenCenterX = canvasSize.width / 2;
        const screenCenterY = canvasSize.height / 2;
        
        // Calculate required offset to center the active sectors
        this.pixelCanvas.offsetX = screenCenterX - centerWorldX * this.pixelCanvas.scale;
        this.pixelCanvas.offsetY = screenCenterY - centerWorldY * this.pixelCanvas.scale;
        
        // Apply constraints
        this.constrainViewport();
        
        console.log(`📍 Centered viewport on active sectors: world center (${centerWorldX.toFixed(1)}, ${centerWorldY.toFixed(1)}) → screen center (${screenCenterX}, ${screenCenterY})`);
        console.log(`📍 Final offset: (${this.pixelCanvas.offsetX.toFixed(1)}, ${this.pixelCanvas.offsetY.toFixed(1)}), scale: ${this.pixelCanvas.scale.toFixed(2)}x`);
    }
    
    showBoundaryWarning() {
        // Create or update boundary warning element
        let warning = document.getElementById('boundaryWarning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'boundaryWarning';
            warning.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 0, 0, 0.9);
                color: white;
                padding: 20px;
                border-radius: 10px;
                font-family: Arial, sans-serif;
                font-size: 16px;
                text-align: center;
                z-index: 1000;
                max-width: 300px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(warning);
        }
        
        warning.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
            <div><strong>Viewport Boundary</strong></div>
            <div style="margin-top: 10px; font-size: 14px;">
                You've reached the edge of the active drawing area.
            </div>
        `;
        warning.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (warning) {
                warning.style.display = 'none';
            }
        }, 3000);
    }
}
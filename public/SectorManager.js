// Sector expansion and management for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class SectorManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.isExpansionRunning = false;
        this.expansionDebouncer = Utils.debounce(
            () => this.checkLoadedSectorsForExpansion(), 
            CONFIG.EXPANSION_DEBOUNCE_MS
        );
    }
    
    debounceExpansionCheck() {
        this.expansionDebouncer();
    }
    
    async checkLoadedSectorsForExpansion() {
        // Prevent concurrent expansion operations
        if (this.isExpansionRunning) {
            this.pixelCanvas.debugPanel.log('⏸️ Expansion already running, skipping...');
            return;
        }
        
        this.isExpansionRunning = true;
        this.pixelCanvas.debugPanel.log('🔄 Starting expansion check...');
        
        try {
            await this.performExpansionCheck();
        } catch (error) {
            console.error('❌ Expansion check failed:', error);
            this.pixelCanvas.debugPanel.log(`❌ Expansion check error: ${error.message}`);
        } finally {
            this.isExpansionRunning = false;
            this.pixelCanvas.debugPanel.log('✅ Expansion check completed');
        }
    }
    
    async performExpansionCheck() {
        this.pixelCanvas.debugPanel.log(`🔍 === CHECKING LOADED SECTORS ===`);
        this.pixelCanvas.debugPanel.log(`🔍 Pixels: ${this.pixelCanvas.pixels.size}, Active: ${Array.from(this.pixelCanvas.activeSectors).join(',')}`);
        this.pixelCanvas.debugPanel.log(`🔍 Threshold: ${(CONFIG.SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}%`);
        
        // Use pixels as single source of truth - count pixels in real-time
        const sectorCounts = this.calculateRealTimeSectorCounts();
    
        this.pixelCanvas.debugPanel.log(`🔍 Found ${sectorCounts.size} sectors with pixels:`);
        for (const [sectorKey, count] of sectorCounts) {
            const isActive = this.pixelCanvas.activeSectors.has(sectorKey);
            const maxPixels = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
            const percentage = (count / maxPixels * 100).toFixed(2);
            const exceedsThreshold = count / maxPixels >= CONFIG.SECTOR_EXPANSION_THRESHOLD;
            this.pixelCanvas.debugPanel.log(`🔍 ${sectorKey}: ${count}px (${percentage}%) Active:${isActive} Exceeds:${exceedsThreshold}`);
            
            // Flag problematic sectors for detailed analysis
            if (exceedsThreshold && isActive) {
                this.pixelCanvas.debugPanel.log(`⚠️ PROBLEM: ${sectorKey} exceeds threshold but is still marked as active!`);
            }
        }
        
        let expandedAny = false;
        
        // Check each sector with pixels
        for (const [sectorKey, pixelCount] of sectorCounts) {
            // If this sector has pixels but is in activeSectors, remove it
            // (activeSectors should only contain empty sectors)
            if (this.pixelCanvas.activeSectors.has(sectorKey)) {
                this.pixelCanvas.activeSectors.delete(sectorKey);
                this.pixelCanvas.debugPanel.log(`🗑️ Removed ${sectorKey} from activeSectors (has pixels)`);
            }
            
            // Check if expansion is needed
            const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
            const fillPercentage = pixelCount / maxPixelsPerSector;
            
            this.pixelCanvas.debugPanel.log(`📊 Evaluating ${sectorKey}: ${pixelCount}px (${(fillPercentage * 100).toFixed(4)}%)`);
            this.pixelCanvas.debugPanel.log(`📊 Threshold: ${(CONFIG.SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}%, Meets: ${fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD}`);
            
            if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD && pixelCount >= 7) {
                const [sectorX, sectorY] = sectorKey.split(',').map(Number);
                
                // Double-check with real-time count to prevent inconsistency
                const realTimeCount = this.getRealTimePixelCount(sectorKey);
                if (realTimeCount >= 7) {
                    this.pixelCanvas.debugPanel.log(`🔄 EXPANDING ${sectorKey} (verified: ${realTimeCount} pixels)`);
                    this.expandSectorsLocally(sectorX, sectorY);
                    expandedAny = true;
                } else {
                    this.pixelCanvas.debugPanel.log(`❌ ${sectorKey} inconsistent data: cached=${pixelCount}, real=${realTimeCount}`);
                }
            }
        }
        
        if (!expandedAny) {
            this.pixelCanvas.debugPanel.log(`📍 No expansion needed`);
        } else {
            this.pixelCanvas.debugPanel.log(`🎯 Expanded! New active: ${Array.from(this.pixelCanvas.activeSectors).join(',')}`);
        }
        
        this.pixelCanvas.debugPanel.log(`🔍 === END CHECK ===`);
        
        // Clean up activeSectors to ensure consistency
        this.cleanupActiveSectors();
        
        // Also schedule async check for completeness (for database validation)
        if (this.expansionDebouncer) {
            this.expansionDebouncer();
        }
    }
    
    calculateRealTimeSectorCounts() {
        const sectorCounts = new Map();
        
        // Count pixels in each sector from actual pixel data
        for (const pixelKey of this.pixelCanvas.pixels.keys()) {
            const [sectorX, sectorY] = Utils.parsePixelKey(pixelKey);
            const sectorKey = Utils.createSectorKey(sectorX, sectorY);
            sectorCounts.set(sectorKey, (sectorCounts.get(sectorKey) || 0) + 1);
        }
        
        return sectorCounts;
    }
    
    getRealTimePixelCount(sectorKey) {
        let count = 0;
        for (const pixelKey of this.pixelCanvas.pixels.keys()) {
            const [sectorX, sectorY] = Utils.parsePixelKey(pixelKey);
            const currentSectorKey = Utils.createSectorKey(sectorX, sectorY);
            if (currentSectorKey === sectorKey) {
                count++;
            }
        }
        return count;
    }
    
    cleanupActiveSectors() {
        // Remove any sectors from activeSectors that have pixels (using real-time count)
        // activeSectors should only contain empty sectors available for drawing
        const sectorsToRemove = [];
        
        for (const sectorKey of this.pixelCanvas.activeSectors) {
            const pixelCount = this.getRealTimePixelCount(sectorKey);
            if (pixelCount > 0) {
                sectorsToRemove.push(sectorKey);
            }
        }
        
        for (const sectorKey of sectorsToRemove) {
            this.pixelCanvas.activeSectors.delete(sectorKey);
            const realPixelCount = this.getRealTimePixelCount(sectorKey);
            this.pixelCanvas.debugPanel.log(`🧹 Cleanup: Removed ${sectorKey} from activeSectors (${realPixelCount} pixels)`);
        }
        
        if (sectorsToRemove.length > 0) {
            this.pixelCanvas.debugPanel.log(`🧹 Cleanup complete: Removed ${sectorsToRemove.length} sectors from activeSectors`);
            this.pixelCanvas.debugPanel.log(`🧹 Active sectors now: ${Array.from(this.pixelCanvas.activeSectors).slice(0, 10).join(', ')}${this.pixelCanvas.activeSectors.size > 10 ? '...' : ''}`);
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
    
    
    async updateSectorCountInDatabase(sectorKey) {
        // Update sector count in database (fire and forget)
        setTimeout(async () => {
            try {
                const realTimeCount = this.getRealTimePixelCount(sectorKey);
                const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
                
                await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors`, {
                    method: 'POST',
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        sector_x: sectorX,
                        sector_y: sectorY,
                        pixel_count: realTimeCount
                    })
                });
            } catch (error) {
                // Ignore errors in background update
            }
        }, 0);
    }
    
    async checkSectorExpansion(sectorX, sectorY, pixelCount) {
        const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; // 256 * 256 = 65536
        const fillPercentage = pixelCount / maxPixelsPerSector;
        const thresholdPixels = Math.ceil(maxPixelsPerSector * CONFIG.SECTOR_EXPANSION_THRESHOLD);
        
        console.log(`🔍 Checking expansion for sector (${sectorX}, ${sectorY}):
            Pixels: ${pixelCount}/${maxPixelsPerSector}
            Fill percentage: ${(fillPercentage * 100).toFixed(4)}%
            Threshold: ${(CONFIG.SECTOR_EXPANSION_THRESHOLD * 100).toFixed(4)}% (${thresholdPixels} pixels)
            Should expand: ${fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD}`);
        
        if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD) {
            console.log(`🚀 Sector (${sectorX}, ${sectorY}) is ${(fillPercentage * 100).toFixed(2)}% full. Expanding...`);
            this.expandSectorsLocally(sectorX, sectorY);
        }
    }
    
    expandSectorsLocally(centerX, centerY) {
        const centerKey = Utils.createSectorKey(centerX, centerY);
        
        // Real-time validation before expansion
        const centerPixelCount = this.getRealTimePixelCount(centerKey);
        if (centerPixelCount < 7) {
            this.pixelCanvas.debugPanel.log(`❌ ABORT EXPANSION: ${centerKey} has ${centerPixelCount} pixels (need 7+)`);
            return;
        }
        
        this.pixelCanvas.debugPanel.log(`🎯 EXPANSION START: Center (${centerX}, ${centerY}) with ${centerPixelCount} verified pixels`);
        
        // Remove center sector from active sectors since it now has pixels
        if (this.pixelCanvas.activeSectors.has(centerKey)) {
            this.pixelCanvas.activeSectors.delete(centerKey);
            this.pixelCanvas.debugPanel.log(`🗑️ Removed ${centerKey} from activeSectors`);
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
            const sectorKey = Utils.createSectorKey(newX, newY);
            
            if (!this.pixelCanvas.activeSectors.has(sectorKey)) {
                this.pixelCanvas.activeSectors.add(sectorKey);
                if (this.pixelCanvas.sectorPixelCounts) {
                    this.pixelCanvas.sectorPixelCounts.set(sectorKey, 0);
                }
                console.log(`🎯 Expanded to sector (${newX}, ${newY})`);
                expanded = true;
                
                // Create sector in database (fire and forget)
                fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
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
            this.pixelCanvas.debugPanel.log(`🎯 EXPANSION DONE: ${centerPixelCount} pixels triggered expansion`);
            this.pixelCanvas.debugPanel.log(`🎯 Active after expansion: ${Array.from(this.pixelCanvas.activeSectors).slice(0, 10).join(', ')}${this.pixelCanvas.activeSectors.size > 10 ? '...' : ''}`);
            // Show visual feedback for expansion
            this.showExpansionNotification(centerX, centerY);
            // Update UI immediately
            this.pixelCanvas.render();
            if (this.pixelCanvas.constrainViewport) {
                this.pixelCanvas.constrainViewport();
            }
        } else {
            this.pixelCanvas.debugPanel.log(`🎯 No expansion needed - all surrounding sectors already active`);
        }
        
        // Update database count for center sector
        this.updateSectorCountInDatabase(centerKey);
    }
    
    
    isWithinActiveSectors(worldX, worldY) {
        const local = Utils.worldToLocal(worldX, worldY);
        const sectorKey = Utils.createSectorKey(local.sectorX, local.sectorY);
        return this.pixelCanvas.activeSectors.has(sectorKey);
    }
}
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
        // Get real-time sector counts
        const sectorCounts = this.calculateRealTimeSectorCounts();
        let expandedAny = false;
        
        this.pixelCanvas.debugPanel.log(`📊 Checking ${sectorCounts.size} loaded sectors for expansion...`);
        
        for (const [sectorKey, pixelCount] of sectorCounts) {
            if (await this.checkSectorExpansion(sectorKey, pixelCount)) {
                expandedAny = true;
            }
        }
        
        if (expandedAny) {
            this.pixelCanvas.debugPanel.log('🎯 Sectors expanded! Re-rendering...');
            this.pixelCanvas.render();
        } else {
            this.pixelCanvas.debugPanel.log('📍 No sectors needed expansion');
        }
        
        // Clean up active sectors
        this.cleanupActiveSectors();
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
    
    createSectorInDatabase(sectorX, sectorY) {
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
                sector_x: sectorX,
                sector_y: sectorY,
                pixel_count: 0
            })
        }).catch(() => {}); // Ignore errors
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
    
    async checkSectorExpansion(sectorKey, pixelCount) {
        const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
        const fillPercentage = pixelCount / maxPixelsPerSector;
        
        this.pixelCanvas.debugPanel.log(`🔍 Sector ${sectorKey}: ${pixelCount} pixels (${(fillPercentage * 100).toFixed(3)}%)`);
        
        if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD && pixelCount >= 7) {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            this.pixelCanvas.debugPanel.log(`🔄 Expansion triggered: sector (${sectorX}, ${sectorY}) exceeds threshold with ${pixelCount} pixels!`);
            
            this.expandSectorsLocally(sectorX, sectorY);
            return true;
        }
        
        return false;
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
                this.pixelCanvas.debugPanel.log(`🎯 Expanded to sector (${newX}, ${newY})`);
                expanded = true;
                
                // Create sector in database (fire and forget)
                this.createSectorInDatabase(newX, newY);
            }
        }
        
        // Expansion is successful if any surrounding sectors were added
        if (expanded) {
            this.pixelCanvas.debugPanel.log(`🎯 EXPANSION DONE: ${centerPixelCount} pixels triggered expansion`);
            this.pixelCanvas.debugPanel.log(`🎯 Active after expansion: ${Array.from(this.pixelCanvas.activeSectors).slice(0, 10).join(', ')}${this.pixelCanvas.activeSectors.size > 10 ? '...' : ''}`);
            // Show visual feedback for expansion
            console.log(`🎉 Canvas expanded! Sector (${centerX},${centerY}) reached threshold`);
            // Update UI immediately
            this.pixelCanvas.render();
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
// Sector expansion and management for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class SectorManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.isExpansionRunning = false;
        this.expandedSectors = new Set(); // Track sectors that have been expanded
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
        const sectorsToRemove = [];
        const originalSize = this.pixelCanvas.activeSectors.size;
        
        for (const sectorKey of this.pixelCanvas.activeSectors) {
            const pixelCount = this.getRealTimePixelCount(sectorKey);
            if (pixelCount > 0) {
                sectorsToRemove.push({ key: sectorKey, pixels: pixelCount });
            }
        }
        
        for (const sector of sectorsToRemove) {
            this.pixelCanvas.activeSectors.delete(sector.key);
            this.pixelCanvas.debugPanel.log(`🔒 LOCKED: Sector ${sector.key} removed from active (${sector.pixels} pixels found)`);
        }
        
        if (sectorsToRemove.length > 0) {
            this.pixelCanvas.debugPanel.log(`🧹 Cleanup: ${sectorsToRemove.length} sectors locked, ${originalSize - sectorsToRemove.length} remain active`);
            this.pixelCanvas.debugPanel.log(`🟢 Active sectors remaining: ${this.pixelCanvas.activeSectors.size}`);
            
            // If very few active sectors left, trigger emergency expansion
            if (this.pixelCanvas.activeSectors.size < 10) {
                this.pixelCanvas.debugPanel.log(`⚠️ WARNING: Only ${this.pixelCanvas.activeSectors.size} active sectors left! Need emergency expansion.`);
                this.emergencyExpansion();
            }
        }
    }
    
    emergencyExpansion() {
        this.pixelCanvas.debugPanel.log(`🚨 EMERGENCY EXPANSION: Adding sectors in wider radius...`);
        
        // Find center of current activity
        let totalX = 0, totalY = 0, count = 0;
        for (const sectorKey of this.pixelCanvas.activeSectors) {
            const [x, y] = Utils.parseSectorKey(sectorKey);
            totalX += x;
            totalY += y;
            count++;
        }
        
        if (count === 0) {
            // Fallback to origin
            totalX = 0;
            totalY = 0;
            count = 1;
        }
        
        const centerX = Math.round(totalX / count);
        const centerY = Math.round(totalY / count);
        
        // Add empty sectors in 3-radius around center
        let addedCount = 0;
        for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                const sectorKey = Utils.createSectorKey(centerX + dx, centerY + dy);
                const pixelCount = this.getRealTimePixelCount(sectorKey);
                
                if (pixelCount === 0 && !this.pixelCanvas.activeSectors.has(sectorKey)) {
                    this.pixelCanvas.activeSectors.add(sectorKey);
                    addedCount++;
                }
            }
        }
        
        this.pixelCanvas.debugPanel.log(`🆘 Emergency expansion: Added ${addedCount} new active sectors around (${centerX}, ${centerY})`);
        this.pixelCanvas.debugPanel.log(`🟢 Total active sectors now: ${this.pixelCanvas.activeSectors.size}`);
    }
    
    async checkVisibleSectorsForExpansion() {
        const sectorSize = CONFIG.GRID_SIZE * CONFIG.PIXEL_SIZE * this.pixelCanvas.scale;
        
        // Calculate visible sector range
        const startSectorX = Math.floor(-this.pixelCanvas.offsetX / sectorSize) - 1;
        const endSectorX = Math.ceil((this.pixelCanvas.canvas.width - this.pixelCanvas.offsetX) / sectorSize) + 1;
        const startSectorY = Math.floor(-this.pixelCanvas.offsetY / sectorSize) - 1;
        const endSectorY = Math.ceil((this.pixelCanvas.canvas.height - this.pixelCanvas.offsetY) / sectorSize) + 1;
        
        console.log(`🔍 Checking visible sectors for expansion: X[${startSectorX} to ${endSectorX}] Y[${startSectorY} to ${endSectorY}]`);
        
        try {
            const pixels = await this.fetchVisiblePixels(startSectorX, endSectorX, startSectorY, endSectorY);
            await this.processVisiblePixels(pixels);
        } catch (error) {
            console.error('Failed to check visible sectors for expansion:', error);
        }
    }
    
    async fetchVisiblePixels(startSectorX, endSectorX, startSectorY, endSectorY) {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/pixels?sector_x=gte.${startSectorX}&sector_x=lte.${endSectorX}&sector_y=gte.${startSectorY}&sector_y=lte.${endSectorY}&select=sector_x,sector_y`, {
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load pixels for expansion check');
        }
        
        const pixels = await response.json();
        console.log(`Found ${pixels.length} pixels in visible range`);
        return pixels;
    }
    
    async processVisiblePixels(pixels) {
        // Count pixels by sector
        const sectorCounts = new Map();
        for (const pixel of pixels) {
            const sectorKey = Utils.createSectorKey(pixel.sector_x, pixel.sector_y);
            sectorCounts.set(sectorKey, (sectorCounts.get(sectorKey) || 0) + 1);
        }
        
        console.log(`Calculated pixel counts for ${sectorCounts.size} sectors:`, Array.from(sectorCounts.entries()));
        
        let expandedAny = false;
        
        // Check each sector with pixels
        for (const [sectorKey, pixelCount] of sectorCounts) {
            // Remove from activeSectors if it has pixels
            if (this.pixelCanvas.activeSectors.has(sectorKey)) {
                this.pixelCanvas.activeSectors.delete(sectorKey);
                console.log(`🗑️ Viewport check: Removed ${sectorKey} from activeSectors (has pixels)`);
            }
            
            // Check if expansion is needed
            if (await this.checkSectorExpansion(sectorKey, pixelCount)) {
                expandedAny = true;
            }
        }
        
        if (expandedAny) {
            console.log('🎯 Expanded sectors based on viewport visibility');
            this.pixelCanvas.render();
        } else {
            console.log('📍 No sectors in visible range need expansion');
        }
        
        this.cleanupActiveSectors();
    }
    
    async updateSectorCountInDatabase(sectorKey) {
        const realTimeCount = this.getRealTimePixelCount(sectorKey);
        
        try {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            
            // Check if sector exists in database
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}&select=pixel_count`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (response.ok) {
                const existingSectors = await response.json();
                
                if (existingSectors.length > 0) {
                    // Update existing sector
                    await this.updateExistingSector(sectorX, sectorY, realTimeCount);
                } else {
                    // Insert new sector
                    await this.insertNewSector(sectorX, sectorY, realTimeCount);
                }
            }
        } catch (error) {
            console.error(`Failed to update sector count for ${sectorKey}:`, error);
        }
    }
    
    async updateExistingSector(sectorX, sectorY, realTimeCount) {
        await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
            method: 'PATCH',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pixel_count: realTimeCount,
                updated_at: new Date().toISOString()
            })
        });
    }
    
    async insertNewSector(sectorX, sectorY, realTimeCount) {
        await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sector_x: sectorX,
                sector_y: sectorY,
                pixel_count: realTimeCount,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
        });
    }
    
    async checkSectorExpansion(sectorKey, pixelCount) {
        // Skip if this sector has already been expanded
        if (this.expandedSectors.has(sectorKey)) {
            this.pixelCanvas.debugPanel.log(`⏩ Sector ${sectorKey}: Already expanded, skipping`);
            return false;
        }
        
        const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
        const fillPercentage = pixelCount / maxPixelsPerSector;
        
        this.pixelCanvas.debugPanel.log(`🔍 Sector ${sectorKey}: ${pixelCount} pixels (${(fillPercentage * 100).toFixed(3)}%)`);
        
        if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD && pixelCount >= 7) {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            this.pixelCanvas.debugPanel.log(`🔄 Expansion triggered: sector (${sectorX}, ${sectorY}) exceeds threshold with ${pixelCount} pixels!`);
            
            // Mark as expanded to prevent re-expansion
            this.expandedSectors.add(sectorKey);
            
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
        
        this.pixelCanvas.debugPanel.log(`🚀 EXPANDING around ${centerKey} (${centerPixelCount} pixels)`);
        
        // Remove center sector from active sectors (it now has pixels)
        if (this.pixelCanvas.activeSectors.has(centerKey)) {
            this.pixelCanvas.activeSectors.delete(centerKey);
            this.pixelCanvas.debugPanel.log(`🔒 LOCKED sector ${centerKey} (removed from activeSectors - now has ${centerPixelCount} pixels)`);
        } else {
            this.pixelCanvas.debugPanel.log(`ℹ️ Sector ${centerKey} was already locked with ${centerPixelCount} pixels`);
        }
        
        // Add neighboring empty sectors to active sectors (expanded radius)
        const addedSectors = [];
        let alreadyActiveSectors = [];
        let sectorsWithPixels = [];
        let skippedSectors = [];
        
        // Expand in a 2-radius circle to ensure sufficient new sectors
        const radius = addedSectors.length === 0 ? 2 : 1; // Use radius 2 if no immediate neighbors
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue; // Skip center sector
                
                const neighborKey = Utils.createSectorKey(centerX + dx, centerY + dy);
                const neighborPixelCount = this.getRealTimePixelCount(neighborKey);
                
                if (neighborPixelCount > 0) {
                    sectorsWithPixels.push(`${neighborKey}(${neighborPixelCount}px)`);
                    // Also remove from active sectors if it has pixels
                    if (this.pixelCanvas.activeSectors.has(neighborKey)) {
                        this.pixelCanvas.activeSectors.delete(neighborKey);
                        this.pixelCanvas.debugPanel.log(`🔒 LOCKED neighbor ${neighborKey} (found ${neighborPixelCount} pixels)`);
                    }
                } else if (this.pixelCanvas.activeSectors.has(neighborKey)) {
                    alreadyActiveSectors.push(neighborKey);
                } else {
                    this.pixelCanvas.activeSectors.add(neighborKey);
                    addedSectors.push(neighborKey);
                }
            }
        }
        
        // Detailed logging for debugging
        if (alreadyActiveSectors.length > 0) {
            this.pixelCanvas.debugPanel.log(`⚠️ Already active neighbors: ${alreadyActiveSectors.join(', ')}`);
        }
        if (sectorsWithPixels.length > 0) {
            this.pixelCanvas.debugPanel.log(`🎨 Neighbors with pixels: ${sectorsWithPixels.join(', ')}`);
        }
        
        this.pixelCanvas.debugPanel.log(`➕ Added ${addedSectors.length} new active sectors: ${addedSectors.join(', ')}`);
        this.pixelCanvas.debugPanel.log(`📊 Total active sectors: ${this.pixelCanvas.activeSectors.size}`);
        
        // Update database count for center sector
        this.updateSectorCountInDatabase(centerKey);
        
        // Show expansion notification
        this.showExpansionNotification(centerX, centerY);
    }
    
    showExpansionNotification(sectorX, sectorY) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1001;
            transform: translateX(100%);
            transition: transform 0.3s ease-in-out;
            max-width: 250px;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🎯</span>
                <div>
                    <div style="font-weight: bold;">Sector Expanded!</div>
                    <div style="font-size: 12px; opacity: 0.9;">
                        Sector (${sectorX}, ${sectorY}) unlocked new areas
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    isWithinActiveSectors(worldX, worldY) {
        const local = Utils.worldToLocal(worldX, worldY);
        const sectorKey = Utils.createSectorKey(local.sectorX, local.sectorY);
        return this.pixelCanvas.activeSectors.has(sectorKey);
    }
}
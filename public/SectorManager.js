// Simplified Sector management for PixelCanvas - DB-driven architecture
import { CONFIG, Utils } from './Config.js';

export class SectorManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.sectorsCache = new Map(); // Cache for sector states from DB
        this.lastSectorUpdate = 0;
        this.sectorUpdateInterval = 30000; // Refresh every 30 seconds
        this.lastExpansionCheck = 0;
        this.expansionCheckCooldown = 5000; // Limit expansion checks to every 5 seconds
    }
    
    async loadSectorsFromDatabase() {
        try {
            // this.pixelCanvas.debugPanel.log('💾 Loading sector states from database...');
            
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors?select=sector_x,sector_y,pixel_count,is_active`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load sectors: ${response.status}`);
            }
            
            const sectors = await response.json();
            
            // Clear existing cache and rebuild from database
            this.sectorsCache.clear();
            this.pixelCanvas.activeSectors.clear();
            
            for (const sector of sectors) {
                const sectorKey = Utils.createSectorKey(sector.sector_x, sector.sector_y);
                this.sectorsCache.set(sectorKey, {
                    pixelCount: sector.pixel_count,
                    isActive: sector.is_active
                });
                
                // Add to activeSectors if marked as active in database
                if (sector.is_active) {
                    this.pixelCanvas.activeSectors.add(sectorKey);
                }
            }
            
            this.lastSectorUpdate = Date.now();
            // this.pixelCanvas.debugPanel.log(`✅ Loaded ${sectors.length} sectors from database (${this.pixelCanvas.activeSectors.size} active)`);
            
            return sectors;
            
        } catch (error) {
            console.error('Failed to load sectors from database:', error);
            // this.pixelCanvas.debugPanel.log(`❌ Sector load failed: ${error.message}`);
            return [];
        }
    }
    
    async refreshSectorsIfNeeded() {
        const now = Date.now();
        if (now - this.lastSectorUpdate > this.sectorUpdateInterval) {
            // this.pixelCanvas.debugPanel.log('🔄 Refreshing sector states...');
            await this.loadSectorsFromDatabase();
            this.pixelCanvas.render(); // Re-render with updated states
        }
    }
    
    getSectorState(sectorKey) {
        return this.sectorsCache.get(sectorKey) || { pixelCount: 0, isActive: false };
    }
    
    isWithinActiveSectors(worldX, worldY) {
        const local = Utils.worldToLocal(worldX, worldY);
        const sectorKey = Utils.createSectorKey(local.sectorX, local.sectorY);
        
        // Check database cache first, fallback to activeSectors
        const sectorState = this.getSectorState(sectorKey);
        return sectorState.isActive || this.pixelCanvas.activeSectors.has(sectorKey);
    }
    
    // Simplified - no complex calculations needed, database handles everything
    async initializeSectors() {
        // Load initial sector states from database
        await this.loadSectorsFromDatabase();
        
        // Ensure sector (0,0) exists as starting point
        if (!this.sectorsCache.has('0,0')) {
            // this.pixelCanvas.debugPanel.log('🔧 Creating initial sector (0,0)...');
            await this.createSectorInDatabase(0, 0, true);
            await this.loadSectorsFromDatabase(); // Reload to get the new sector
        }
    }
    
    async createSectorInDatabase(sectorX, sectorY, isActive = true) {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors`, {
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
                    pixel_count: 0,
                    is_active: isActive
                })
            });
            
            if (response.ok) {
                // this.pixelCanvas.debugPanel.log(`✅ Created sector (${sectorX}, ${sectorY}) in database`);
            } else {
                console.error('Failed to create sector:', response.status);
            }
        } catch (error) {
            console.error('Failed to create sector in database:', error);
        }
    }
    
    // PERFORMANCE FIX: Reduced frequency and smarter refresh
    startPeriodicRefresh() {
        // Increase interval from 10s to 30s for less CPU usage
        this.periodicInterval = setInterval(() => {
            this.refreshSectorsIfNeeded();
        }, 30000); // Check every 30 seconds instead of 10
    }
    
    // PERFORMANCE FIX: Add cleanup method
    stopPeriodicRefresh() {
        if (this.periodicInterval) {
            clearInterval(this.periodicInterval);
            this.periodicInterval = null;
        }
    }
    
    // Add missing methods called from other files
    async expandSectorsLocally(sectorX, sectorY) {
        // Local expansion - create adjacent sectors around a full sector
        const adjacentOffsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        
        for (const [dx, dy] of adjacentOffsets) {
            const newSectorX = sectorX + dx;
            const newSectorY = sectorY + dy;
            const sectorKey = Utils.createSectorKey(newSectorX, newSectorY);
            
            // Only create if doesn't exist
            if (!this.sectorsCache.has(sectorKey)) {
                await this.createSectorInDatabase(newSectorX, newSectorY, true);
                this.pixelCanvas.activeSectors.add(sectorKey);
            }
        }
        
        // Refresh sectors to get latest state
        await this.loadSectorsFromDatabase();
    }
    
    async updateSectorCountInDatabase(sectorX, sectorY, pixelCount) {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sectors?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    pixel_count: pixelCount
                })
            });
            
            if (response.ok) {
                // Update local cache
                const sectorKey = Utils.createSectorKey(sectorX, sectorY);
                const cachedSector = this.sectorsCache.get(sectorKey) || { pixelCount: 0, isActive: false };
                cachedSector.pixelCount = pixelCount;
                this.sectorsCache.set(sectorKey, cachedSector);
            } else {
                console.error('Failed to update sector count:', response.status);
            }
        } catch (error) {
            console.error('Failed to update sector count in database:', error);
        }
    }
    
    async checkLoadedSectorsForExpansion() {
        // PERFORMANCE FIX: Add cooldown to prevent excessive checking
        const now = Date.now();
        if (now - this.lastExpansionCheck < this.expansionCheckCooldown) {
            return; // Skip check if too soon
        }
        this.lastExpansionCheck = now;
        
        // PERFORMANCE FIX: Skip if we have too many active sectors already
        if (this.pixelCanvas.activeSectors.size > 20) {
            return;
        }
        
        // Check all loaded sectors for expansion potential
        const maxPixelsPerSector = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
        let expansionsTriggered = 0;
        
        for (const [sectorKey, sectorState] of this.sectorsCache) {
            const fillPercentage = sectorState.pixelCount / maxPixelsPerSector;
            
            if (fillPercentage >= CONFIG.SECTOR_EXPANSION_THRESHOLD) {
                const [sectorX, sectorY] = sectorKey.split(',').map(Number);
                
                
                await this.expandSectorsLocally(sectorX, sectorY);
                expansionsTriggered++;
                
                // PERFORMANCE FIX: Limit expansions per check
                if (expansionsTriggered >= 3) {
                    break;
                }
            }
        }
        
    }
}
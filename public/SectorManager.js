// Simplified Sector management for PixelCanvas - DB-driven architecture
import { CONFIG, Utils } from './Config.js';

export class SectorManager {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.sectorsCache = new Map(); // Cache for sector states from DB
        this.lastSectorUpdate = 0;
        this.sectorUpdateInterval = 30000; // Refresh every 30 seconds
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
    
    // Simple periodic refresh instead of complex expansion logic
    startPeriodicRefresh() {
        setInterval(() => {
            this.refreshSectorsIfNeeded();
        }, 10000); // Check every 10 seconds
    }
}
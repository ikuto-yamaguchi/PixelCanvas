// Quick analysis script to understand pixel distribution
import { CONFIG } from './public/Config.js';

// Simulate the NetworkManager's loadPixelsFromSupabase method
async function analyzePixelDistribution() {
    try {
        const response = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/pixels?select=*&limit=5000&offset=0', {
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const pixels = await response.json();
        console.log('Total pixels loaded: ' + pixels.length);
        
        // Analyze sector distribution
        const sectorMap = new Map();
        let minSectorX = Infinity, maxSectorX = -Infinity;
        let minSectorY = Infinity, maxSectorY = -Infinity;
        
        for (const pixel of pixels) {
            const sectorKey = pixel.sector_x + ',' + pixel.sector_y;
            sectorMap.set(sectorKey, (sectorMap.get(sectorKey) || 0) + 1);
            
            minSectorX = Math.min(minSectorX, pixel.sector_x);
            maxSectorX = Math.max(maxSectorX, pixel.sector_x);
            minSectorY = Math.min(minSectorY, pixel.sector_y);
            maxSectorY = Math.max(maxSectorY, pixel.sector_y);
        }
        
        console.log('\nSector bounds: X[' + minSectorX + ', ' + maxSectorX + '], Y[' + minSectorY + ', ' + maxSectorY + ']');
        console.log('Total sectors with pixels: ' + sectorMap.size);
        
        // Show distribution
        console.log('\nSector distribution (top 20):');
        const sortedSectors = Array.from(sectorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);
        
        for (const [sector, count] of sortedSectors) {
            console.log('  Sector ' + sector + ': ' + count + ' pixels');
        }
        
        // Check specific sectors mentioned in the issue
        console.log('\nChecking sectors (4,6) to (8,10):');
        for (let x = 4; x <= 8; x++) {
            for (let y = 6; y <= 10; y++) {
                const key = x + ',' + y;
                const count = sectorMap.get(key) || 0;
                if (count > 0) {
                    console.log('  Sector (' + x + ',' + y + '): ' + count + ' pixels');
                }
            }
        }
        
    } catch (error) {
        console.error('Failed to analyze pixels:', error);
    }
}

// Run analysis with dynamic import
(async () => {
    await analyzePixelDistribution();
})();

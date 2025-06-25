// Debug test script to check pixel loading
import { CONFIG } from './Config.js';
import { NetworkManager } from './NetworkManager.js';
import { PixelStorage } from './PixelStorage.js';

async function runPixelLoadingTest() {
    console.log('🚀 Starting pixel loading debug test...');
    
    try {
        // Create mock PixelCanvas instance
        const mockPixelCanvas = {
            pixelStorage: new PixelStorage({ deviceId: 'debug-test' }),
            activeSectors: new Set(['0,0']),
            sectorPixelCounts: new Map(),
            debugPanel: { log: console.log },
            deviceId: 'debug-test-device'
        };
        
        console.log('🔧 Mock PixelCanvas created');
        console.log('🔧 Initial pixel count:', mockPixelCanvas.pixelStorage.pixels.size);
        
        // Create NetworkManager
        const networkManager = new NetworkManager(mockPixelCanvas);
        console.log('🔧 NetworkManager created');
        
        // Wait for Supabase to initialize
        console.log('⏳ Waiting for Supabase initialization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('🔧 Supabase client status:', !!networkManager.supabaseClient);
        
        // Test direct Supabase REST API call first
        console.log('🧪 Testing direct REST API call...');
        const testUrl = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=count&limit=1`;
        console.log('🌐 Test URL:', testUrl);
        
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            credentials: 'omit'
        });
        
        console.log('📊 REST API response status:', response.status);
        console.log('📊 REST API response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ REST API response data:', data);
        } else {
            const errorText = await response.text();
            console.error('❌ REST API error:', errorText);
            return;
        }
        
        // Test pixel query
        console.log('🧪 Testing pixel query...');
        const pixelUrl = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=sector_x,sector_y,local_x,local_y,color&limit=10`;
        
        const pixelResponse = await fetch(pixelUrl, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            credentials: 'omit'
        });
        
        console.log('📊 Pixel query status:', pixelResponse.status);
        
        if (pixelResponse.ok) {
            const pixels = await pixelResponse.json();
            console.log('✅ Sample pixels:', pixels.slice(0, 5));
            console.log('📊 Total pixels received:', pixels.length);
            
            // Test adding pixels to storage
            console.log('🔧 Testing pixel storage...');
            const pixelsBefore = mockPixelCanvas.pixelStorage.pixels.size;
            
            for (const pixel of pixels.slice(0, 5)) {
                mockPixelCanvas.pixelStorage.setPixel(
                    pixel.sector_x,
                    pixel.sector_y,
                    pixel.local_x,
                    pixel.local_y,
                    pixel.color
                );
            }
            
            const pixelsAfter = mockPixelCanvas.pixelStorage.pixels.size;
            console.log(`📊 Pixels in storage: ${pixelsBefore} → ${pixelsAfter}`);
            
            // Show stored pixels
            const storedPixels = Array.from(mockPixelCanvas.pixelStorage.pixels.entries()).slice(0, 5);
            console.log('📋 Stored pixels sample:', storedPixels);
            
        } else {
            const errorText = await pixelResponse.text();
            console.error('❌ Pixel query error:', errorText);
            return;
        }
        
        // Test NetworkManager loading
        console.log('🚀 Testing NetworkManager.loadPixelsFromSupabase()...');
        await networkManager.loadPixelsFromSupabase();
        
        console.log('✅ NetworkManager loading completed');
        console.log('📊 Final pixel count:', mockPixelCanvas.pixelStorage.pixels.size);
        
        // Test render simulation
        console.log('🎨 Testing render simulation...');
        let renderCount = 0;
        for (const [key, color] of mockPixelCanvas.pixelStorage.pixels) {
            if (renderCount >= 10) break; // Limit output
            const [sectorX, sectorY, localX, localY] = key.split(',').map(Number);
            const worldX = sectorX * CONFIG.GRID_SIZE + localX;
            const worldY = sectorY * CONFIG.GRID_SIZE + localY;
            console.log(`🎨 Pixel ${renderCount}: world(${worldX},${worldY}) color=${color} palette=${CONFIG.PALETTE[color]}`);
            renderCount++;
        }
        
        console.log('✅ Debug test completed successfully!');
        
    } catch (error) {
        console.error('❌ Debug test failed:', error);
        console.error('❌ Error stack:', error.stack);
    }
}

// Auto-run test when loaded
runPixelLoadingTest();
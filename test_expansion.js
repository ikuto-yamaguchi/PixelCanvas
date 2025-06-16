// Automated expansion test script
console.log('🧪 Starting PixelCanvas Expansion Test...');

// Wait for canvas to load
setTimeout(() => {
    const canvas = window.pixelCanvas;
    if (!canvas) {
        console.error('PixelCanvas not found!');
        return;
    }
    
    console.log('✅ Canvas loaded');
    console.log(`📊 Initial state: ${canvas.activeSectors.size} sectors`);
    console.log(`🎯 Expansion threshold: ${SECTOR_EXPANSION_THRESHOLD * 100}%`);
    console.log(`📌 Will expand at ${Math.ceil(65536 * SECTOR_EXPANSION_THRESHOLD)} pixels`);
    
    // Draw pixels in a pattern
    let pixelCount = 0;
    const drawPattern = () => {
        if (pixelCount >= 10) {
            console.log(`✨ Drew ${pixelCount} pixels total`);
            console.log(`📊 Active sectors: ${canvas.activeSectors.size}`);
            console.log('🎉 Test complete!');
            return;
        }
        
        // Calculate position for centered drawing
        const centerX = canvas.canvas.width / 2;
        const centerY = canvas.canvas.height / 2;
        
        // Draw in a small square pattern
        const x = centerX + (pixelCount % 3) * 10;
        const y = centerY + Math.floor(pixelCount / 3) * 10;
        
        console.log(`🖌️ Drawing pixel ${pixelCount + 1} at (${x}, ${y})`);
        canvas.handlePixelClick(x, y);
        
        pixelCount++;
        
        // Check sector status
        const sectorKey = '0,0';
        const count = canvas.sectorPixelCounts.get(sectorKey) || 0;
        console.log(`📊 Sector (0,0): ${count} pixels`);
        
        // Continue drawing
        setTimeout(drawPattern, 500);
    };
    
    // Start drawing after a short delay
    setTimeout(drawPattern, 1000);
    
}, 2000);
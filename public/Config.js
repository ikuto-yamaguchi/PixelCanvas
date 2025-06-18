// PixelCanvas Configuration Constants
export const CONFIG = {
    // Canvas settings
    GRID_SIZE: 256,
    PIXEL_SIZE: 4,
    
    // Colors palette
    COLORS: [
        '#000000', '#FFFFFF', '#FF0000', '#00FF00',
        '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
        '#800000', '#008000', '#000080', '#808000',
        '#800080', '#008080', '#C0C0C0', '#808080'
    ],
    
    // Rate limiting
    RATE_LIMIT_MS: 1000,
    MAX_PIXEL_STOCK: 10,
    STOCK_RECOVER_MS: 1000,
    
    // Supabase configuration
    SUPABASE_URL: 'https://lgvjdefkyeuvquzckkvb.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndmpkZWZreWV1dnF1emNra3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MjMxNzEsImV4cCI6MjA2NTI5OTE3MX0.AqXyT6m78-O7X-ulzYdfBsLLMVsRoelpOUvPp9PCqiY',
    
    // Sector expansion - Fixed: was 0.0001 causing infinite expansion
    SECTOR_EXPANSION_THRESHOLD: 0.7, // 70% filled (reasonable threshold)
    
    // Debug settings
    MAX_DEBUG_LOGS: 200,
    
    // Viewport settings
    MIN_SCALE: 0.1,
    MAX_SCALE: 16,
    DEFAULT_SCALE: 2,
    VIEWPORT_MARGIN: 0.1, // 10% margin for centering
    PADDING_SECTORS: 1, // Padding around active sectors
    
    // Performance settings
    EXPANSION_DEBOUNCE_MS: 1000,
    WHEEL_DEBOUNCE_MS: 1500,
    RENDER_BATCH_MS: 100,
    MAX_GRID_LINES: 1000,
    
    // Touch settings
    TAP_DURATION_MS: 200,
    TOUCH_MOVEMENT_THRESHOLD: 10,
    MOUSE_MOVEMENT_THRESHOLD: 5,
    MULTI_TOUCH_DELAY_MS: 200,
    TOUCH_RESET_DELAY_MS: 100
};

// Utility functions
export const Utils = {
    // Generate unique device ID
    generateDeviceId() {
        const stored = localStorage.getItem('pixelcanvas_device_id');
        if (stored) return stored;
        
        const id = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('pixelcanvas_device_id', id);
        return id;
    },
    
    // Get current timestamp
    getTimestamp() {
        return new Date().toLocaleTimeString();
    },
    
    // Clamp value between min and max
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    // Parse sector key "x,y" to [x, y]
    parseSectorKey(sectorKey) {
        return sectorKey.split(',').map(Number);
    },
    
    // Create sector key from coordinates
    createSectorKey(x, y) {
        return `${x},${y}`;
    },
    
    // Parse pixel key "sectorX,sectorY,localX,localY" to components
    parsePixelKey(pixelKey) {
        return pixelKey.split(',').map(Number);
    },
    
    // Create pixel key from coordinates
    createPixelKey(sectorX, sectorY, localX, localY) {
        return `${sectorX},${sectorY},${localX},${localY}`;
    },
    
    // Convert local coordinates to world coordinates
    localToWorld(sectorX, sectorY, localX, localY) {
        return {
            x: sectorX * CONFIG.GRID_SIZE + localX,
            y: sectorY * CONFIG.GRID_SIZE + localY
        };
    },
    
    // Convert world coordinates to sector and local coordinates
    worldToLocal(worldX, worldY) {
        const sectorX = Math.floor(worldX / CONFIG.GRID_SIZE);
        const sectorY = Math.floor(worldY / CONFIG.GRID_SIZE);
        const localX = worldX - sectorX * CONFIG.GRID_SIZE;
        const localY = worldY - sectorY * CONFIG.GRID_SIZE;
        
        return { sectorX, sectorY, localX, localY };
    },
    
    // Calculate distance between two touch points
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    // Calculate center point between two touches
    getTouchCenter(touch1, touch2, rect) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
            y: (touch1.clientY + touch2.clientY) / 2 - rect.top
        };
    },
    
    // Get coordinates from event (mouse or touch)
    getEventCoords(e, rect) {
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
        return { x, y };
    },
    
    // Debounce function execution
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};
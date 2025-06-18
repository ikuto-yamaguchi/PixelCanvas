// PixiJS CDN フォールバック システム
(function() {
    let loadAttempts = 0;
    const maxAttempts = 3;
    
    const cdnUrls = [
        // Primary CDN
        {
            pixi: 'https://cdn.jsdelivr.net/npm/pixi.js@7.3.0/dist/pixi.min.js',
            tilemap: 'https://cdn.jsdelivr.net/npm/@pixi/tilemap@4.2.0/dist/pixi-tilemap.umd.js',
            viewport: 'https://cdn.jsdelivr.net/npm/pixi-viewport@5.0.0/dist/viewport.min.js'
        },
        // Fallback CDNs
        {
            pixi: 'https://unpkg.com/pixi.js@7.3.0/dist/pixi.min.js',
            tilemap: 'https://unpkg.com/@pixi/tilemap@4.2.0/dist/pixi-tilemap.umd.js',
            viewport: 'https://unpkg.com/pixi-viewport@5.0.0/dist/viewport.min.js'
        },
        {
            pixi: 'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.0/pixi.min.js',
            tilemap: null, // Not available on cdnjs
            viewport: null
        }
    ];
    
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    async function loadPixiJS(cdnSet) {
        try {
            console.log(`🔄 Loading PixiJS from CDN attempt ${loadAttempts + 1}...`);
            
            // Load PIXI first
            await loadScript(cdnSet.pixi);
            
            if (!window.PIXI) {
                throw new Error('PIXI object not found after loading');
            }
            
            // Load tilemap if available
            if (cdnSet.tilemap) {
                await loadScript(cdnSet.tilemap);
            }
            
            // Load viewport if available
            if (cdnSet.viewport) {
                await loadScript(cdnSet.viewport);
            }
            
            console.log('✅ PixiJS loaded successfully');
            return true;
            
        } catch (error) {
            console.warn(`❌ CDN attempt ${loadAttempts + 1} failed:`, error);
            return false;
        }
    }
    
    async function ensurePixiJS() {
        // Check if already loaded
        if (window.PIXI) {
            console.log('✅ PixiJS already loaded');
            return true;
        }
        
        while (loadAttempts < maxAttempts) {
            const success = await loadPixiJS(cdnUrls[loadAttempts]);
            if (success) return true;
            
            loadAttempts++;
        }
        
        console.error('❌ All PixiJS CDN attempts failed');
        return false;
    }
    
    // Auto-load when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePixiJS);
    } else {
        ensurePixiJS();
    }
    
    // Export for manual retry
    window.loadPixiJS = ensurePixiJS;
})();
// Force viewport fix for mobile visibility
export function createFixViewportButton() {
    const button = document.createElement('button');
    button.textContent = '📱 Mobile Fix';
    button.style.cssText = `
        position: fixed;
        top: 90px;
        right: 10px;
        z-index: 10000;
        background: #FF6B35;
        border: none;
        border-radius: 5px;
        padding: 8px 12px;
        color: white;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    button.addEventListener('click', () => {
        const pixelCanvas = window.pixelCanvas;
        if (pixelCanvas) {
            console.log('📱 Applying mobile viewport fix...');
            
            // Force mobile-optimized settings
            pixelCanvas.scale = 2.0; // Larger scale for visibility
            pixelCanvas.offsetX = 20;
            pixelCanvas.offsetY = 20;
            
            console.log('📱 Mobile fix applied: scale=2.0, offset=(20,20)');
            
            // Force render
            pixelCanvas.render();
            
            button.textContent = '✅ Fixed';
            button.style.background = '#4CAF50';
            
            setTimeout(() => {
                button.textContent = '📱 Mobile Fix';
                button.style.background = '#FF6B35';
            }, 2000);
        } else {
            console.error('❌ PixelCanvas not available');
        }
    });
    
    document.body.appendChild(button);
    return button;
}

// Auto-create button
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        setTimeout(() => {
            createFixViewportButton();
        }, 3000);
    });
}
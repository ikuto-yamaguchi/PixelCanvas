// Event handling for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class EventHandlers {
    constructor(canvas, pixelCanvas) {
        this.canvas = canvas;
        this.pixelCanvas = pixelCanvas;
        
        // Touch state
        this.touchState = {
            startTime: 0,
            startX: 0,
            startY: 0,
            initialOffsetX: 0,
            initialOffsetY: 0,
            initialScale: 1,
            initialDistance: 0,
            initialCenterX: 0,
            initialCenterY: 0,
            moved: false,
            touches: 0,
            wasMultiTouch: false,
            gestureEndTime: 0
        };
        
        // PERFORMANCE FIX: Throttle rendering to prevent excessive calls
        this.lastRenderTime = 0;
        this.renderThrottle = 16; // ~60 FPS limit
        this.lastTouchMoveTime = 0; // Touch move throttling
        
        // Mouse state
        this.mouseState = {
            down: false,
            startX: 0,
            startY: 0,
            initialOffsetX: 0,
            initialOffsetY: 0
        };
        
        this.setupEventListeners();
    }
    
    // PERFORMANCE FIX: Throttled render method
    throttledRender() {
        const now = performance.now();
        if (now - this.lastRenderTime >= this.renderThrottle) {
            this.pixelCanvas.render();
            this.lastRenderTime = now;
        }
    }
    
    setupEventListeners() {
        this.setupGridToggle();
        this.setupTouchHandlers();
        this.setupMouseHandlers();
        this.setupWheelZoom();
    }
    
    setupGridToggle() {
        const gridToggle = document.getElementById('gridToggle');
        if (gridToggle) {
            gridToggle.addEventListener('click', () => {
                this.pixelCanvas.showGrid = !this.pixelCanvas.showGrid;
                gridToggle.classList.toggle('active', this.pixelCanvas.showGrid);
                this.pixelCanvas.render();
            });
        }
    }
    
    setupTouchHandlers() {
        // Use passive listeners for single-touch to prevent scroll interference
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
    }
    
    handleTouchStart(e) {
        // Note: passive:true listener cannot call preventDefault
        
        const now = Date.now();
        const previousTouches = this.touchState.touches;
        this.touchState.touches = e.touches.length;
        this.touchState.startTime = now;
        
        // Ignore single touch after multi-touch gesture
        if (previousTouches > 1 && e.touches.length === 1 && 
            (now - this.touchState.gestureEndTime < CONFIG.MULTI_TOUCH_DELAY_MS)) {
            this.touchState.moved = true;
            return;
        }
        
        this.touchState.moved = false;
        
        // EMERGENCY FIX: Reset wasMultiTouch for single touch
        if (e.touches.length === 1) {
            this.touchState.wasMultiTouch = false;
            this.handleSingleTouchStart(e, previousTouches);
        } else if (e.touches.length === 2) {
            this.handleMultiTouchStart(e);
        }
    }
    
    handleSingleTouchStart(e, previousTouches) {
        if (previousTouches <= 1) {
            const coords = this.getCoords(e);
            this.touchState.startX = coords.x;
            this.touchState.startY = coords.y;
            this.touchState.initialOffsetX = this.pixelCanvas.offsetX;
            this.touchState.initialOffsetY = this.pixelCanvas.offsetY;
        }
        this.touchState.wasMultiTouch = false;
    }
    
    handleMultiTouchStart(e) {
        this.touchState.wasMultiTouch = true;
        this.touchState.initialDistance = Utils.getTouchDistance(e.touches[0], e.touches[1]);
        this.touchState.initialScale = this.pixelCanvas.scale;
        
        const rect = this.canvas.getBoundingClientRect();
        const center = Utils.getTouchCenter(e.touches[0], e.touches[1], rect);
        this.touchState.initialCenterX = center.x;
        this.touchState.initialCenterY = center.y;
        this.touchState.initialOffsetX = this.pixelCanvas.offsetX;
        this.touchState.initialOffsetY = this.pixelCanvas.offsetY;
    }
    
    handleTouchMove(e) {
        // Only prevent default for specific touch interactions to avoid scroll interference
        if (e.touches.length > 1 || this.touchState.touches > 1) {
            e.preventDefault();
        }
        
        // Throttle touch move events for performance
        const now = performance.now();
        if (now - this.lastTouchMoveTime < 16) { // ~60fps throttling
            return;
        }
        this.lastTouchMoveTime = now;
        
        if (e.touches.length === 1 && this.touchState.touches === 1 && !this.touchState.wasMultiTouch) {
            this.handleSingleTouchMove(e);
        } else if (e.touches.length === 2 && this.touchState.touches === 2) {
            this.handleMultiTouchMove(e);
        }
    }
    
    handleSingleTouchMove(e) {
        const coords = this.getCoords(e);
        const dx = coords.x - this.touchState.startX;
        const dy = coords.y - this.touchState.startY;
        
        if (Math.abs(dx) > CONFIG.TOUCH_MOVEMENT_THRESHOLD || Math.abs(dy) > CONFIG.TOUCH_MOVEMENT_THRESHOLD) {
            this.touchState.moved = true;
            this.pixelCanvas.offsetX = this.touchState.initialOffsetX + dx;
            this.pixelCanvas.offsetY = this.touchState.initialOffsetY + dy;
            this.pixelCanvas.constrainViewport();
            this.throttledRender(); // PERFORMANCE FIX: Use throttled render
        }
    }
    
    handleMultiTouchMove(e) {
        const distance = Utils.getTouchDistance(e.touches[0], e.touches[1]);
        const scaleChange = distance / this.touchState.initialDistance;
        const newScale = Utils.clamp(
            this.touchState.initialScale * scaleChange, 
            CONFIG.MIN_SCALE, 
            CONFIG.MAX_SCALE
        );
        
        const centerX = this.touchState.initialCenterX;
        const centerY = this.touchState.initialCenterY;
        const scaleFactor = newScale / this.touchState.initialScale;
        
        this.pixelCanvas.offsetX = centerX - (centerX - this.touchState.initialOffsetX) * scaleFactor;
        this.pixelCanvas.offsetY = centerY - (centerY - this.touchState.initialOffsetY) * scaleFactor;
        this.pixelCanvas.scale = newScale;
        
        this.pixelCanvas.constrainViewport();
        this.throttledRender(); // PERFORMANCE FIX: Use throttled render
        this.touchState.moved = true;
    }
    
    handleTouchEnd(e) {
        // Note: passive:true listener cannot call preventDefault
        
        const now = Date.now();
        
        // Handle tap for pixel drawing
        // CRITICAL FIX: touchend event has e.touches.length === 0 for single tap
        if (this.touchState.touches === 1 && e.touches.length === 0) {
            const tapDuration = now - this.touchState.startTime;
            
            
            // 🔧 FIXED: Prevent pixel drawing during zoom/pan operations
            if (tapDuration < 1000 && !this.touchState.moved && !this.touchState.wasMultiTouch) {
                this.pixelCanvas.handlePixelClick(this.touchState.startX, this.touchState.startY);
            } else {
            }
        } else {
            });
        }
        
        // Record multi-touch gesture end time
        if (this.touchState.touches > 1 && e.touches.length <= 1) {
            this.touchState.gestureEndTime = now;
            this.touchState.wasMultiTouch = true;
        }
        
        // Schedule expansion check on movement
        this.scheduleExpansionCheck();
        
        // Update touch state
        this.updateTouchState(e, now);
    }
    
    scheduleExpansionCheck() {
        if (this.touchState.moved && !this.pixelCanvas.isExpansionRunning) {
            setTimeout(() => {
                if (!this.pixelCanvas.isExpansionRunning) {
                    this.pixelCanvas.sectorManager.checkLoadedSectorsForExpansion();
                }
            }, CONFIG.EXPANSION_DEBOUNCE_MS);
        }
    }
    
    updateTouchState(e, now) {
        const previousTouches = this.touchState.touches;
        this.touchState.touches = e.touches.length;
        
        if (e.touches.length === 0) {
            this.touchState.moved = false;
            this.touchState.wasMultiTouch = false;
        }
        
        // Reset single touch state when transitioning from multi-touch
        if (previousTouches > 1 && e.touches.length === 1) {
            setTimeout(() => {
                if (this.touchState.touches === 1) {
                    const coords = this.getCoords(e);
                    this.touchState.startX = coords.x;
                    this.touchState.startY = coords.y;
                    this.touchState.initialOffsetX = this.pixelCanvas.offsetX;
                    this.touchState.initialOffsetY = this.pixelCanvas.offsetY;
                    this.touchState.moved = false;
                    this.touchState.wasMultiTouch = false;
                }
            }, CONFIG.TOUCH_RESET_DELAY_MS);
        }
    }
    
    setupMouseHandlers() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }
    
    handleMouseDown(e) {
        e.preventDefault();
        this.mouseState.down = true;
        const coords = this.getCoords(e);
        this.mouseState.startX = coords.x;
        this.mouseState.startY = coords.y;
        this.mouseState.initialOffsetX = this.pixelCanvas.offsetX;
        this.mouseState.initialOffsetY = this.pixelCanvas.offsetY;
    }
    
    handleMouseMove(e) {
        e.preventDefault();
        if (!this.mouseState.down) return;
        
        const coords = this.getCoords(e);
        const dx = coords.x - this.mouseState.startX;
        const dy = coords.y - this.mouseState.startY;
        
        this.pixelCanvas.offsetX = this.mouseState.initialOffsetX + dx;
        this.pixelCanvas.offsetY = this.mouseState.initialOffsetY + dy;
        this.pixelCanvas.constrainViewport();
        this.throttledRender(); // PERFORMANCE FIX: Use throttled render
    }
    
    handleMouseUp(e) {
        e.preventDefault();
        if (!this.mouseState.down) return;
        
        const coords = this.getCoords(e);
        const dx = coords.x - this.mouseState.startX;
        const dy = coords.y - this.mouseState.startY;
        
        // Handle click vs drag
        if (Math.abs(dx) < CONFIG.MOUSE_MOVEMENT_THRESHOLD && Math.abs(dy) < CONFIG.MOUSE_MOVEMENT_THRESHOLD) {
            this.pixelCanvas.handlePixelClick(this.mouseState.startX, this.mouseState.startY);
        } else if (!this.pixelCanvas.isExpansionRunning) {
            setTimeout(() => {
                if (!this.pixelCanvas.isExpansionRunning) {
                    this.pixelCanvas.sectorManager.checkLoadedSectorsForExpansion();
                }
            }, CONFIG.EXPANSION_DEBOUNCE_MS);
        }
        
        this.mouseState.down = false;
    }
    
    handleMouseLeave() {
        this.mouseState.down = false;
    }
    
    setupWheelZoom() {
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    }
    
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Utils.clamp(this.pixelCanvas.scale * delta, CONFIG.MIN_SCALE, CONFIG.MAX_SCALE);
        
        const scaleFactor = newScale / this.pixelCanvas.scale;
        this.pixelCanvas.offsetX = mouseX - (mouseX - this.pixelCanvas.offsetX) * scaleFactor;
        this.pixelCanvas.offsetY = mouseY - (mouseY - this.pixelCanvas.offsetY) * scaleFactor;
        this.pixelCanvas.scale = newScale;
        
        this.pixelCanvas.constrainViewport();
        this.throttledRender(); // PERFORMANCE FIX: Use throttled render
        
        // Schedule expansion check after zoom
        if (!this.pixelCanvas.isExpansionRunning) {
            setTimeout(() => {
                if (!this.pixelCanvas.isExpansionRunning) {
                    this.pixelCanvas.sectorManager.checkLoadedSectorsForExpansion();
                }
            }, CONFIG.WHEEL_DEBOUNCE_MS);
        }
    }
    
    getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return Utils.getEventCoords(e, rect);
    }
}
// イベント処理統合管理
import { CONFIG } from '../../Config.js';

/**
 * イベント処理統合管理クラス
 * マウス、タッチ、キーボードイベントを統一管理
 */
export class EventManager {
    constructor(canvas, viewportManager) {
        this.canvas = canvas;
        this.viewportManager = viewportManager;
        
        // イベントリスナー
        this.pixelClickListeners = new Set();
        this.viewportChangeListeners = new Set();
        this.gestureListeners = new Set();
        
        // イベント状態
        this.isPointerDown = false;
        this.lastPointerTime = 0;
        this.pointerStartPos = null;
        this.currentPointers = new Map(); // マルチタッチ対応
        
        // ジェスチャー検出
        this.gestureState = {
            isGesturing: false,
            initialDistance: 0,
            initialScale: 1,
            initialCenter: null
        };
        
        // イベント制御
        this.eventThrottle = 16; // 60fps制限
        this.clickThreshold = 5; // ピクセル
        this.longPressDelay = 500; // ロングプレス判定時間
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        this.setupEventListeners();
        console.log('🖱️ EventManager initialized');
    }
    
    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        // マウスイベント
        this.canvas.addEventListener('mousedown', this.handlePointerStart.bind(this));
        this.canvas.addEventListener('mousemove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handlePointerEnd.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // タッチイベント
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: true });
        
        // キーボードイベント
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        // その他
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
    
    /**
     * ポインター開始処理（統一）
     */
    handlePointerStart(event) {
        event.preventDefault();
        
        const pointer = this.getPointerInfo(event);
        this.currentPointers.set(pointer.id, pointer);
        
        this.isPointerDown = true;
        this.lastPointerTime = performance.now();
        this.pointerStartPos = { x: pointer.x, y: pointer.y };
        
        // マルチタッチジェスチャー開始
        if (this.currentPointers.size === 2) {
            this.startGesture();
        }
        
        console.log(`🖱️ Pointer start: ${pointer.x}, ${pointer.y} (id: ${pointer.id})`);
    }
    
    /**
     * ポインター移動処理（統一）
     */
    handlePointerMove(event) {
        if (!this.isPointerDown) return;
        
        const now = performance.now();
        if (now - this.lastPointerTime < this.eventThrottle) {
            return; // スロットリング
        }
        this.lastPointerTime = now;
        
        event.preventDefault();
        
        const pointer = this.getPointerInfo(event);
        const oldPointer = this.currentPointers.get(pointer.id);
        
        if (!oldPointer) return;
        
        this.currentPointers.set(pointer.id, pointer);
        
        if (this.currentPointers.size === 1) {
            // 単一ポインター：パン操作
            this.handlePan(pointer, oldPointer);
        } else if (this.currentPointers.size === 2) {
            // マルチタッチ：ピンチズーム
            this.handlePinchZoom();
        }
    }
    
    /**
     * ポインター終了処理（統一）
     */
    handlePointerEnd(event) {
        const pointer = this.getPointerInfo(event);
        const startPointer = this.currentPointers.get(pointer.id);
        
        if (startPointer) {
            const distance = this.calculateDistance(
                this.pointerStartPos,
                { x: pointer.x, y: pointer.y }
            );
            
            const duration = performance.now() - this.lastPointerTime;
            
            // クリック判定
            if (distance < this.clickThreshold && duration < this.longPressDelay) {
                this.handleClick(pointer);
            }
        }
        
        this.currentPointers.delete(pointer.id);
        
        if (this.currentPointers.size === 0) {
            this.isPointerDown = false;
            this.gestureState.isGesturing = false;
        }
        
        console.log(`🖱️ Pointer end: ${pointer.x}, ${pointer.y} (remaining: ${this.currentPointers.size})`);
    }
    
    /**
     * タッチ開始処理
     */
    handleTouchStart(event) {
        for (const touch of event.changedTouches) {
            this.handlePointerStart({
                ...event,
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier
            });
        }
    }
    
    /**
     * タッチ移動処理
     */
    handleTouchMove(event) {
        for (const touch of event.changedTouches) {
            this.handlePointerMove({
                ...event,
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier
            });
        }
    }
    
    /**
     * タッチ終了処理
     */
    handleTouchEnd(event) {
        for (const touch of event.changedTouches) {
            this.handlePointerEnd({
                ...event,
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier
            });
        }
    }
    
    /**
     * ホイール処理
     */
    handleWheel(event) {
        event.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const centerX = event.clientX - rect.left;
        const centerY = event.clientY - rect.top;
        
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        
        this.viewportManager.zoom(zoomFactor, centerX, centerY);
        
        console.log(`🖱️ Wheel zoom: ${zoomFactor} at (${centerX}, ${centerY})`);
    }
    
    /**
     * キーボード処理
     */
    handleKeyDown(event) {
        // ショートカットキー処理
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case '+':
                case '=':
                    event.preventDefault();
                    this.viewportManager.zoom(1.2);
                    break;
                case '-':
                    event.preventDefault();
                    this.viewportManager.zoom(0.8);
                    break;
                case '0':
                    event.preventDefault();
                    this.viewportManager.setScale(1.0);
                    break;
            }
        }
        
        // 矢印キーでパン
        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                this.viewportManager.move(0, 20);
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.viewportManager.move(0, -20);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                this.viewportManager.move(20, 0);
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.viewportManager.move(-20, 0);
                break;
        }
    }
    
    /**
     * キーアップ処理
     */
    handleKeyUp(event) {
        // 必要に応じて実装
    }
    
    /**
     * コンテキストメニュー無効化
     */
    handleContextMenu(event) {
        event.preventDefault();
    }
    
    /**
     * 可視性変更処理
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // ページが非表示になった時の処理
            this.resetEventState();
        }
    }
    
    /**
     * クリック処理
     */
    handleClick(pointer) {
        // スクリーン座標をワールド座標に変換
        const worldPos = this.viewportManager.screenToWorld(pointer.x, pointer.y);
        const worldX = Math.floor(worldPos.x);
        const worldY = Math.floor(worldPos.y);
        
        console.log(`🖱️ Click at world (${worldX}, ${worldY})`);
        
        // ピクセルクリックリスナーに通知
        this.notifyPixelClickListeners(worldX, worldY);
    }
    
    /**
     * パン処理
     */
    handlePan(currentPointer, oldPointer) {
        const deltaX = currentPointer.x - oldPointer.x;
        const deltaY = currentPointer.y - oldPointer.y;
        
        this.viewportManager.move(deltaX, deltaY);
        
        console.log(`🖱️ Pan: (${deltaX}, ${deltaY})`);
    }
    
    /**
     * ジェスチャー開始
     */
    startGesture() {
        const pointers = Array.from(this.currentPointers.values());
        if (pointers.length !== 2) return;
        
        this.gestureState.isGesturing = true;
        this.gestureState.initialDistance = this.calculateDistance(pointers[0], pointers[1]);
        this.gestureState.initialScale = this.viewportManager.getState().scale;
        this.gestureState.initialCenter = this.calculateCenter(pointers[0], pointers[1]);
        
        console.log('🖱️ Gesture started');
    }
    
    /**
     * ピンチズーム処理
     */
    handlePinchZoom() {
        const pointers = Array.from(this.currentPointers.values());
        if (pointers.length !== 2 || !this.gestureState.isGesturing) return;
        
        const currentDistance = this.calculateDistance(pointers[0], pointers[1]);
        const currentCenter = this.calculateCenter(pointers[0], pointers[1]);
        
        const scaleChange = currentDistance / this.gestureState.initialDistance;
        const newScale = this.gestureState.initialScale * scaleChange;
        
        this.viewportManager.setScale(newScale, currentCenter.x, currentCenter.y);
        
        console.log(`🖱️ Pinch zoom: ${scaleChange.toFixed(2)}`);
    }
    
    /**
     * ポインター情報取得
     */
    getPointerInfo(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            id: event.pointerId || event.identifier || 'mouse',
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            timestamp: performance.now()
        };
    }
    
    /**
     * 距離計算
     */
    calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 中心点計算
     */
    calculateCenter(point1, point2) {
        return {
            x: (point1.x + point2.x) / 2,
            y: (point1.y + point2.y) / 2
        };
    }
    
    /**
     * イベント状態リセット
     */
    resetEventState() {
        this.isPointerDown = false;
        this.currentPointers.clear();
        this.gestureState.isGesturing = false;
        console.log('🖱️ Event state reset');
    }
    
    /**
     * ピクセルクリックリスナー追加
     */
    addPixelClickListener(listener) {
        this.pixelClickListeners.add(listener);
    }
    
    /**
     * ピクセルクリックリスナー削除
     */
    removePixelClickListener(listener) {
        this.pixelClickListeners.delete(listener);
    }
    
    /**
     * ピクセルクリックリスナー通知
     */
    notifyPixelClickListeners(worldX, worldY) {
        this.pixelClickListeners.forEach(listener => {
            try {
                listener(worldX, worldY);
            } catch (error) {
                console.error('🖱️ Pixel click listener error:', error);
            }
        });
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        if (newConfig.eventThrottle !== undefined) {
            this.eventThrottle = newConfig.eventThrottle;
        }
        if (newConfig.clickThreshold !== undefined) {
            this.clickThreshold = newConfig.clickThreshold;
        }
        if (newConfig.longPressDelay !== undefined) {
            this.longPressDelay = newConfig.longPressDelay;
        }
        
        console.log('🖱️ EventManager config updated');
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            isPointerDown: this.isPointerDown,
            activePointers: this.currentPointers.size,
            isGesturing: this.gestureState.isGesturing,
            listenerCounts: {
                pixelClick: this.pixelClickListeners.size,
                viewportChange: this.viewportChangeListeners.size,
                gesture: this.gestureListeners.size
            },
            config: {
                eventThrottle: this.eventThrottle,
                clickThreshold: this.clickThreshold,
                longPressDelay: this.longPressDelay
            }
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        // イベントリスナー削除
        this.canvas.removeEventListener('mousedown', this.handlePointerStart);
        this.canvas.removeEventListener('mousemove', this.handlePointerMove);
        this.canvas.removeEventListener('mouseup', this.handlePointerEnd);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
        
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        
        // 状態クリア
        this.resetEventState();
        this.pixelClickListeners.clear();
        this.viewportChangeListeners.clear();
        this.gestureListeners.clear();
        
        console.log('🖱️ EventManager destroyed');
    }
}
// ビューポート管理システム
import { CONFIG } from '../../Config.js';

/**
 * ビューポート管理クラス
 * 表示領域、座標変換、制約を統一管理
 */
export class ViewportManager {
    constructor() {
        // ビューポート状態
        this.scale = CONFIG.DEFAULT_SCALE || 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.canvasWidth = 800;
        this.canvasHeight = 600;
        this.isInitialized = false;
        
        // 制約設定
        this.minScale = CONFIG.MIN_SCALE || 0.1;
        this.maxScale = CONFIG.MAX_SCALE || 10.0;
        this.bounds = null; // ビューポート境界制限
        
        // 変更通知
        this.changeListeners = new Set();
        this.lastNotifiedState = null;
        
        console.log('🗺️ ViewportManager initialized');
    }
    
    /**
     * 初期フォーカス設定（セクター0,0を中央に表示）
     */
    initializeDefaultView() {
        // セクター(0,0)の中央にフォーカス
        const sectorCenterX = CONFIG.GRID_SIZE / 2;
        const sectorCenterY = CONFIG.GRID_SIZE / 2;
        
        // 画面中央に配置するためのオフセット計算
        this.offsetX = this.canvasWidth / 2 - sectorCenterX * CONFIG.PIXEL_SIZE * this.scale;
        this.offsetY = this.canvasHeight / 2 - sectorCenterY * CONFIG.PIXEL_SIZE * this.scale;
        
        this.isInitialized = true;
        this.notifyChange();
        
        console.log(`🎯 Viewport focused on sector (0,0) at scale ${this.scale}`);
        console.log(`🎯 Offset: (${this.offsetX.toFixed(2)}, ${this.offsetY.toFixed(2)})`);
    }
    
    /**
     * キャンバスサイズ設定
     */
    setCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.notifyChange();
    }
    
    /**
     * スケール設定（制約適用）
     */
    setScale(newScale, centerX = null, centerY = null) {
        const oldScale = this.scale;
        this.scale = this.clampScale(newScale);
        
        // ズーム中心点を指定した場合の座標調整
        if (centerX !== null && centerY !== null && oldScale !== this.scale) {
            const scaleFactor = this.scale / oldScale;
            this.offsetX = centerX - (centerX - this.offsetX) * scaleFactor;
            this.offsetY = centerY - (centerY - this.offsetY) * scaleFactor;
        }
        
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * オフセット設定
     */
    setOffset(x, y) {
        this.offsetX = x;
        this.offsetY = y;
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * 相対移動
     */
    move(deltaX, deltaY) {
        this.offsetX += deltaX;
        this.offsetY += deltaY;
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * ズーム実行
     */
    zoom(factor, centerX = null, centerY = null) {
        this.setScale(this.scale * factor, centerX, centerY);
    }
    
    /**
     * 指定座標にフォーカス
     */
    focusOn(worldX, worldY, targetScale = null) {
        if (targetScale !== null) {
            this.scale = this.clampScale(targetScale);
        }
        
        // 画面中央に配置
        this.offsetX = this.canvasWidth / 2 - worldX * CONFIG.PIXEL_SIZE * this.scale;
        this.offsetY = this.canvasHeight / 2 - worldY * CONFIG.PIXEL_SIZE * this.scale;
        
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * セクターにフォーカス
     */
    focusOnSector(sectorX, sectorY, targetScale = null) {
        const centerX = sectorX * CONFIG.GRID_SIZE + CONFIG.GRID_SIZE / 2;
        const centerY = sectorY * CONFIG.GRID_SIZE + CONFIG.GRID_SIZE / 2;
        this.focusOn(centerX, centerY, targetScale);
    }
    
    /**
     * スケール制約適用
     */
    clampScale(scale) {
        return Math.max(this.minScale, Math.min(this.maxScale, scale));
    }
    
    /**
     * ビューポート制約適用
     */
    applyConstraints() {
        if (!this.bounds) return;
        
        // 境界制限がある場合の処理
        const { minX, minY, maxX, maxY } = this.bounds;
        
        // 最小表示領域を確保
        const minOffsetX = this.canvasWidth - maxX * CONFIG.PIXEL_SIZE * this.scale;
        const maxOffsetX = -minX * CONFIG.PIXEL_SIZE * this.scale;
        const minOffsetY = this.canvasHeight - maxY * CONFIG.PIXEL_SIZE * this.scale;
        const maxOffsetY = -minY * CONFIG.PIXEL_SIZE * this.scale;
        
        this.offsetX = Math.max(minOffsetX, Math.min(maxOffsetX, this.offsetX));
        this.offsetY = Math.max(minOffsetY, Math.min(maxOffsetY, this.offsetY));
    }
    
    /**
     * 境界設定
     */
    setBounds(minX, minY, maxX, maxY) {
        this.bounds = { minX, minY, maxX, maxY };
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * 境界削除
     */
    clearBounds() {
        this.bounds = null;
        this.notifyChange();
    }
    
    /**
     * 座標変換: スクリーン → ワールド
     */
    screenToWorld(screenX, screenY) {
        const worldX = (screenX - this.offsetX) / (CONFIG.PIXEL_SIZE * this.scale);
        const worldY = (screenY - this.offsetY) / (CONFIG.PIXEL_SIZE * this.scale);
        return { x: worldX, y: worldY };
    }
    
    /**
     * 座標変換: ワールド → スクリーン  
     */
    worldToScreen(worldX, worldY) {
        const screenX = worldX * CONFIG.PIXEL_SIZE * this.scale + this.offsetX;
        const screenY = worldY * CONFIG.PIXEL_SIZE * this.scale + this.offsetY;
        return { x: screenX, y: screenY };
    }
    
    /**
     * 可視ワールド範囲取得
     */
    getVisibleWorldBounds() {
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.canvasWidth, this.canvasHeight);
        
        return {
            minX: Math.floor(topLeft.x),
            minY: Math.floor(topLeft.y),
            maxX: Math.ceil(bottomRight.x),
            maxY: Math.ceil(bottomRight.y),
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
    }
    
    /**
     * 可視セクター範囲取得
     */
    getVisibleSectors() {
        const worldBounds = this.getVisibleWorldBounds();
        
        return {
            minSectorX: Math.floor(worldBounds.minX / CONFIG.GRID_SIZE),
            minSectorY: Math.floor(worldBounds.minY / CONFIG.GRID_SIZE),
            maxSectorX: Math.ceil(worldBounds.maxX / CONFIG.GRID_SIZE),
            maxSectorY: Math.ceil(worldBounds.maxY / CONFIG.GRID_SIZE)
        };
    }
    
    /**
     * ビューポート状態取得
     */
    getState() {
        return {
            scale: this.scale,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            bounds: this.bounds ? { ...this.bounds } : null,
            visibleBounds: this.getVisibleWorldBounds(),
            visibleSectors: this.getVisibleSectors()
        };
    }
    
    /**
     * ビューポート状態設定
     */
    setState(state) {
        this.scale = this.clampScale(state.scale || this.scale);
        this.offsetX = state.offsetX || this.offsetX;
        this.offsetY = state.offsetY || this.offsetY;
        
        if (state.canvasWidth && state.canvasHeight) {
            this.setCanvasSize(state.canvasWidth, state.canvasHeight);
        }
        
        if (state.bounds) {
            this.setBounds(state.bounds.minX, state.bounds.minY, 
                          state.bounds.maxX, state.bounds.maxY);
        }
        
        this.applyConstraints();
        this.notifyChange();
    }
    
    /**
     * 変更リスナー追加
     */
    addChangeListener(listener) {
        this.changeListeners.add(listener);
    }
    
    /**
     * 変更リスナー削除
     */
    removeChangeListener(listener) {
        this.changeListeners.delete(listener);
    }
    
    /**
     * 変更通知
     */
    notifyChange() {
        const currentState = this.getState();
        
        // 状態が実際に変更された場合のみ通知
        if (!this.isStateSame(currentState, this.lastNotifiedState)) {
            this.lastNotifiedState = currentState;
            
            this.changeListeners.forEach(listener => {
                try {
                    listener(currentState);
                } catch (error) {
                    console.error('🗺️ Viewport change listener error:', error);
                }
            });
        }
    }
    
    /**
     * 状態比較
     */
    isStateSame(state1, state2) {
        if (!state1 || !state2) return false;
        
        return Math.abs(state1.scale - state2.scale) < 0.001 &&
               Math.abs(state1.offsetX - state2.offsetX) < 0.1 &&
               Math.abs(state1.offsetY - state2.offsetY) < 0.1;
    }
    
    /**
     * デバッグ情報出力
     */
    debugInfo() {
        const state = this.getState();
        console.log('🗺️ Viewport Debug Info:', {
            scale: state.scale.toFixed(3),
            offset: `(${state.offsetX.toFixed(1)}, ${state.offsetY.toFixed(1)})`,
            canvas: `${state.canvasWidth}x${state.canvasHeight}`,
            visibleWorld: `${state.visibleBounds.width.toFixed(1)}x${state.visibleBounds.height.toFixed(1)}`,
            visibleSectors: `${state.visibleSectors.maxSectorX - state.visibleSectors.minSectorX + 1}x${state.visibleSectors.maxSectorY - state.visibleSectors.minSectorY + 1}`,
            bounds: state.bounds ? 'Set' : 'None'
        });
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.changeListeners.clear();
        this.lastNotifiedState = null;
        console.log('🗺️ ViewportManager destroyed');
    }
}
// UI制御管理システム
import { CONFIG } from '../../Config.js';

/**
 * UI制御統合管理クラス
 * カラーパレット、ツールバー、ステータス表示などを統一管理
 */
export class ControlsManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        
        // DOM要素
        this.colorPalette = document.getElementById('colorPalette');
        this.pixelCountDisplay = document.getElementById('pixelCount');
        this.gridToggle = document.getElementById('gridToggle');
        this.statusIndicator = document.getElementById('status');
        this.cooldownIndicator = document.getElementById('cooldownIndicator');
        
        // UI状態
        this.currentColorIndex = 0;
        this.pixelCount = 0;
        this.isGridVisible = false;
        this.isOnline = navigator.onLine;
        
        // クールダウン管理
        this.cooldownEndTime = 0;
        this.cooldownTimer = null;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        this.setupColorPalette();
        this.setupToolbar();
        this.setupStatusDisplay();
        this.setupStateListeners();
        
        // 初期状態の同期
        this.syncWithState();
        
        console.log('🎮 ControlsManager initialized');
    }
    
    /**
     * カラーパレット設定
     */
    setupColorPalette() {
        if (!this.colorPalette) {
            console.warn('🎮 Color palette element not found');
            return;
        }
        
        // 既存のカラーボタンにイベントリスナーを追加
        const colorButtons = this.colorPalette.querySelectorAll('.color-button');
        
        colorButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                this.selectColor(index);
            });
            
            // カラーインデックスをdata属性として設定
            if (!button.dataset.color) {
                button.dataset.color = index.toString();
            }
        });
        
        // 初期カラー選択
        this.selectColor(0);
        
        console.log(`🎮 Color palette setup: ${colorButtons.length} colors`);
    }
    
    /**
     * ツールバー設定
     */
    setupToolbar() {
        // グリッドトグル
        if (this.gridToggle) {
            this.gridToggle.addEventListener('click', () => {
                this.toggleGrid();
            });
        }
        
        // その他のツールボタンがあれば設定
        const toolButtons = document.querySelectorAll('[data-tool]');
        toolButtons.forEach(button => {
            const tool = button.dataset.tool;
            button.addEventListener('click', () => {
                this.selectTool(tool);
            });
        });
    }
    
    /**
     * ステータス表示設定
     */
    setupStatusDisplay() {
        // 初期表示
        this.updatePixelCount(0);
        this.updateConnectionStatus(navigator.onLine);
        
        // オンライン状態監視
        window.addEventListener('online', () => {
            this.updateConnectionStatus(true);
        });
        
        window.addEventListener('offline', () => {
            this.updateConnectionStatus(false);
        });
    }
    
    /**
     * 状態管理リスナー設定
     */
    setupStateListeners() {
        // ユーザー状態の変更を監視
        this.stateManager.addChangeListener((state, changedSections) => {
            if (changedSections.includes('user')) {
                this.syncUserState(state.user);
            }
            if (changedSections.includes('data')) {
                this.syncDataState(state.data);
            }
            if (changedSections.includes('connection')) {
                this.syncConnectionState(state.connection);
            }
        });
    }
    
    /**
     * カラー選択
     */
    selectColor(colorIndex) {
        if (colorIndex < 0 || colorIndex >= CONFIG.PALETTE.length) {
            console.warn(`🎮 Invalid color index: ${colorIndex}`);
            return;
        }
        
        // 前の選択を解除
        const prevButton = this.colorPalette?.querySelector('.color-button.selected');
        if (prevButton) {
            prevButton.classList.remove('selected');
        }
        
        // 新しい選択を適用
        const newButton = this.colorPalette?.querySelector(`[data-color="${colorIndex}"]`);
        if (newButton) {
            newButton.classList.add('selected');
        }
        
        this.currentColorIndex = colorIndex;
        
        // 状態管理に反映
        this.stateManager.setCurrentColor(colorIndex);
        
        console.log(`🎮 Color selected: ${colorIndex} (${CONFIG.PALETTE[colorIndex]})`);
    }
    
    /**
     * グリッド表示切り替え
     */
    toggleGrid() {
        this.isGridVisible = !this.isGridVisible;
        
        // ボタンの状態更新
        if (this.gridToggle) {
            this.gridToggle.classList.toggle('active', this.isGridVisible);
        }
        
        // 状態管理に反映
        this.stateManager.updateSection('user', {
            preferences: {
                ...this.stateManager.getState('user').preferences,
                showGrid: this.isGridVisible
            }
        });
        
        console.log(`🎮 Grid visibility: ${this.isGridVisible}`);
    }
    
    /**
     * ツール選択
     */
    selectTool(toolName) {
        // 既存のツール選択を解除
        const prevTool = document.querySelector('.tool-button.selected');
        if (prevTool) {
            prevTool.classList.remove('selected');
        }
        
        // 新しいツールを選択
        const newTool = document.querySelector(`[data-tool="${toolName}"]`);
        if (newTool) {
            newTool.classList.add('selected');
        }
        
        // 状態管理に反映
        this.stateManager.updateSection('user', {
            currentTool: toolName
        });
        
        console.log(`🎮 Tool selected: ${toolName}`);
    }
    
    /**
     * ピクセル数表示更新
     */
    updatePixelCount(count) {
        this.pixelCount = count;
        
        if (this.pixelCountDisplay) {
            // 数値をフォーマット
            let displayText;
            if (count >= 1000000) {
                displayText = `${(count / 1000000).toFixed(1)}M px`;
            } else if (count >= 1000) {
                displayText = `${(count / 1000).toFixed(1)}k px`;
            } else {
                displayText = `${count} px`;
            }
            
            this.pixelCountDisplay.textContent = displayText;
        }
        
        console.log(`🎮 Pixel count updated: ${count}`);
    }
    
    /**
     * 接続状態表示更新
     */
    updateConnectionStatus(isOnline) {
        this.isOnline = isOnline;
        
        if (this.statusIndicator) {
            this.statusIndicator.classList.toggle('offline', !isOnline);
            this.statusIndicator.title = isOnline ? 'オンライン' : 'オフライン';
        }
        
        // 状態管理に反映
        this.stateManager.updateConnection({ isOnline });
        
        console.log(`🎮 Connection status: ${isOnline ? 'online' : 'offline'}`);
    }
    
    /**
     * クールダウン表示開始
     */
    startCooldown(durationMs) {
        this.cooldownEndTime = Date.now() + durationMs;
        
        if (this.cooldownTimer) {
            clearInterval(this.cooldownTimer);
        }
        
        // クールダウン表示更新
        this.cooldownTimer = setInterval(() => {
            this.updateCooldownDisplay();
        }, 100);
        
        // クールダウンインジケーター表示
        if (this.cooldownIndicator) {
            this.cooldownIndicator.style.display = 'block';
        }
        
        console.log(`🎮 Cooldown started: ${durationMs}ms`);
    }
    
    /**
     * クールダウン表示更新
     */
    updateCooldownDisplay() {
        const remaining = Math.max(0, this.cooldownEndTime - Date.now());
        
        if (remaining <= 0) {
            // クールダウン終了
            this.endCooldown();
            return;
        }
        
        if (this.cooldownIndicator) {
            const seconds = Math.ceil(remaining / 1000);
            this.cooldownIndicator.textContent = `${seconds}s`;
        }
    }
    
    /**
     * クールダウン終了
     */
    endCooldown() {
        if (this.cooldownTimer) {
            clearInterval(this.cooldownTimer);
            this.cooldownTimer = null;
        }
        
        if (this.cooldownIndicator) {
            this.cooldownIndicator.style.display = 'none';
            this.cooldownIndicator.textContent = '';
        }
        
        this.cooldownEndTime = 0;
        console.log('🎮 Cooldown ended');
    }
    
    /**
     * ユーザー状態同期
     */
    syncUserState(userState) {
        if (userState.currentColor !== this.currentColorIndex) {
            this.selectColor(userState.currentColor);
        }
        
        if (userState.preferences?.showGrid !== this.isGridVisible) {
            this.isGridVisible = userState.preferences.showGrid;
            if (this.gridToggle) {
                this.gridToggle.classList.toggle('active', this.isGridVisible);
            }
        }
    }
    
    /**
     * データ状態同期
     */
    syncDataState(dataState) {
        if (dataState.totalPixels !== this.pixelCount) {
            this.updatePixelCount(dataState.totalPixels);
        }
        
        // ローディング状態の表示
        if (dataState.loadingProgress !== undefined) {
            this.updateLoadingProgress(dataState.loadingProgress);
        }
    }
    
    /**
     * 接続状態同期
     */
    syncConnectionState(connectionState) {
        if (connectionState.isOnline !== this.isOnline) {
            this.updateConnectionStatus(connectionState.isOnline);
        }
        
        // リアルタイム接続状態の表示
        if (this.statusIndicator) {
            const hasRealtimeConnection = connectionState.realtimeConnected;
            this.statusIndicator.classList.toggle('realtime-connected', hasRealtimeConnection);
        }
    }
    
    /**
     * ローディング進捗表示
     */
    updateLoadingProgress(progress) {
        // プログレスバーがあれば更新
        const progressBar = document.getElementById('loadingProgress');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.style.display = progress > 0 && progress < 100 ? 'block' : 'none';
        }
    }
    
    /**
     * 状態との同期
     */
    syncWithState() {
        const state = this.stateManager.getState();
        
        this.syncUserState(state.user);
        this.syncDataState(state.data);
        this.syncConnectionState(state.connection);
    }
    
    /**
     * ショートカットキー処理
     */
    handleShortcut(key, ctrlKey = false) {
        if (ctrlKey) {
            switch (key) {
                case 'g':
                    this.toggleGrid();
                    return true;
                case 's':
                    // 保存ショートカット
                    this.triggerSave();
                    return true;
            }
        } else {
            // 数字キーでカラー選択
            const colorIndex = parseInt(key);
            if (!isNaN(colorIndex) && colorIndex >= 0 && colorIndex <= 9) {
                this.selectColor(colorIndex);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 保存トリガー
     */
    triggerSave() {
        // 保存イベントを発火
        this.stateManager.addNotification({
            type: 'info',
            message: '保存中...',
            duration: 2000
        });
        
        // 実際の保存処理は他のコンポーネントで実行
        document.dispatchEvent(new window.CustomEvent('pixelcanvas:save'));
    }
    
    /**
     * 通知表示
     */
    showNotification(message, type = 'info', duration = 3000) {
        this.stateManager.addNotification({
            type,
            message,
            duration
        });
    }
    
    /**
     * エラー表示
     */
    showError(message, duration = 5000) {
        this.showNotification(message, 'error', duration);
    }
    
    /**
     * 成功メッセージ表示
     */
    showSuccess(message, duration = 3000) {
        this.showNotification(message, 'success', duration);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            currentColorIndex: this.currentColorIndex,
            pixelCount: this.pixelCount,
            isGridVisible: this.isGridVisible,
            isOnline: this.isOnline,
            cooldownActive: this.cooldownEndTime > Date.now(),
            cooldownRemaining: Math.max(0, this.cooldownEndTime - Date.now())
        };
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        // 必要に応じて設定を更新
        console.log('🎮 ControlsManager config updated');
    }
    
    /**
     * 解放処理
     */
    destroy() {
        // クールダウンタイマー停止
        if (this.cooldownTimer) {
            clearInterval(this.cooldownTimer);
        }
        
        // イベントリスナー削除
        window.removeEventListener('online', this.updateConnectionStatus);
        window.removeEventListener('offline', this.updateConnectionStatus);
        
        // 状態管理リスナー削除
        this.stateManager.removeChangeListener(this.syncWithState);
        
        console.log('🎮 ControlsManager destroyed');
    }
}
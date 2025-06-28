// アプリケーション状態管理統合クラス
import { StateManagerCore } from './state/StateManagerCore.js';
import { StateManagerEvents } from './state/StateManagerEvents.js';
import { StateManagerPersistence } from './state/StateManagerPersistence.js';

/**
 * アプリケーション状態統合管理クラス
 * コア、イベント、永続化機能を統合して管理
 */
export class StateManager {
    constructor() {
        // コンポーネント初期化
        this.core = new StateManagerCore();
        this.events = new StateManagerEvents();
        this.persistence = new StateManagerPersistence();
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    async initialize() {
        try {
            // 永続化データロード
            const persistedState = await this.persistence.loadPersistedState();
            if (Object.keys(persistedState).length > 0) {
                this.core.setState(persistedState, 'persistence');
            }
            
            // オンライン状態監視
            this.setupConnectionMonitoring();
            
            // 初期状態記録
            this.core.recordStateChange('initialize', this.core.state);
            
            console.log('🏪 StateManager initialized');
        } catch (error) {
            console.error('🏪 StateManager initialization failed:', error);
        }
    }
    
    /**
     * 接続状態監視設定
     */
    setupConnectionMonitoring() {
        const updateOnlineStatus = () => {
            this.setValue('connection.isOnline', navigator.onLine, 'system');
        };
        
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // 初期状態設定
        updateOnlineStatus();
    }
    
    /**
     * 状態取得（コアに委任）
     */
    getState() {
        return this.core.getState();
    }
    
    /**
     * セクション状態取得
     */
    getSectionState(section) {
        return this.core.getSectionState(section);
    }
    
    /**
     * 状態設定
     */
    setState(updates, source = 'user') {
        const changedSections = this.core.setState(updates, source);
        
        // イベント通知
        this.events.notifyChanges(this.core.state, changedSections, source);
        
        // 永続化
        this.persistence.scheduleSave(this.core.state, changedSections);
        
        return changedSections;
    }
    
    /**
     * セクション状態設定
     */
    setSectionState(section, updates, source = 'user') {
        const changedSections = this.core.setSectionState(section, updates, source);
        
        // イベント通知
        this.events.notifyChanges(this.core.state, changedSections, source);
        
        // 永続化
        this.persistence.scheduleSave(this.core.state, changedSections);
        
        return changedSections;
    }
    
    /**
     * 単一値設定
     */
    setValue(path, value, source = 'user') {
        const changedSections = this.core.setValue(path, value, source);
        
        // イベント通知
        this.events.notifyChanges(this.core.state, changedSections, source);
        
        // 永続化
        this.persistence.scheduleSave(this.core.state, changedSections);
        
        return changedSections;
    }
    
    /**
     * 単一値取得
     */
    getValue(path) {
        return this.core.getValue(path);
    }

    /**
     * 現在選択中の色を設定
     */
    setCurrentColor(colorIndex) {
        return this.setValue('ui.currentColor', colorIndex, 'user');
    }

    /**
     * 現在選択中の色を取得
     */
    getCurrentColor() {
        return this.getValue('ui.currentColor') || 0;
    }

    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        return this.setSectionState('config', newConfig, 'user');
    }

    /**
     * セクション更新
     */
    updateSection(section, updates) {
        return this.setSectionState(section, updates, 'user');
    }
    
    /**
     * 変更リスナー追加
     */
    addChangeListener(listener, section = null) {
        this.events.addChangeListener(listener, section);
    }
    
    /**
     * 変更リスナー削除
     */
    removeChangeListener(listener, section = null) {
        this.events.removeChangeListener(listener, section);
    }
    
    /**
     * 条件付きリスナー
     */
    addConditionalListener(condition, listener, section = null) {
        return this.events.addConditionalListener(condition, listener, section);
    }
    
    /**
     * 一度だけのリスナー
     */
    addOneTimeListener(listener, section = null) {
        return this.events.addOneTimeListener(listener, section);
    }
    
    /**
     * 値変更ウォッチャー
     */
    watchValue(path, callback) {
        return this.events.watchValue(path, callback);
    }
    
    /**
     * セクション変更ウォッチャー
     */
    watchSection(section, callback) {
        return this.events.watchSection(section, callback);
    }
    
    /**
     * デバウンスされたリスナー
     */
    addDebouncedListener(listener, delay = 100, section = null) {
        return this.events.addDebouncedListener(listener, delay, section);
    }
    
    /**
     * 自動保存設定
     */
    setAutoSave(enabled) {
        this.persistence.setAutoSave(enabled);
    }
    
    /**
     * 保存遅延設定
     */
    setAutoSaveDelay(delay) {
        this.persistence.setAutoSaveDelay(delay);
    }
    
    /**
     * 即座に保存
     */
    saveImmediately() {
        return this.persistence.saveImmediately(this.core.state);
    }
    
    /**
     * 状態エクスポート
     */
    exportState(format = 'json') {
        return this.persistence.exportState(this.core.state, format);
    }
    
    /**
     * 状態インポート
     */
    async importState(data, format = 'json') {
        const importedState = this.persistence.importState(data, format);
        this.setState(importedState, 'import');
        return importedState;
    }
    
    /**
     * 状態リセット
     */
    reset(section = null) {
        this.core.reset(section);
        
        // 変更通知
        const changedSections = section ? new Set([section]) : new Set(Object.keys(this.core.state));
        this.events.notifyChanges(this.core.state, changedSections, 'reset');
        
        // 永続化
        this.persistence.saveImmediately(this.core.state, changedSections);
    }
    
    /**
     * 永続化データクリア
     */
    clearPersistedState(sections = null) {
        this.persistence.clearPersistedState(sections);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            core: this.core.getStats(),
            events: this.events.getListenerStats(),
            persistence: this.persistence.getStats()
        };
    }
    
    /**
     * デバッグ情報
     */
    debugInfo() {
        this.core.debugInfo();
        
        const stats = this.getStats();
        console.log('🏪 StateManager Additional Info:', {
            listeners: stats.events,
            persistence: stats.persistence
        });
    }
    
    /**
     * パフォーマンス最適化
     */
    optimize() {
        // 古い履歴を削除
        if (this.core.stateHistory.length > 20) {
            this.core.stateHistory = this.core.stateHistory.slice(-20);
        }
        
        // 通知キューが溜まっている場合は強制処理
        if (this.events.notificationQueue.length > 10) {
            this.events.processNotificationQueue();
        }
        
        // ストレージクリーンアップ
        this.persistence.cleanupOldData();
        
        console.log('🏪 StateManager optimized');
    }
    
    /**
     * 解放処理
     */
    destroy() {
        // 最後の保存
        this.persistence.saveImmediately(this.core.state);
        
        // コンポーネント解放
        this.events.destroy();
        this.persistence.destroy();
        
        console.log('🏪 StateManager destroyed');
    }
}
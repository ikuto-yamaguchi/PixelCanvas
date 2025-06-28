// 状態管理コア機能
import { CONFIG } from '../../../Config.js';

/**
 * 状態管理コアクラス
 * 基本的な状態操作とデータ構造を管理
 */
export class StateManagerCore {
    constructor() {
        // アプリケーション状態
        this.state = {
            // ユーザー設定
            user: {
                currentColor: 0,
                deviceId: this.generateDeviceId(),
                preferences: {
                    theme: 'dark',
                    showGrid: false,
                    enableSound: false,
                    autoSave: true
                }
            },
            
            // ビューポート状態
            viewport: {
                scale: CONFIG.DEFAULT_SCALE || 1.0,
                offsetX: 0,
                offsetY: 0,
                bounds: null
            },
            
            // レンダリング設定
            rendering: {
                mode: 'auto', // 'auto', 'canvas2d', 'pixi'
                lodEnabled: true,
                maxPixelsPerFrame: 2000,
                vsyncEnabled: true
            },
            
            // データ状態
            data: {
                totalPixels: 0,
                loadingProgress: 0,
                lastSaveTime: null,
                isDirty: false
            },
            
            // UI状態
            ui: {
                isLoading: false,
                showDebug: false,
                activePanel: null,
                notifications: []
            },
            
            // 接続状態
            connection: {
                isOnline: navigator.onLine,
                realtimeConnected: false,
                lastSyncTime: null
            }
        };
        
        // 状態履歴（デバッグ用）
        this.stateHistory = [];
        this.maxHistorySize = 50;
        
        console.log('🏪 StateManagerCore initialized');
    }
    
    /**
     * デバイスID生成
     */
    generateDeviceId() {
        const stored = localStorage.getItem('pixelcanvas_device_id');
        if (stored) {
            return stored;
        }
        
        const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('pixelcanvas_device_id', deviceId);
        return deviceId;
    }
    
    /**
     * 状態取得
     */
    getState() {
        return this.deepClone(this.state);
    }
    
    /**
     * セクション状態取得
     */
    getSectionState(section) {
        if (!this.state[section]) {
            throw new Error(`Unknown state section: ${section}`);
        }
        return this.deepClone(this.state[section]);
    }
    
    /**
     * 状態設定
     */
    setState(updates, source = 'user') {
        const oldState = this.getState();
        this.state = this.deepMerge(this.state, updates);
        const changedSections = this.detectChanges(oldState, this.state);
        
        // 状態履歴記録
        this.recordStateChange(source, this.state, changedSections);
        
        return changedSections;
    }
    
    /**
     * セクション状態設定
     */
    setSectionState(section, updates, source = 'user') {
        if (!this.state[section]) {
            throw new Error(`Unknown state section: ${section}`);
        }
        
        const fullUpdates = { [section]: updates };
        return this.setState(fullUpdates, source);
    }
    
    /**
     * 単一値設定
     */
    setValue(path, value, source = 'user') {
        const pathParts = path.split('.');
        const updates = this.createNestedObject(pathParts, value);
        return this.setState(updates, source);
    }
    
    /**
     * 単一値取得
     */
    getValue(path) {
        const pathParts = path.split('.');
        let current = this.state;
        
        for (const part of pathParts) {
            if (current[part] === undefined) {
                return undefined;
            }
            current = current[part];
        }
        
        return current;
    }
    
    /**
     * 深い変更検出
     */
    detectChanges(oldState, newState) {
        const changedSections = new Set();
        
        for (const section in newState) {
            if (JSON.stringify(oldState[section]) !== JSON.stringify(newState[section])) {
                changedSections.add(section);
            }
        }
        
        return changedSections;
    }
    
    /**
     * 状態履歴記録
     */
    recordStateChange(source, state, changedSections = new Set()) {
        const record = {
            timestamp: Date.now(),
            source,
            state: this.deepClone(state),
            changedSections: Array.from(changedSections)
        };
        
        this.stateHistory.push(record);
        
        // 履歴サイズ制限
        while (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    
    /**
     * 深いクローン
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }
        
        if (typeof obj === 'object') {
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
        
        return obj;
    }
    
    /**
     * 深いマージ
     */
    deepMerge(target, source) {
        const result = this.deepClone(target);
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    /**
     * ネストオブジェクト作成
     */
    createNestedObject(pathParts, value) {
        const result = {};
        let current = result;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
            current[pathParts[i]] = {};
            current = current[pathParts[i]];
        }
        
        current[pathParts[pathParts.length - 1]] = value;
        return result;
    }
    
    /**
     * 状態リセット
     */
    reset(section = null) {
        if (section) {
            const defaultState = new StateManagerCore().state;
            this.setSectionState(section, defaultState[section], 'reset');
        } else {
            const defaultState = new StateManagerCore().state;
            this.setState(defaultState, 'reset');
        }
    }
    
    /**
     * 状態統計取得
     */
    getStats() {
        return {
            totalSections: Object.keys(this.state).length,
            historySize: this.stateHistory.length,
            lastChange: this.stateHistory[this.stateHistory.length - 1]?.timestamp || null,
            deviceId: this.state.user.deviceId,
            memoryUsage: JSON.stringify(this.state).length
        };
    }
    
    /**
     * デバッグ情報
     */
    debugInfo() {
        console.log('🏪 StateManager Debug Info:', {
            state: this.state,
            stats: this.getStats(),
            history: this.stateHistory.slice(-5) // 最新5件
        });
    }
}
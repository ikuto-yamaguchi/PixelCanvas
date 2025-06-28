// 状態管理永続化機能
/**
 * 状態管理永続化クラス
 * ローカルストレージとの連携、自動保存機能を管理
 */
export class StateManagerPersistence {
    constructor() {
        // 永続化設定
        this.persistenceKeys = ['user', 'viewport', 'rendering'];
        this.autoSaveEnabled = true;
        this.autoSaveDelay = 1000; // 1秒後に保存
        this.saveTimeout = null;
        
        // ストレージプレフィックス
        this.storagePrefix = 'pixelcanvas_state_';
        
        console.log('💾 StateManagerPersistence initialized');
    }
    
    /**
     * 永続化データロード
     */
    async loadPersistedState() {
        const persistedState = {};
        
        try {
            for (const key of this.persistenceKeys) {
                const storageKey = this.storagePrefix + key;
                const storedData = localStorage.getItem(storageKey);
                
                if (storedData) {
                    try {
                        persistedState[key] = JSON.parse(storedData);
                    } catch (parseError) {
                        console.warn(`🏪 Failed to parse stored state for ${key}:`, parseError);
                        // 壊れたデータを削除
                        localStorage.removeItem(storageKey);
                    }
                }
            }
            
            console.log('💾 Persisted state loaded:', Object.keys(persistedState));
            return persistedState;
        } catch (error) {
            console.error('💾 Failed to load persisted state:', error);
            return {};
        }
    }
    
    /**
     * 状態保存
     */
    async saveState(state, changedSections = null) {
        if (!this.autoSaveEnabled) {
            return;
        }
        
        try {
            const sectionsToSave = changedSections 
                ? Array.from(changedSections).filter(section => this.persistenceKeys.includes(section))
                : this.persistenceKeys;
            
            for (const section of sectionsToSave) {
                if (state[section]) {
                    const storageKey = this.storagePrefix + section;
                    const dataToSave = JSON.stringify(state[section]);
                    localStorage.setItem(storageKey, dataToSave);
                }
            }
            
            // 最後の保存時間を記録
            const timestamp = Date.now();
            localStorage.setItem(this.storagePrefix + 'last_save', timestamp.toString());
            
            console.log('💾 State saved to localStorage:', sectionsToSave);
        } catch (error) {
            console.error('💾 Failed to save state:', error);
            
            // ストレージ容量不足の場合、古いデータを削除
            if (error.name === 'QuotaExceededError') {
                this.cleanupOldData();
            }
        }
    }
    
    /**
     * 遅延保存
     */
    scheduleSave(state, changedSections = null) {
        if (!this.autoSaveEnabled) {
            return;
        }
        
        // 既存のタイマーをクリア
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        // 新しいタイマーを設定
        this.saveTimeout = setTimeout(() => {
            this.saveState(state, changedSections);
            this.saveTimeout = null;
        }, this.autoSaveDelay);
    }
    
    /**
     * 即座に保存
     */
    saveImmediately(state, changedSections = null) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        return this.saveState(state, changedSections);
    }
    
    /**
     * 自動保存設定
     */
    setAutoSave(enabled) {
        this.autoSaveEnabled = enabled;
        
        if (!enabled && this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        console.log(`💾 Auto-save ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * 保存遅延設定
     */
    setAutoSaveDelay(delay) {
        this.autoSaveDelay = Math.max(100, delay); // 最小100ms
        console.log(`💾 Auto-save delay set to ${this.autoSaveDelay}ms`);
    }
    
    /**
     * 永続化対象キー設定
     */
    setPersistenceKeys(keys) {
        this.persistenceKeys = [...keys];
        console.log('💾 Persistence keys updated:', this.persistenceKeys);
    }
    
    /**
     * 状態エクスポート
     */
    exportState(state, format = 'json') {
        const exportData = {};
        
        for (const key of this.persistenceKeys) {
            if (state[key]) {
                exportData[key] = state[key];
            }
        }
        
        const metadata = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            app: 'PixelCanvas'
        };
        
        const fullExport = {
            metadata,
            state: exportData
        };
        
        switch (format) {
            case 'json':
                return JSON.stringify(fullExport, null, 2);
            
            case 'compact':
                return JSON.stringify(fullExport);
            
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    
    /**
     * 状態インポート
     */
    importState(data, format = 'json') {
        try {
            let parsedData;
            
            switch (format) {
                case 'json':
                case 'compact':
                    parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                    break;
                
                default:
                    throw new Error(`Unsupported import format: ${format}`);
            }
            
            // バリデーション
            if (!parsedData.state) {
                throw new Error('Invalid import data: missing state');
            }
            
            // メタデータチェック
            if (parsedData.metadata?.app !== 'PixelCanvas') {
                console.warn('💾 Importing data from different app:', parsedData.metadata?.app);
            }
            
            // 永続化対象のキーのみインポート
            const importedState = {};
            for (const key of this.persistenceKeys) {
                if (parsedData.state[key]) {
                    importedState[key] = parsedData.state[key];
                }
            }
            
            return importedState;
        } catch (error) {
            throw new Error(`Failed to import state: ${error.message}`);
        }
    }
    
    /**
     * 古いデータクリーンアップ
     */
    cleanupOldData() {
        try {
            // PixelCanvasに関連しない古いキーを削除
            const keysToRemove = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('pixelcanvas_') && !key.startsWith(this.storagePrefix)) {
                    keysToRemove.push(key);
                }
            }
            
            for (const key of keysToRemove) {
                localStorage.removeItem(key);
            }
            
            console.log('💾 Cleaned up old data:', keysToRemove.length, 'items');
        } catch (error) {
            console.error('💾 Failed to cleanup old data:', error);
        }
    }
    
    /**
     * ストレージ使用量取得
     */
    getStorageUsage() {
        try {
            let totalSize = 0;
            let appSize = 0;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key);
                    const size = key.length + (value ? value.length : 0);
                    totalSize += size;
                    
                    if (key.startsWith(this.storagePrefix)) {
                        appSize += size;
                    }
                }
            }
            
            return {
                total: Math.round(totalSize / 1024), // KB
                app: Math.round(appSize / 1024), // KB
                items: localStorage.length
            };
        } catch (error) {
            return { total: 0, app: 0, items: 0 };
        }
    }
    
    /**
     * 最後の保存時間取得
     */
    getLastSaveTime() {
        try {
            const timestamp = localStorage.getItem(this.storagePrefix + 'last_save');
            return timestamp ? parseInt(timestamp) : null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 状態削除
     */
    clearPersistedState(sections = null) {
        try {
            const sectionsToDelete = sections || this.persistenceKeys;
            
            for (const section of sectionsToDelete) {
                const storageKey = this.storagePrefix + section;
                localStorage.removeItem(storageKey);
            }
            
            if (!sections) {
                localStorage.removeItem(this.storagePrefix + 'last_save');
            }
            
            console.log('💾 Cleared persisted state:', sectionsToDelete);
        } catch (error) {
            console.error('💾 Failed to clear persisted state:', error);
        }
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            autoSaveEnabled: this.autoSaveEnabled,
            autoSaveDelay: this.autoSaveDelay,
            persistenceKeys: [...this.persistenceKeys],
            hasPendingSave: !!this.saveTimeout,
            lastSaveTime: this.getLastSaveTime(),
            storageUsage: this.getStorageUsage()
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        console.log('💾 StateManagerPersistence destroyed');
    }
}
// 状態管理イベント処理
/**
 * 状態管理イベント処理クラス
 * 変更リスナー、通知、イベント処理を管理
 */
export class StateManagerEvents {
    constructor() {
        // 変更リスナー
        this.changeListeners = new Set();
        this.sectionListeners = new Map(); // セクション別リスナー
        
        // 通知キュー
        this.notificationQueue = [];
        this.isProcessingNotifications = false;
        
        console.log('📡 StateManagerEvents initialized');
    }
    
    /**
     * 変更リスナー追加
     */
    addChangeListener(listener, section = null) {
        if (section) {
            if (!this.sectionListeners.has(section)) {
                this.sectionListeners.set(section, new Set());
            }
            this.sectionListeners.get(section).add(listener);
        } else {
            this.changeListeners.add(listener);
        }
    }
    
    /**
     * 変更リスナー削除
     */
    removeChangeListener(listener, section = null) {
        if (section) {
            if (this.sectionListeners.has(section)) {
                this.sectionListeners.get(section).delete(listener);
                if (this.sectionListeners.get(section).size === 0) {
                    this.sectionListeners.delete(section);
                }
            }
        } else {
            this.changeListeners.delete(listener);
        }
    }
    
    /**
     * 変更通知
     */
    notifyChanges(state, changedSections, source) {
        const notification = {
            timestamp: Date.now(),
            state,
            changedSections: Array.from(changedSections),
            source
        };
        
        this.notificationQueue.push(notification);
        this.processNotificationQueue();
    }
    
    /**
     * 通知キュー処理
     */
    async processNotificationQueue() {
        if (this.isProcessingNotifications) {
            return;
        }
        
        this.isProcessingNotifications = true;
        
        while (this.notificationQueue.length > 0) {
            const notification = this.notificationQueue.shift();
            await this.processNotification(notification);
        }
        
        this.isProcessingNotifications = false;
    }
    
    /**
     * 単一通知処理
     */
    async processNotification(notification) {
        const { state, changedSections, source } = notification;
        
        // 全体リスナー通知
        await this.notifyListeners(this.changeListeners, {
            state,
            changedSections,
            source
        });
        
        // セクション別リスナー通知
        for (const section of changedSections) {
            if (this.sectionListeners.has(section)) {
                await this.notifyListeners(this.sectionListeners.get(section), {
                    section,
                    sectionState: state[section],
                    source,
                    fullState: state
                });
            }
        }
    }
    
    /**
     * リスナー群への通知
     */
    async notifyListeners(listeners, data) {
        const promises = [];
        
        for (const listener of listeners) {
            try {
                const result = listener(data);
                if (result && typeof result.then === 'function') {
                    promises.push(result);
                }
            } catch (error) {
                console.error('🏪 State listener error:', error);
            }
        }
        
        // 非同期リスナーの完了を待つ
        if (promises.length > 0) {
            try {
                await Promise.all(promises);
            } catch (error) {
                console.error('🏪 Async state listener error:', error);
            }
        }
    }
    
    /**
     * 条件付きリスナー
     */
    addConditionalListener(condition, listener, section = null) {
        const conditionalListener = (data) => {
            if (condition(data)) {
                return listener(data);
            }
        };
        
        this.addChangeListener(conditionalListener, section);
        return conditionalListener; // 削除用に返す
    }
    
    /**
     * 一度だけのリスナー
     */
    addOneTimeListener(listener, section = null) {
        const oneTimeListener = (data) => {
            this.removeChangeListener(oneTimeListener, section);
            return listener(data);
        };
        
        this.addChangeListener(oneTimeListener, section);
        return oneTimeListener;
    }
    
    /**
     * 値変更ウォッチャー
     */
    watchValue(path, callback) {
        let lastValue = undefined;
        
        const watcher = ({ state }) => {
            const pathParts = path.split('.');
            let currentValue = state;
            
            for (const part of pathParts) {
                if (currentValue && currentValue[part] !== undefined) {
                    currentValue = currentValue[part];
                } else {
                    currentValue = undefined;
                    break;
                }
            }
            
            if (JSON.stringify(currentValue) !== JSON.stringify(lastValue)) {
                const oldValue = lastValue;
                lastValue = currentValue;
                callback(currentValue, oldValue, path);
            }
        };
        
        this.addChangeListener(watcher);
        return watcher;
    }
    
    /**
     * セクション変更ウォッチャー
     */
    watchSection(section, callback) {
        return this.addChangeListener(callback, section);
    }
    
    /**
     * 複数値変更ウォッチャー
     */
    watchMultipleValues(paths, callback) {
        const lastValues = new Map();
        
        const multiWatcher = ({ state }) => {
            const currentValues = new Map();
            const changes = new Map();
            
            for (const path of paths) {
                const pathParts = path.split('.');
                let currentValue = state;
                
                for (const part of pathParts) {
                    if (currentValue && currentValue[part] !== undefined) {
                        currentValue = currentValue[part];
                    } else {
                        currentValue = undefined;
                        break;
                    }
                }
                
                currentValues.set(path, currentValue);
                
                if (JSON.stringify(currentValue) !== JSON.stringify(lastValues.get(path))) {
                    changes.set(path, {
                        oldValue: lastValues.get(path),
                        newValue: currentValue
                    });
                    lastValues.set(path, currentValue);
                }
            }
            
            if (changes.size > 0) {
                callback(changes, currentValues);
            }
        };
        
        this.addChangeListener(multiWatcher);
        return multiWatcher;
    }
    
    /**
     * デバウンスされたリスナー
     */
    addDebouncedListener(listener, delay = 100, section = null) {
        let timeoutId = null;
        
        const debouncedListener = (data) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                listener(data);
                timeoutId = null;
            }, delay);
        };
        
        this.addChangeListener(debouncedListener, section);
        return debouncedListener;
    }
    
    /**
     * リスナー統計取得
     */
    getListenerStats() {
        const sectionCounts = {};
        for (const [section, listeners] of this.sectionListeners.entries()) {
            sectionCounts[section] = listeners.size;
        }
        
        return {
            totalListeners: this.changeListeners.size,
            sectionListeners: sectionCounts,
            queueSize: this.notificationQueue.length,
            isProcessing: this.isProcessingNotifications
        };
    }
    
    /**
     * 全リスナー削除
     */
    clearAllListeners() {
        this.changeListeners.clear();
        this.sectionListeners.clear();
        this.notificationQueue = [];
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.clearAllListeners();
        console.log('📡 StateManagerEvents destroyed');
    }
}
// ログストレージ管理
import { LogCategory } from './LoggerCore.js';

/**
 * ログストレージ管理クラス
 */
export class LoggerStorage {
    constructor() {
        this.enableStorage = true;
    }
    
    /**
     * ストレージ保存
     */
    saveToStorage(entry) {
        if (!this.enableStorage) return;
        
        try {
            const storageKey = `pixelcanvas_logs_${entry.category}`;
            let logs = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            logs.push(entry);
            
            // ストレージ容量制限
            while (logs.length > 50) {
                logs.shift();
            }
            
            localStorage.setItem(storageKey, JSON.stringify(logs));
        } catch (error) {
            // ストレージエラーは無視（容量不足など）
        }
    }
    
    /**
     * ストレージからログ履歴読み込み
     */
    loadLogHistory() {
        const logHistory = new Map();
        
        try {
            for (const category of Object.values(LogCategory)) {
                const storageKey = `pixelcanvas_logs_${category}`;
                const logs = JSON.parse(localStorage.getItem(storageKey) || '[]');
                logHistory.set(category, logs);
            }
        } catch (error) {
            // 読み込みエラーは無視
        }
        
        return logHistory;
    }
    
    /**
     * ストレージクリア
     */
    clearStorage(category = null) {
        try {
            if (category) {
                localStorage.removeItem(`pixelcanvas_logs_${category}`);
            } else {
                for (const cat of Object.values(LogCategory)) {
                    localStorage.removeItem(`pixelcanvas_logs_${cat}`);
                }
            }
        } catch (error) {
            // 無視
        }
    }
    
    /**
     * ストレージ使用量取得
     */
    getStorageUsage() {
        try {
            let totalSize = 0;
            for (const category of Object.values(LogCategory)) {
                const storageKey = `pixelcanvas_logs_${category}`;
                const data = localStorage.getItem(storageKey) || '';
                totalSize += data.length;
            }
            return Math.round(totalSize / 1024); // KB
        } catch (error) {
            return 0;
        }
    }
}
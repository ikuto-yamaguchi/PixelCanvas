// 統合ログ管理システム
import { LoggerCore, LogLevel, LogCategory } from './logging/LoggerCore.js';
import { LoggerStorage } from './logging/LoggerStorage.js';
import { LoggerRemote } from './logging/LoggerRemote.js';
import { LoggerExport } from './logging/LoggerExport.js';

/**
 * 統合ログ管理クラス
 * コア機能、ストレージ、リモート送信、エクスポート機能を統合
 */
export class Logger {
    constructor() {
        // コンポーネント初期化
        this.core = new LoggerCore();
        this.storage = new LoggerStorage();
        this.remote = new LoggerRemote();
        this.exporter = new LoggerExport();
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        // セッションIDを各コンポーネントに設定
        const sessionId = this.core.getSessionId();
        this.remote.setSessionId(sessionId);
        
        // 保存されたログ履歴読み込み
        const logHistory = this.storage.loadLogHistory();
        for (const [category, logs] of logHistory.entries()) {
            this.core.logHistory.set(category, logs);
        }
        
        console.log('📝 Logger system initialized');
    }
    
    /**
     * 基本ログメソッド（コアに委任）
     */
    log(level, category, message, data = null) {
        const entry = this.core.log(level, category, message, data);
        if (!entry) return null;
        
        // ストレージ保存
        this.storage.saveToStorage(entry);
        
        // リモート送信
        this.remote.addToRemoteBuffer(entry);
        
        return entry;
    }
    
    /**
     * エラーログ
     */
    error(category, message, data = null) {
        return this.core.error(category, message, data);
    }
    
    /**
     * 警告ログ
     */
    warn(category, message, data = null) {
        return this.core.warn(category, message, data);
    }
    
    /**
     * 情報ログ
     */
    info(category, message, data = null) {
        return this.core.info(category, message, data);
    }
    
    /**
     * デバッグログ
     */
    debug(category, message, data = null) {
        return this.core.debug(category, message, data);
    }
    
    /**
     * トレースログ
     */
    trace(category, message, data = null) {
        return this.core.trace(category, message, data);
    }
    
    /**
     * ログレベル設定
     */
    setLevel(level) {
        this.core.setLevel(level);
    }
    
    /**
     * カテゴリフィルター設定
     */
    setEnabledCategories(categories) {
        this.core.setEnabledCategories(categories);
    }
    
    /**
     * リモートエンドポイント設定
     */
    setRemoteEndpoint(endpoint) {
        this.remote.setRemoteEndpoint(endpoint);
    }
    
    /**
     * ログ検索
     */
    search(query, options = {}) {
        return this.core.search(query, options);
    }
    
    /**
     * ログエクスポート
     */
    exportLogs(format = 'json', options = {}) {
        const logs = this.search('', options);
        return this.exporter.exportLogs(logs, format, options);
    }
    
    /**
     * ログダウンロード
     */
    downloadLogs(format = 'json', filename = null) {
        const logs = this.core.logEntries;
        this.exporter.downloadLogs(logs, format, filename);
    }
    
    /**
     * ログインポート
     */
    importLogs(data, format = 'json') {
        return this.exporter.importLogs(data, format);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            ...this.core.getStats(),
            ...this.remote.getStats(),
            storage: {
                enabled: this.storage.enableStorage,
                usage: this.storage.getStorageUsage()
            }
        };
    }
    
    /**
     * レポート生成
     */
    generateReport() {
        const logs = this.core.logEntries;
        const stats = this.core.stats;
        return this.exporter.generateReport(logs, stats);
    }
    
    /**
     * ログクリア
     */
    clear(category = null) {
        this.core.clear(category);
        this.storage.clearStorage(category);
    }
    
    /**
     * デバッグ情報出力
     */
    debugInfo() {
        const stats = this.getStats();
        console.log('📝 Logger Debug Info:', {
            core: {
                totalLogs: stats.totalLogs,
                errorCount: stats.errorCount,
                level: stats.level
            },
            storage: stats.storage,
            remote: {
                enabled: stats.enableRemote,
                bufferSize: stats.bufferSize
            }
        });
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.core.destroy();
        this.remote.destroy();
        
        console.log('📝 Logger system destroyed');
    }
}

// グローバルシングルトンインスタンス
let globalLogger = null;

/**
 * グローバルロガー取得
 */
export function getLogger() {
    if (!globalLogger) {
        globalLogger = new Logger();
    }
    return globalLogger;
}

// レベルとカテゴリをエクスポート
export { LogLevel, LogCategory };

// 便利関数エクスポート
const logger = getLogger();

export const log = {
    error: (category, message, data) => logger.error(category, message, data),
    warn: (category, message, data) => logger.warn(category, message, data),
    info: (category, message, data) => logger.info(category, message, data),
    debug: (category, message, data) => logger.debug(category, message, data),
    trace: (category, message, data) => logger.trace(category, message, data)
};
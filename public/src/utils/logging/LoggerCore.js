// ログ管理コア機能
import { CONFIG } from '../../../Config.js';

/**
 * ログレベル定義
 */
export const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

/**
 * ログカテゴリ定義
 */
export const LogCategory = {
    CORE: 'core',
    RENDER: 'render',
    DATA: 'data',
    NETWORK: 'network',
    UI: 'ui',
    EVENT: 'event',
    PERFORMANCE: 'performance'
};

/**
 * ログエントリー作成・管理クラス
 */
export class LoggerCore {
    constructor() {
        // ログ設定
        this.level = CONFIG.DEBUG_MODE ? LogLevel.DEBUG : LogLevel.INFO;
        this.maxLogEntries = 1000;
        this.enableConsole = true;
        
        // ログエントリー保存
        this.logEntries = [];
        this.logHistory = new Map(); // カテゴリ別履歴
        
        // フィルター設定
        this.categoryFilters = new Set();
        this.enabledCategories = new Set(Object.values(LogCategory));
        
        // パフォーマンス統計
        this.stats = {
            totalLogs: 0,
            errorCount: 0,
            warnCount: 0,
            lastError: null,
            categoryCounts: {}
        };
        
        // セッション情報
        this.sessionId = null;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        // カテゴリ統計初期化
        for (const category of Object.values(LogCategory)) {
            this.stats.categoryCounts[category] = 0;
        }
        
        // グローバルエラーハンドラー
        this.setupGlobalErrorHandling();
        
        console.log('📝 LoggerCore initialized');
    }
    
    /**
     * グローバルエラーハンドリング設定
     */
    setupGlobalErrorHandling() {
        // JavaScript エラー
        window.addEventListener('error', (event) => {
            this.error(LogCategory.CORE, 'Uncaught error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });
        
        // Promise rejection
        window.addEventListener('unhandledrejection', (event) => {
            this.error(LogCategory.CORE, 'Unhandled promise rejection', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });
    }
    
    /**
     * ログエントリー作成
     */
    createLogEntry(level, category, message, data = null) {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            data,
            source: this.getCallSource(),
            session: this.getSessionId()
        };
        
        return entry;
    }
    
    /**
     * 呼び出し元情報取得
     */
    getCallSource() {
        try {
            const stack = new Error().stack;
            const lines = stack.split('\n');
            // Logger以外の最初の呼び出し元を探す
            for (let i = 3; i < lines.length; i++) {
                const line = lines[i];
                if (!line.includes('Logger') && !line.includes('logger')) {
                    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
                    if (match) {
                        return {
                            function: match[1],
                            file: match[2],
                            line: parseInt(match[3]),
                            column: parseInt(match[4])
                        };
                    }
                }
            }
        } catch (error) {
            // エラーが発生した場合は無視
        }
        return null;
    }
    
    /**
     * セッションID取得
     */
    getSessionId() {
        if (!this.sessionId) {
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.sessionId;
    }
    
    /**
     * 基本ログメソッド
     */
    log(level, category, message, data = null) {
        // レベルフィルター
        if (level > this.level) {
            return;
        }
        
        // カテゴリフィルター
        if (!this.enabledCategories.has(category)) {
            return;
        }
        
        const entry = this.createLogEntry(level, category, message, data);
        
        // ログエントリー追加
        this.addLogEntry(entry);
        
        // コンソール出力
        if (this.enableConsole) {
            this.outputToConsole(entry);
        }
        
        return entry;
    }
    
    /**
     * エラーログ
     */
    error(category, message, data = null) {
        this.stats.errorCount++;
        this.stats.lastError = { message, timestamp: Date.now() };
        return this.log(LogLevel.ERROR, category, message, data);
    }
    
    /**
     * 警告ログ
     */
    warn(category, message, data = null) {
        this.stats.warnCount++;
        return this.log(LogLevel.WARN, category, message, data);
    }
    
    /**
     * 情報ログ
     */
    info(category, message, data = null) {
        return this.log(LogLevel.INFO, category, message, data);
    }
    
    /**
     * デバッグログ
     */
    debug(category, message, data = null) {
        return this.log(LogLevel.DEBUG, category, message, data);
    }
    
    /**
     * トレースログ
     */
    trace(category, message, data = null) {
        return this.log(LogLevel.TRACE, category, message, data);
    }
    
    /**
     * ログエントリー追加
     */
    addLogEntry(entry) {
        this.logEntries.push(entry);
        this.stats.totalLogs++;
        this.stats.categoryCounts[entry.category]++;
        
        // 履歴制限
        while (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }
        
        // カテゴリ別履歴
        if (!this.logHistory.has(entry.category)) {
            this.logHistory.set(entry.category, []);
        }
        const categoryHistory = this.logHistory.get(entry.category);
        categoryHistory.push(entry);
        
        // カテゴリ履歴制限
        while (categoryHistory.length > 100) {
            categoryHistory.shift();
        }
    }
    
    /**
     * コンソール出力
     */
    outputToConsole(entry) {
        const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
        const levelColors = ['#ff4444', '#ffaa00', '#4488ff', '#44ff44', '#888888'];
        
        const color = levelColors[entry.level] || '#ffffff';
        const levelName = levelNames[entry.level] || 'UNKNOWN';
        
        const style = `color: ${color}; font-weight: bold;`;
        const categoryStyle = 'color: #888; font-style: italic;';
        
        let args = [
            `%c[${levelName}]%c[${entry.category}] ${entry.message}`,
            style,
            categoryStyle
        ];
        
        if (entry.data) {
            args.push(entry.data);
        }
        
        // ソース情報があれば追加
        if (entry.source) {
            args.push(`\n  at ${entry.source.function || 'unknown'} (${entry.source.file}:${entry.source.line})`);
        }
        
        // レベルに応じたコンソールメソッド使用
        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(...args);
                break;
            case LogLevel.WARN:
                console.warn(...args);
                break;
            case LogLevel.INFO:
                console.info(...args);
                break;
            default:
                console.log(...args);
        }
    }
    
    /**
     * ログレベル設定
     */
    setLevel(level) {
        this.level = level;
        this.info(LogCategory.CORE, `Log level set to ${level}`);
    }
    
    /**
     * カテゴリフィルター設定
     */
    setEnabledCategories(categories) {
        this.enabledCategories = new Set(categories);
        this.info(LogCategory.CORE, `Enabled categories: ${Array.from(categories).join(', ')}`);
    }
    
    /**
     * ログ検索
     */
    search(query, options = {}) {
        const {
            category = null,
            level = null,
            startTime = null,
            endTime = null,
            limit = 100
        } = options;
        
        let results = [...this.logEntries];
        
        // フィルタリング
        if (category) {
            results = results.filter(entry => entry.category === category);
        }
        
        if (level !== null) {
            results = results.filter(entry => entry.level === level);
        }
        
        if (startTime) {
            results = results.filter(entry => new Date(entry.timestamp) >= new Date(startTime));
        }
        
        if (endTime) {
            results = results.filter(entry => new Date(entry.timestamp) <= new Date(endTime));
        }
        
        // テキスト検索
        if (query) {
            const searchQuery = query.toLowerCase();
            results = results.filter(entry =>
                entry.message.toLowerCase().includes(searchQuery) ||
                JSON.stringify(entry.data || {}).toLowerCase().includes(searchQuery)
            );
        }
        
        // 制限適用
        return results.slice(-limit);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            ...this.stats,
            totalEntries: this.logEntries.length,
            enabledCategories: Array.from(this.enabledCategories),
            level: this.level,
            settings: {
                enableConsole: this.enableConsole
            }
        };
    }
    
    /**
     * ログクリア
     */
    clear(category = null) {
        if (category) {
            this.logEntries = this.logEntries.filter(entry => entry.category !== category);
            this.logHistory.delete(category);
            this.info(LogCategory.CORE, `Logs cleared for category: ${category}`);
        } else {
            this.logEntries = [];
            this.logHistory.clear();
            
            // 統計リセット
            this.stats.totalLogs = 0;
            this.stats.errorCount = 0;
            this.stats.warnCount = 0;
            this.stats.lastError = null;
            
            for (const category of Object.values(LogCategory)) {
                this.stats.categoryCounts[category] = 0;
            }
            
            this.info(LogCategory.CORE, 'All logs cleared');
        }
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.logEntries = [];
        this.logHistory.clear();
        console.log('📝 LoggerCore destroyed');
    }
}
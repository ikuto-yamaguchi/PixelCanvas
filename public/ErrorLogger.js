// ErrorLogger.js - 全エラーを確実にキャッチ&コピペ可能にするシステム

export class ErrorLogger {
    constructor() {
        this.errors = [];
        this.maxErrors = 10000; // 最大10000件のエラーを保持
        this.isVisible = false;
        this.init();
    }

    init() {
        this.setupGlobalErrorHandlers();
        this.setupUI();
        this.loadStoredErrors();
    }

    setupGlobalErrorHandlers() {
        // JavaScript例外をキャッチ
        window.addEventListener('error', (event) => {
            this.logError('JavaScript Error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        // Promise rejection をキャッチ
        window.addEventListener('unhandledrejection', (event) => {
            this.logError('Unhandled Promise Rejection', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });

        // console.error を拡張
        const originalError = console.error;
        console.error = (...args) => {
            this.logError('Console Error', { arguments: args });
            originalError.apply(console, args);
        };

        // console.warn は記録しない（エラーのみ）
    }

    logError(type, details) {
        const timestamp = new Date().toISOString();
        const error = {
            id: Date.now() + Math.random(),
            timestamp,
            type,
            details,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.errors.unshift(error);
        
        // 最大件数を超えたら古いものを削除
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        this.saveToStorage();
        this.updateUI();
    }

    saveToStorage() {
        try {
            localStorage.setItem('pixelcanvas_errors', JSON.stringify(this.errors));
        } catch (e) {
            // localStorage が使えない場合は無視
        }
    }

    loadStoredErrors() {
        try {
            const stored = localStorage.getItem('pixelcanvas_errors');
            if (stored) {
                this.errors = JSON.parse(stored);
            }
        } catch (e) {
            // パース失敗は無視
        }
    }

    setupUI() {
        // エラーログボタンを作成
        const button = document.createElement('button');
        button.innerHTML = '🐛';
        button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #ff4444;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        button.addEventListener('click', () => this.toggleUI());
        document.body.appendChild(button);
        this.button = button;

        // エラーログパネルを作成
        this.createPanel();
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 9999;
            display: none;
            color: white;
            font-family: monospace;
            font-size: 12px;
            overflow: auto;
            padding: 20px;
            box-sizing: border-box;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            position: sticky;
            top: 0;
            background: #333;
            padding: 10px;
            margin: -20px -20px 20px -20px;
            border-bottom: 1px solid #666;
        `;
        
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; color: #ff4444;">Error Log (${this.errors.length})</h2>
                <div>
                    <button id="copyAllErrors" style="margin-right: 10px; padding: 5px 10px; background: #4CAF50; border: none; color: white; cursor: pointer;">📋 Copy All</button>
                    <button id="clearOldErrors" style="margin-right: 10px; padding: 5px 10px; background: #ff9800; border: none; color: white; cursor: pointer;">🧹 Clear Old</button>
                    <button id="clearErrors" style="margin-right: 10px; padding: 5px 10px; background: #f44336; border: none; color: white; cursor: pointer;">🗑️ Clear All</button>
                    <button id="closeErrorPanel" style="padding: 5px 10px; background: #666; border: none; color: white; cursor: pointer;">✕ Close</button>
                </div>
            </div>
        `;

        const content = document.createElement('div');
        content.id = 'errorContent';
        
        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);
        
        this.panel = panel;
        this.content = content;

        // イベントリスナー設定
        document.getElementById('copyAllErrors').addEventListener('click', () => this.copyAllErrors());
        document.getElementById('clearOldErrors').addEventListener('click', () => this.clearOldErrors());
        document.getElementById('clearErrors').addEventListener('click', () => this.clearErrors());
        document.getElementById('closeErrorPanel').addEventListener('click', () => this.toggleUI());
    }

    toggleUI() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.updateUI();
        }
    }

    updateUI() {
        if (!this.content) return;

        const errorCount = this.errors.length;
        this.button.textContent = errorCount > 0 ? `🐛${errorCount}` : '🐛';
        this.button.style.background = errorCount > 0 ? '#ff4444' : '#666';

        if (this.isVisible) {
            this.content.innerHTML = this.formatErrors();
        }
    }

    formatErrors() {
        if (this.errors.length === 0) {
            return '<div style="text-align: center; color: #888; margin-top: 50px;">No errors logged yet</div>';
        }

        return this.errors.map(error => {
            return `
                <div style="border: 1px solid #666; margin-bottom: 15px; padding: 15px; background: #222;">
                    <div style="color: #ff4444; font-weight: bold; margin-bottom: 10px;">
                        [${error.timestamp}] ${error.type}
                    </div>
                    <pre style="white-space: pre-wrap; margin: 0; background: #111; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(error.details, null, 2)}</pre>
                    <div style="margin-top: 10px; font-size: 10px; color: #888;">
                        URL: ${error.url}<br>
                        User Agent: ${error.userAgent}
                    </div>
                </div>
            `;
        }).join('');
    }

    async copyAllErrors() {
        const errorText = this.generateErrorReport();
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(errorText);
                this.showToast('✅ All errors copied to clipboard!');
            } else {
                // Fallback for older browsers
                this.fallbackCopy(errorText);
            }
        } catch (err) {
            this.fallbackCopy(errorText);
        }
    }

    fallbackCopy(text) {
        // テキストエリアを作成してコピー
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showToast('✅ All errors copied to clipboard!');
        } catch (err) {
            this.showToast('❌ Copy failed. Please select and copy manually.');
            // テキストエリアを表示して手動コピーできるようにする
            textarea.style.position = 'static';
            textarea.style.opacity = '1';
            textarea.style.width = '100%';
            textarea.style.height = '200px';
            textarea.style.margin = '10px 0';
            return;
        }
        
        document.body.removeChild(textarea);
    }

    generateErrorReport() {
        const header = `PixelCanvas Error Report
Generated: ${new Date().toISOString()}
Total Errors: ${this.errors.length}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

${'='.repeat(80)}

`;

        const errorDetails = this.errors.map((error, index) => {
            return `ERROR #${index + 1}
Timestamp: ${error.timestamp}
Type: ${error.type}
Details:
${JSON.stringify(error.details, null, 2)}

URL: ${error.url}
User Agent: ${error.userAgent}

${'-'.repeat(80)}
`;
        }).join('\n');

        return header + errorDetails;
    }

    clearOldErrors() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const oldCount = this.errors.length;
        this.errors = this.errors.filter(error => {
            const errorTime = new Date(error.timestamp).getTime();
            return errorTime > oneHourAgo;
        });
        const removedCount = oldCount - this.errors.length;
        this.saveToStorage();
        this.updateUI();
        this.showToast(`🧹 Removed ${removedCount} old errors`);
    }

    clearErrors() {
        if (confirm('Clear all error logs?')) {
            this.errors = [];
            this.saveToStorage();
            this.updateUI();
            this.showToast('✅ All errors cleared');
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #333;
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            z-index: 10001;
            font-family: sans-serif;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 3000);
    }

    // 手動でエラーを追加するメソッド
    addCustomError(message, details = {}) {
        this.logError('Custom Error', { message, ...details });
    }
}

// グローバルに利用可能にする
window.ErrorLogger = ErrorLogger;
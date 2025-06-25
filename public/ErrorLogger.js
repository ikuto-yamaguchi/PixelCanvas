// ErrorLogger.js - エラー収集とコピペ機能（完璧復活版）

export class ErrorLogger {
    constructor() {
        this.errors = [];
        this.maxErrors = 10000; // 1万件まで保存
        this.isVisible = false;
        this.init();
    }

    init() {
        this.setupErrorCapture();
        this.createToggleButton();
        this.createPanel();
    }

    setupErrorCapture() {
        // オリジナルのコンソールメソッドを保存
        this.originalError = console.error;
        this.originalWarn = console.warn;
        this.originalLog = console.log;

        // コンソールエラーをキャプチャ
        console.error = (...args) => {
            this.originalError.apply(console, args);
            this.addError('Console Error', { arguments: args });
        };

        console.warn = (...args) => {
            this.originalWarn.apply(console, args);
            this.addError('Console Warning', { arguments: args });
        };

        // window.onerrorもキャプチャ
        window.addEventListener('error', (e) => {
            this.addError('Window Error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                stack: e.error?.stack
            });
        });

        // unhandledrejectionもキャプチャ
        window.addEventListener('unhandledrejection', (e) => {
            this.addError('Unhandled Promise Rejection', {
                reason: e.reason,
                promise: e.promise
            });
        });
    }

    addError(type, details) {
        const error = {
            timestamp: new Date().toISOString(),
            type: type,
            details: details,
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        this.errors.unshift(error); // 新しいエラーを先頭に追加

        // 最大件数を超えたら古いものを削除
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        // パネルが表示されていれば更新
        if (this.isVisible) {
            this.updatePanel();
        }

        // ボタンのエラー数を更新
        this.updateButtonText();
    }

    createToggleButton() {
        this.button = document.createElement('button');
        this.button.textContent = '🐛0';
        this.button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #f44336;
            border: none;
            border-radius: 5px;
            padding: 8px 12px;
            color: white;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        this.button.addEventListener('click', () => this.toggle());
        document.body.appendChild(this.button);
    }

    updateButtonText() {
        if (this.button) {
            this.button.textContent = `🐛${this.errors.length}`;
        }
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.updatePanel();
        }
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            color: white;
            font-family: monospace;
            font-size: 11px;
            z-index: 9999;
            display: none;
            overflow: auto;
            padding: 20px;
            box-sizing: border-box;
        `;

        const header = document.createElement('div');
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #f44336;">🐛 PixelCanvas Error Report</h2>
                <div>
                    <button id="copyAllErrors" style="padding: 8px 15px; background: #4CAF50; border: none; color: white; margin-right: 10px; cursor: pointer; border-radius: 3px;">📋 Copy All</button>
                    <button id="clearOldErrors" style="padding: 8px 15px; background: #ff9800; border: none; color: white; margin-right: 10px; cursor: pointer; border-radius: 3px;">🧹 Clear Old</button>
                    <button id="closeErrorPanel" style="padding: 8px 15px; background: #666; border: none; color: white; cursor: pointer; border-radius: 3px;">✕ Close</button>
                </div>
            </div>
        `;

        this.content = document.createElement('div');
        this.content.id = 'errorContent';
        
        this.panel.appendChild(header);
        this.panel.appendChild(this.content);
        document.body.appendChild(this.panel);

        // イベントリスナー
        document.getElementById('copyAllErrors').addEventListener('click', () => this.copyAllErrors());
        document.getElementById('clearOldErrors').addEventListener('click', () => this.clearOldErrors());
        document.getElementById('closeErrorPanel').addEventListener('click', () => this.toggle());
    }

    updatePanel() {
        if (!this.content) return;

        if (this.errors.length === 0) {
            this.content.innerHTML = '<p style="color: #4CAF50;">✅ No errors detected!</p>';
            return;
        }

        const errorReport = this.generateErrorReport();
        this.content.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${errorReport}</pre>`;
    }

    generateErrorReport() {
        const now = new Date().toISOString();
        let report = `PixelCanvas Error Report
Generated: ${now}
Total Errors: ${this.errors.length}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

${'='.repeat(80)}

`;

        this.errors.forEach((error, index) => {
            report += `ERROR #${index + 1}
Timestamp: ${error.timestamp}
Type: ${error.type}
Details:
${JSON.stringify(error.details, null, 2)}

URL: ${error.url}
User Agent: ${error.userAgent}

${'-'.repeat(80)}

`;
        });

        return report;
    }

    async copyAllErrors() {
        try {
            const report = this.generateErrorReport();
            await navigator.clipboard.writeText(report);
            
            // 成功フィードバック
            const btn = document.getElementById('copyAllErrors');
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            btn.style.background = '#4CAF50';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#4CAF50';
            }, 2000);
            
        } catch (err) {
            console.error('Failed to copy errors:', err);
            
            // フォールバック: テキストエリアを使用
            const textarea = document.createElement('textarea');
            textarea.value = this.generateErrorReport();
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            const btn = document.getElementById('copyAllErrors');
            btn.textContent = '✅ Copied (fallback)!';
        }
    }

    clearOldErrors() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const oldCount = this.errors.length;
        
        this.errors = this.errors.filter(error => {
            return new Date(error.timestamp) > oneHourAgo;
        });
        
        const removedCount = oldCount - this.errors.length;
        
        this.updatePanel();
        this.updateButtonText();
        
        // フィードバック
        const btn = document.getElementById('clearOldErrors');
        const originalText = btn.textContent;
        btn.textContent = `✅ Removed ${removedCount}`;
        
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }
}

// グローバルに利用可能にする
window.ErrorLogger = ErrorLogger;
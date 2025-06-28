// パフォーマンスレポート機能
/**
 * パフォーマンスレポートクラス
 * 統計レポート生成とリソース監視を提供
 */
export class PerformanceReporting {
    constructor(performanceCore) {
        this.core = performanceCore;
        this.monitoringInterval = null;
        this.resourceHistory = [];
        this.maxHistorySize = 100;
        
        console.log('📊 PerformanceReporting initialized');
    }
    
    /**
     * リソース使用量監視
     */
    monitorResources(interval = 5000) {
        const monitor = () => {
            const stats = this.core.getStats();
            const resources = {
                ...stats,
                dom: {
                    elements: document.querySelectorAll('*').length,
                    listeners: this.estimateEventListeners()
                },
                storage: this.getStorageUsage(),
                network: this.getNetworkInfo()
            };
            
            // 履歴に追加
            this.resourceHistory.push({
                timestamp: Date.now(),
                ...resources
            });
            
            // 履歴サイズ制限
            while (this.resourceHistory.length > this.maxHistorySize) {
                this.resourceHistory.shift();
            }
            
            this.core.notifyListeners({
                type: 'resource_stats',
                resources
            });
        };
        
        monitor(); // 即座に実行
        this.monitoringInterval = setInterval(monitor, interval);
        return this.monitoringInterval;
    }
    
    /**
     * ストレージ使用量取得
     */
    getStorageUsage() {
        try {
            const localStorage = JSON.stringify(window.localStorage).length;
            const sessionStorage = JSON.stringify(window.sessionStorage).length;
            
            return {
                localStorage: Math.round(localStorage / 1024), // KB
                sessionStorage: Math.round(sessionStorage / 1024) // KB
            };
        } catch (error) {
            return { localStorage: 0, sessionStorage: 0 };
        }
    }
    
    /**
     * ネットワーク情報取得
     */
    getNetworkInfo() {
        if (navigator.connection) {
            return {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            };
        }
        return null;
    }
    
    /**
     * イベントリスナー数推定
     */
    estimateEventListeners() {
        // 簡易的な推定（実際のリスナー数は取得困難）
        const elements = document.querySelectorAll('*');
        let estimated = 0;
        
        for (const element of elements) {
            // 一般的なイベントタイプをチェック
            const events = ['click', 'mousedown', 'mouseup', 'mousemove', 'keydown', 'keyup'];
            for (const event of events) {
                if (element[`on${event}`]) {
                    estimated++;
                }
            }
        }
        
        return estimated;
    }
    
    /**
     * パフォーマンスレポート生成
     */
    generateReport() {
        const stats = this.core.getStats();
        const report = {
            timestamp: new Date().toISOString(),
            performance: stats,
            thresholds: this.core.thresholds,
            browser: {
                userAgent: navigator.userAgent,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                connection: this.getNetworkInfo()
            },
            profileResults: this.core.getProfileResults(),
            resourceHistory: this.resourceHistory.slice(-10), // 最新10件
            recommendations: this.generateRecommendations(stats)
        };
        
        return report;
    }
    
    /**
     * パフォーマンス推奨事項生成
     */
    generateRecommendations(stats) {
        const recommendations = [];
        
        // FPS関連
        if (stats.fps < 30) {
            recommendations.push({
                category: 'fps',
                severity: 'high',
                message: 'FPSが低下しています。レンダリング負荷を軽減してください。',
                suggestions: [
                    'LOD（Level of Detail）の有効化',
                    '画面外オブジェクトのカリング',
                    'バッチ処理の最適化'
                ]
            });
        } else if (stats.fps < 50) {
            recommendations.push({
                category: 'fps',
                severity: 'medium',
                message: 'FPSがやや低下しています。',
                suggestions: ['フレーム制限の調整', 'パフォーマンス監視の強化']
            });
        }
        
        // メモリ関連
        if (stats.memory.used > 200) {
            recommendations.push({
                category: 'memory',
                severity: 'high',
                message: 'メモリ使用量が多すぎます。',
                suggestions: [
                    'オブジェクトプールの使用',
                    'データキャッシュのクリーンアップ',
                    'メモリリークの調査'
                ]
            });
        } else if (stats.memory.used > 100) {
            recommendations.push({
                category: 'memory',
                severity: 'medium',
                message: 'メモリ使用量が増加しています。',
                suggestions: ['定期的なガベージコレクション', 'キャッシュサイズの最適化']
            });
        }
        
        // レンダリング関連
        const renderStats = stats.timers.render;
        if (renderStats && renderStats.averageTime > 20) {
            recommendations.push({
                category: 'rendering',
                severity: 'high',
                message: 'レンダリング時間が長すぎます。',
                suggestions: [
                    'Canvas2Dへの切り替え検討',
                    'レンダリング頻度の調整',
                    'GPU最適化の実装'
                ]
            });
        }
        
        return recommendations;
    }
    
    /**
     * パフォーマンス傾向分析
     */
    analyzeTrends() {
        if (this.resourceHistory.length < 5) {
            return null;
        }
        
        const recent = this.resourceHistory.slice(-5);
        const analysis = {
            fps: this.calculateTrend(recent, 'fps'),
            memory: this.calculateTrend(recent, 'memory.used'),
            frameCount: this.calculateTrend(recent, 'frameCount')
        };
        
        return analysis;
    }
    
    /**
     * トレンド計算
     */
    calculateTrend(data, property) {
        const values = data.map(item => this.getNestedProperty(item, property)).filter(v => v !== undefined);
        
        if (values.length < 2) {
            return { trend: 'stable', change: 0 };
        }
        
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;
        
        let trend = 'stable';
        if (change > 10) trend = 'increasing';
        else if (change < -10) trend = 'decreasing';
        
        return { trend, change: change.toFixed(2) };
    }
    
    /**
     * ネストプロパティ取得
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }
    
    /**
     * アラート条件チェック
     */
    checkAlerts() {
        const stats = this.core.getStats();
        const alerts = [];
        
        // 重要なメトリクスをチェック
        if (stats.fps < 15) {
            alerts.push({
                type: 'critical',
                category: 'fps',
                message: `極度に低いFPS: ${stats.fps}`
            });
        }
        
        if (stats.memory.used > 500) {
            alerts.push({
                type: 'critical',
                category: 'memory',
                message: `メモリ使用量が危険レベル: ${stats.memory.used}MB`
            });
        }
        
        // CPU使用率の推定（フレーム時間から）
        const avgFrameTime = this.core.frameTimeHistory.length > 0 
            ? this.core.frameTimeHistory.reduce((a, b) => a + b) / this.core.frameTimeHistory.length 
            : 0;
        
        if (avgFrameTime > 50) { // 50ms = 20fps以下
            alerts.push({
                type: 'warning',
                category: 'performance',
                message: `フレーム処理時間が長い: ${avgFrameTime.toFixed(2)}ms`
            });
        }
        
        return alerts;
    }
    
    /**
     * レポートHTMLエクスポート
     */
    exportReportHTML() {
        const report = this.generateReport();
        const trends = this.analyzeTrends();
        const alerts = this.checkAlerts();
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>PixelCanvas Performance Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .metric { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
                .critical { background-color: #ffebee; }
                .warning { background-color: #fff3e0; }
                .good { background-color: #e8f5e8; }
                .chart { width: 100%; height: 200px; border: 1px solid #ccc; }
            </style>
        </head>
        <body>
            <h1>PixelCanvas Performance Report</h1>
            <p>Generated: ${report.timestamp}</p>
            
            <h2>Current Performance</h2>
            <div class="metric ${report.performance.fps >= 30 ? 'good' : 'warning'}">
                <strong>FPS:</strong> ${report.performance.fps}
            </div>
            <div class="metric ${report.performance.memory.used < 100 ? 'good' : 'warning'}">
                <strong>Memory Usage:</strong> ${report.performance.memory.used}MB
            </div>
            
            <h2>Alerts</h2>
            ${alerts.length === 0 ? '<p>No alerts</p>' : alerts.map(alert => 
                `<div class="metric ${alert.type}"><strong>${alert.category}:</strong> ${alert.message}</div>`
            ).join('')}
            
            <h2>Recommendations</h2>
            ${report.recommendations.map(rec => 
                `<div class="metric ${rec.severity}">
                    <strong>${rec.category}:</strong> ${rec.message}
                    <ul>${rec.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
                </div>`
            ).join('')}
            
            <h2>Browser Information</h2>
            <pre>${JSON.stringify(report.browser, null, 2)}</pre>
            
            <h2>Detailed Statistics</h2>
            <pre>${JSON.stringify(report.performance, null, 2)}</pre>
        </body>
        </html>`;
        
        return html;
    }
    
    /**
     * レポートダウンロード
     */
    downloadReport(format = 'json') {
        let data, filename, mimeType;
        
        switch (format) {
            case 'html':
                data = this.exportReportHTML();
                filename = `pixelcanvas-performance-${Date.now()}.html`;
                mimeType = 'text/html';
                break;
            
            case 'json':
            default:
                data = JSON.stringify(this.generateReport(), null, 2);
                filename = `pixelcanvas-performance-${Date.now()}.json`;
                mimeType = 'application/json';
                break;
        }
        
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`📊 Performance report downloaded: ${filename}`);
    }
    
    /**
     * 監視停止
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('📊 Resource monitoring stopped');
        }
    }
    
    /**
     * 履歴クリア
     */
    clearHistory() {
        this.resourceHistory = [];
        console.log('📊 Performance history cleared');
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.stopMonitoring();
        this.clearHistory();
        console.log('📊 PerformanceReporting destroyed');
    }
}
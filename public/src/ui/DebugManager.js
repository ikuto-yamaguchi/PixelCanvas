// デバッグ管理システム
// Configuration imported as needed

/**
 * デバッグ情報統合管理クラス
 * パフォーマンス監視、状態表示、デバッグパネルを統一管理
 */
export class DebugManager {
    constructor(pixelCanvasCore) {
        this.pixelCanvasCore = pixelCanvasCore;
        
        // デバッグパネル要素
        this.debugPanel = null;
        this.isVisible = false;
        
        // 統計情報
        this.stats = {
            frameCount: 0,
            fps: 0,
            lastFrameTime: 0,
            renderTime: 0,
            dataLoadTime: 0,
            memoryUsage: 0
        };
        
        // パフォーマンス監視
        this.performanceTimer = null;
        this.updateInterval = 1000; // 1秒間隔
        
        // フレームレート計測
        this.frameTimeHistory = [];
        this.maxFrameHistory = 60;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        this.createDebugPanel();
        this.setupKeyboardShortcuts();
        this.startPerformanceMonitoring();
        
        console.log('🔧 DebugManager initialized');
    }
    
    /**
     * デバッグパネル作成
     */
    createDebugPanel() {
        // 既存のパネルがあれば削除
        const existingPanel = document.getElementById('debugPanel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        this.debugPanel = document.createElement('div');
        this.debugPanel.id = 'debugPanel';
        this.debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 80vh;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 5px;
            z-index: 10000;
            display: none;
            overflow-y: auto;
            border: 1px solid #333;
        `;
        
        // パネル内容の初期化
        this.updateDebugPanel();
        
        // ドキュメントに追加
        document.body.appendChild(this.debugPanel);
    }
    
    /**
     * キーボードショートカット設定
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'F3' || (event.ctrlKey && event.key === 'd')) {
                event.preventDefault();
                this.toggleDebugPanel();
            }
            
            if (event.ctrlKey && event.shiftKey && event.key === 'D') {
                event.preventDefault();
                this.dumpDebugInfo();
            }
        });
    }
    
    /**
     * パフォーマンス監視開始
     */
    startPerformanceMonitoring() {
        this.performanceTimer = setInterval(() => {
            this.updatePerformanceStats();
            if (this.isVisible) {
                this.updateDebugPanel();
            }
        }, this.updateInterval);
    }
    
    /**
     * パフォーマンス統計更新
     */
    updatePerformanceStats() {
        const now = performance.now();
        
        // FPS計算
        this.frameTimeHistory.push(now);
        while (this.frameTimeHistory.length > this.maxFrameHistory) {
            this.frameTimeHistory.shift();
        }
        
        if (this.frameTimeHistory.length > 1) {
            const totalTime = now - this.frameTimeHistory[0];
            this.stats.fps = Math.round((this.frameTimeHistory.length - 1) * 1000 / totalTime);
        }
        
        // メモリ使用量（利用可能な場合）
        if (performance.memory) {
            this.stats.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        }
        
        this.stats.frameCount++;
    }
    
    /**
     * デバッグパネル表示切り替え
     */
    toggleDebugPanel() {
        this.isVisible = !this.isVisible;
        this.debugPanel.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.updateDebugPanel();
        }
    }
    
    /**
     * デバッグパネル表示
     */
    showDebugPanel() {
        this.isVisible = true;
        this.debugPanel.style.display = 'block';
        this.updateDebugPanel();
    }
    
    /**
     * デバッグパネル非表示
     */
    hideDebugPanel() {
        this.isVisible = false;
        this.debugPanel.style.display = 'none';
    }
    
    /**
     * デバッグパネル内容更新
     */
    updateDebugPanel() {
        if (!this.debugPanel || !this.isVisible) return;
        
        const appStats = this.pixelCanvasCore.getStats();
        
        let html = '<h3>🔧 Debug Info</h3>';
        
        // システム情報
        html += '<h4>⚡ Performance</h4>';
        html += `FPS: ${this.stats.fps}<br>`;
        html += `Frame Count: ${this.stats.frameCount}<br>`;
        html += `Memory: ${this.stats.memoryUsage}MB<br>`;
        
        // アプリケーション状態
        html += '<h4>🎯 Application</h4>';
        html += `Initialized: ${appStats.initialized}<br>`;
        html += `Destroyed: ${appStats.destroyed}<br>`;
        
        // 初期化ステップ
        html += '<h4>📋 Initialization</h4>';
        for (const [step, completed] of Object.entries(appStats.initializationSteps || {})) {
            html += `${step}: ${completed ? '✅' : '❌'}<br>`;
        }
        
        // データ統計
        if (appStats.data) {
            html += '<h4>📊 Data</h4>';
            html += `Pixels: ${appStats.data.totalPixels || 0}<br>`;
            html += `Cache Size: ${appStats.data.cacheSize || 0}<br>`;
            html += `Cache Hit Rate: ${(appStats.data.cacheHitRate * 100 || 0).toFixed(1)}%<br>`;
        }
        
        // レンダリング情報
        if (appStats.rendering) {
            html += '<h4>🎨 Rendering</h4>';
            html += `Mode: ${appStats.rendering.mode || 'unknown'}<br>`;
            html += `Active Renderer: ${appStats.rendering.activeRenderer || 'none'}<br>`;
            html += `LOD Level: ${appStats.rendering.lodLevel || 0}<br>`;
        }
        
        // ビューポート情報
        if (appStats.viewport) {
            html += '<h4>🗺️ Viewport</h4>';
            html += `Scale: ${(appStats.viewport.scale || 1).toFixed(2)}<br>`;
            html += `Offset: (${Math.round(appStats.viewport.offsetX || 0)}, ${Math.round(appStats.viewport.offsetY || 0)})<br>`;
            html += `Size: ${appStats.viewport.canvasWidth || 0}x${appStats.viewport.canvasHeight || 0}<br>`;
        }
        
        // 状態管理情報
        if (appStats.state) {
            html += '<h4>🏪 State</h4>';
            html += `Current Color: ${appStats.state.user?.currentColor || 0}<br>`;
            html += `Grid Visible: ${appStats.state.user?.preferences?.showGrid || false}<br>`;
            html += `Online: ${appStats.state.connection?.isOnline || false}<br>`;
            html += `Realtime: ${appStats.state.connection?.realtimeConnected || false}<br>`;
        }
        
        // 操作ボタン
        html += '<h4>🛠️ Actions</h4>';
        html += '<button onclick="window.debugManager?.dumpDebugInfo()">Dump Info</button><br>';
        html += '<button onclick="window.debugManager?.clearCache()">Clear Cache</button><br>';
        html += '<button onclick="window.debugManager?.resetViewport()">Reset Viewport</button><br>';
        
        this.debugPanel.innerHTML = html;
        
        // グローバルアクセス用
        window.debugManager = this;
    }
    
    /**
     * デバッグ情報ダンプ
     */
    dumpDebugInfo() {
        const debugInfo = {
            timestamp: new Date().toISOString(),
            performance: this.stats,
            application: this.pixelCanvasCore.getStats(),
            browser: {
                userAgent: navigator.userAgent,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                devicePixelRatio: window.devicePixelRatio,
                online: navigator.onLine
            }
        };
        
        console.log('🔧 Debug Info Dump:', debugInfo);
        
        // JSONファイルとしてダウンロード
        this.downloadDebugInfo(debugInfo);
    }
    
    /**
     * デバッグ情報ダウンロード
     */
    downloadDebugInfo(debugInfo) {
        const blob = new Blob([JSON.stringify(debugInfo, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pixelcanvas-debug-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * キャッシュクリア
     */
    clearCache() {
        if (this.pixelCanvasCore.pixelDataManager) {
            this.pixelCanvasCore.pixelDataManager.optimizeCache();
            console.log('🔧 Cache cleared');
        }
    }
    
    /**
     * ビューポートリセット
     */
    resetViewport() {
        if (this.pixelCanvasCore.viewportManager) {
            this.pixelCanvasCore.viewportManager.setViewport(0, 0, 1); // x=0, y=0, scale=1にリセット
            console.log('🔧 Viewport reset');
        }
    }
    
    /**
     * レンダリング時間記録
     */
    recordRenderTime(renderTime) {
        this.stats.renderTime = renderTime;
    }
    
    /**
     * データロード時間記録
     */
    recordDataLoadTime(loadTime) {
        this.stats.dataLoadTime = loadTime;
    }
    
    /**
     * カスタムメトリクス追加
     */
    addCustomMetric(name, value) {
        if (!this.stats.custom) {
            this.stats.custom = {};
        }
        this.stats.custom[name] = value;
    }
    
    /**
     * パフォーマンス警告チェック
     */
    checkPerformanceWarnings() {
        const warnings = [];
        
        if (this.stats.fps < 30) {
            warnings.push('Low FPS detected');
        }
        
        if (this.stats.memoryUsage > 100) {
            warnings.push('High memory usage detected');
        }
        
        if (this.stats.renderTime > 16) {
            warnings.push('Slow rendering detected');
        }
        
        if (warnings.length > 0) {
            console.warn('🔧 Performance warnings:', warnings);
        }
        
        return warnings;
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            ...this.stats,
            isVisible: this.isVisible,
            warnings: this.checkPerformanceWarnings()
        };
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        if (newConfig.updateInterval !== undefined) {
            this.updateInterval = newConfig.updateInterval;
            
            // タイマー再開
            if (this.performanceTimer) {
                clearInterval(this.performanceTimer);
                this.startPerformanceMonitoring();
            }
        }
        
        if (newConfig.maxFrameHistory !== undefined) {
            this.maxFrameHistory = newConfig.maxFrameHistory;
        }
        
        console.log('🔧 DebugManager config updated');
    }
    
    /**
     * 解放処理
     */
    destroy() {
        // パフォーマンス監視停止
        if (this.performanceTimer) {
            clearInterval(this.performanceTimer);
        }
        
        // デバッグパネル削除
        if (this.debugPanel) {
            this.debugPanel.remove();
        }
        
        // イベントリスナー削除
        document.removeEventListener('keydown', this.setupKeyboardShortcuts);
        
        // グローバル参照削除
        if (window.debugManager === this) {
            delete window.debugManager;
        }
        
        console.log('🔧 DebugManager destroyed');
    }
}
// パフォーマンス監視統合システム
import { PerformanceCore } from './performance/PerformanceCore.js';
import { PerformanceBenchmark } from './performance/PerformanceBenchmark.js';
import { PerformanceReporting } from './performance/PerformanceReporting.js';

/**
 * パフォーマンス監視統合クラス
 * コア、ベンチマーク、レポート機能を統合
 */
export class PerformanceMonitor {
    constructor() {
        // コンポーネント初期化
        this.core = new PerformanceCore();
        this.benchmark = new PerformanceBenchmark(this.core);
        this.reporting = new PerformanceReporting(this.core);
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    initialize() {
        this.core.startFrameMonitoring();
        console.log('📊 PerformanceMonitor initialized');
    }
    
    /**
     * 処理時間計測開始
     */
    startTimer(name) {
        return this.core.startTimer(name);
    }
    
    /**
     * 処理時間計測終了
     */
    endTimer(name) {
        return this.core.endTimer(name);
    }
    
    /**
     * メモリ使用量測定
     */
    measureMemory() {
        return this.core.measureMemory();
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return this.core.getStats();
    }
    
    /**
     * プロファイル結果取得
     */
    getProfileResults(category = null) {
        return this.core.getProfileResults(category);
    }
    
    /**
     * ベンチマーク実行
     */
    async benchmark(name, operation, iterations = 100) {
        return await this.benchmark.benchmark(name, operation, iterations);
    }
    
    /**
     * システムベンチマーク実行
     */
    async runSystemBenchmark() {
        return await this.benchmark.runSystemBenchmark();
    }
    
    /**
     * 関数実行時間測定
     */
    async measureFunction(fn, name = 'function') {
        return await this.benchmark.measureFunction(fn, name);
    }
    
    /**
     * リソース監視開始
     */
    monitorResources(interval = 5000) {
        return this.reporting.monitorResources(interval);
    }
    
    /**
     * パフォーマンスレポート生成
     */
    generateReport() {
        return this.reporting.generateReport();
    }
    
    /**
     * レポートダウンロード
     */
    downloadReport(format = 'json') {
        return this.reporting.downloadReport(format);
    }
    
    /**
     * パフォーマンス傾向分析
     */
    analyzeTrends() {
        return this.reporting.analyzeTrends();
    }
    
    /**
     * アラート条件チェック
     */
    checkAlerts() {
        return this.reporting.checkAlerts();
    }
    
    /**
     * しきい値設定
     */
    setThresholds(newThresholds) {
        return this.core.setThresholds(newThresholds);
    }
    
    /**
     * リスナー追加
     */
    addListener(listener) {
        return this.core.addListener(listener);
    }
    
    /**
     * リスナー削除
     */
    removeListener(listener) {
        return this.core.removeListener(listener);
    }
    
    /**
     * 統計リセット
     */
    resetStats() {
        this.core.resetStats();
        this.benchmark.clearResults();
        this.reporting.clearHistory();
    }
    
    /**
     * デバッグ情報出力
     */
    debugInfo() {
        return this.core.debugInfo();
    }
    
    /**
     * 最適化実行
     */
    optimize() {
        // メモリ測定
        this.measureMemory();
        
        // アラートチェック
        const alerts = this.checkAlerts();
        if (alerts.length > 0) {
            console.warn('📊 Performance alerts detected:', alerts);
        }
        
        // 古い履歴の削除
        if (this.reporting.resourceHistory.length > 50) {
            this.reporting.resourceHistory = this.reporting.resourceHistory.slice(-25);
        }
        
        console.log('📊 PerformanceMonitor optimized');
    }
    
    /**
     * 包括的パフォーマンステスト
     */
    async runComprehensiveTest() {
        console.log('📊 Running comprehensive performance test...');
        
        const results = {
            systemBenchmark: await this.benchmark.runSystemBenchmark(),
            currentStats: this.getStats(),
            trends: this.analyzeTrends(),
            alerts: this.checkAlerts()
        };
        
        console.log('📊 Comprehensive test completed:', results);
        return results;
    }
    
    /**
     * 監視停止
     */
    stopMonitoring() {
        this.reporting.stopMonitoring();
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.core.destroy();
        this.reporting.destroy();
        
        console.log('📊 PerformanceMonitor destroyed');
    }
}

// グローバルシングルトンインスタンス
let globalPerformanceMonitor = null;

/**
 * グローバルパフォーマンスモニター取得
 */
export function getPerformanceMonitor() {
    if (!globalPerformanceMonitor) {
        globalPerformanceMonitor = new PerformanceMonitor();
    }
    return globalPerformanceMonitor;
}

/**
 * 簡易計測用ヘルパー関数
 */
export function measure(name, operation) {
    const monitor = getPerformanceMonitor();
    monitor.startTimer(name);
    
    if (operation && typeof operation === 'function') {
        try {
            const result = operation();
            if (result && typeof result.then === 'function') {
                // Promise の場合
                return result.finally(() => {
                    monitor.endTimer(name);
                });
            } else {
                // 同期処理の場合
                monitor.endTimer(name);
                return result;
            }
        } catch (error) {
            monitor.endTimer(name);
            throw error;
        }
    }
    
    // タイマーのみ開始（手動で endTimer を呼ぶ）
    return () => monitor.endTimer(name);
}
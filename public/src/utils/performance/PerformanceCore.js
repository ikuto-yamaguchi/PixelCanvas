// パフォーマンス監視コア機能
import { CONFIG } from '../../../Config.js';

/**
 * パフォーマンス監視コアクラス
 * 基本的な計測とタイマー機能を提供
 */
export class PerformanceCore {
    constructor() {
        // フレームレート監視
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.frameTimeHistory = [];
        this.maxFrameHistory = 60;
        this.currentFPS = 0;
        this.targetFPS = 60;
        
        // メモリ監視
        this.memoryStats = {
            used: 0,
            total: 0,
            peak: 0,
            lastMeasured: 0
        };
        
        // 処理時間監視
        this.timers = new Map();
        this.profileResults = new Map();
        
        // パフォーマンス統計
        this.stats = {
            render: {
                totalTime: 0,
                averageTime: 0,
                maxTime: 0,
                minTime: Infinity,
                samples: 0
            },
            dataLoad: {
                totalTime: 0,
                averageTime: 0,
                maxTime: 0,
                minTime: Infinity,
                samples: 0
            },
            network: {
                totalTime: 0,
                averageTime: 0,
                maxTime: 0,
                minTime: Infinity,
                samples: 0
            }
        };
        
        // 警告しきい値
        this.thresholds = {
            fps: 30,
            memoryMB: 100,
            renderTimeMs: 16.67, // 60FPS の1フレーム時間
            networkTimeMs: 1000
        };
        
        // イベントリスナー
        this.listeners = new Set();
        
        console.log('📊 PerformanceCore initialized');
    }
    
    /**
     * フレーム監視開始
     */
    startFrameMonitoring() {
        const measureFrame = (currentTime) => {
            this.frameCount++;
            
            if (this.lastFrameTime > 0) {
                const frameDelta = currentTime - this.lastFrameTime;
                this.frameTimeHistory.push(frameDelta);
                
                // 履歴サイズ制限
                while (this.frameTimeHistory.length > this.maxFrameHistory) {
                    this.frameTimeHistory.shift();
                }
                
                // FPS計算
                this.calculateFPS();
            }
            
            this.lastFrameTime = currentTime;
            requestAnimationFrame(measureFrame);
        };
        
        requestAnimationFrame(measureFrame);
    }
    
    /**
     * FPS計算
     */
    calculateFPS() {
        if (this.frameTimeHistory.length < 2) return;
        
        const totalTime = this.frameTimeHistory.reduce((sum, time) => sum + time, 0);
        const averageFrameTime = totalTime / this.frameTimeHistory.length;
        this.currentFPS = Math.round(1000 / averageFrameTime);
        
        // FPS警告チェック
        if (this.currentFPS < this.thresholds.fps) {
            this.notifyListeners({
                type: 'fps_warning',
                fps: this.currentFPS,
                threshold: this.thresholds.fps
            });
        }
    }
    
    /**
     * メモリ使用量測定
     */
    measureMemory() {
        if (!performance.memory) {
            return null;
        }
        
        const memory = performance.memory;
        this.memoryStats = {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
            peak: Math.max(this.memoryStats.peak, Math.round(memory.usedJSHeapSize / 1024 / 1024)),
            lastMeasured: Date.now()
        };
        
        // メモリ警告チェック
        if (this.memoryStats.used > this.thresholds.memoryMB) {
            this.notifyListeners({
                type: 'memory_warning',
                memoryMB: this.memoryStats.used,
                threshold: this.thresholds.memoryMB
            });
        }
        
        return this.memoryStats;
    }
    
    /**
     * 処理時間計測開始
     */
    startTimer(name) {
        this.timers.set(name, {
            startTime: performance.now(),
            startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0
        });
    }
    
    /**
     * 処理時間計測終了
     */
    endTimer(name) {
        const timer = this.timers.get(name);
        if (!timer) {
            console.warn(`📊 Timer ${name} not found`);
            return null;
        }
        
        const endTime = performance.now();
        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        
        const result = {
            name,
            duration: endTime - timer.startTime,
            memoryDelta: endMemory - timer.startMemory,
            timestamp: endTime
        };
        
        this.timers.delete(name);
        
        // 統計に追加
        this.addToStats(name, result.duration);
        
        // プロファイル結果を保存
        if (!this.profileResults.has(name)) {
            this.profileResults.set(name, []);
        }
        const results = this.profileResults.get(name);
        results.push(result);
        
        // 結果履歴制限
        while (results.length > 100) {
            results.shift();
        }
        
        return result;
    }
    
    /**
     * 統計情報更新
     */
    addToStats(category, duration) {
        if (!this.stats[category]) {
            this.stats[category] = {
                totalTime: 0,
                averageTime: 0,
                maxTime: 0,
                minTime: Infinity,
                samples: 0
            };
        }
        
        const stat = this.stats[category];
        stat.totalTime += duration;
        stat.samples++;
        stat.averageTime = stat.totalTime / stat.samples;
        stat.maxTime = Math.max(stat.maxTime, duration);
        stat.minTime = Math.min(stat.minTime, duration);
        
        // 警告チェック
        this.checkPerformanceThresholds(category, duration);
    }
    
    /**
     * パフォーマンス警告チェック
     */
    checkPerformanceThresholds(category, duration) {
        let threshold = null;
        
        switch (category) {
            case 'render':
                threshold = this.thresholds.renderTimeMs;
                break;
            case 'network':
                threshold = this.thresholds.networkTimeMs;
                break;
        }
        
        if (threshold && duration > threshold) {
            this.notifyListeners({
                type: 'performance_warning',
                category,
                duration,
                threshold
            });
        }
    }
    
    /**
     * 現在のパフォーマンス統計取得
     */
    getStats() {
        this.measureMemory();
        
        return {
            fps: this.currentFPS,
            frameCount: this.frameCount,
            memory: this.memoryStats,
            timers: Object.fromEntries(this.stats),
            activeTimers: Array.from(this.timers.keys()),
            timestamp: Date.now()
        };
    }
    
    /**
     * 詳細プロファイル情報取得
     */
    getProfileResults(category = null) {
        if (category) {
            return this.profileResults.get(category) || [];
        }
        
        const results = {};
        for (const [key, value] of this.profileResults.entries()) {
            results[key] = value;
        }
        return results;
    }
    
    /**
     * しきい値設定
     */
    setThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        console.log('📊 Performance thresholds updated:', this.thresholds);
    }
    
    /**
     * リスナー追加
     */
    addListener(listener) {
        this.listeners.add(listener);
    }
    
    /**
     * リスナー削除
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    
    /**
     * リスナー通知
     */
    notifyListeners(data) {
        this.listeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error('📊 Performance listener error:', error);
            }
        });
    }
    
    /**
     * パフォーマンス警告リセット
     */
    resetStats() {
        this.frameCount = 0;
        this.frameTimeHistory = [];
        this.timers.clear();
        this.profileResults.clear();
        
        // 統計リセット
        for (const stat of Object.values(this.stats)) {
            stat.totalTime = 0;
            stat.averageTime = 0;
            stat.maxTime = 0;
            stat.minTime = Infinity;
            stat.samples = 0;
        }
        
        this.memoryStats.peak = 0;
        
        console.log('📊 Performance stats reset');
    }
    
    /**
     * デバッグ情報出力
     */
    debugInfo() {
        const stats = this.getStats();
        console.log('📊 Performance Debug Info:', {
            fps: stats.fps,
            memory: stats.memory,
            timers: stats.timers,
            thresholds: this.thresholds
        });
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.resetStats();
        this.listeners.clear();
        console.log('📊 PerformanceCore destroyed');
    }
}
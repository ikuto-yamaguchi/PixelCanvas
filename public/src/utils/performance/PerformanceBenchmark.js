// パフォーマンスベンチマーク機能
/**
 * パフォーマンスベンチマーククラス
 * 処理速度測定とベンチマークテストを提供
 */
export class PerformanceBenchmark {
    constructor(performanceCore) {
        this.core = performanceCore;
        this.benchmarkResults = new Map();
        
        console.log('📊 PerformanceBenchmark initialized');
    }
    
    /**
     * ベンチマーク実行
     */
    async benchmark(name, operation, iterations = 100) {
        const results = [];
        
        console.log(`📊 Starting benchmark: ${name} (${iterations} iterations)`);
        
        for (let i = 0; i < iterations; i++) {
            this.core.startTimer(`benchmark_${name}_${i}`);
            
            try {
                if (typeof operation === 'function') {
                    await operation();
                } else {
                    await operation;
                }
            } catch (error) {
                console.error(`📊 Benchmark error in iteration ${i}:`, error);
            }
            
            const result = this.core.endTimer(`benchmark_${name}_${i}`);
            if (result) {
                results.push(result.duration);
            }
        }
        
        // 統計計算
        const sorted = results.sort((a, b) => a - b);
        const statistics = {
            name,
            iterations,
            total: results.reduce((sum, time) => sum + time, 0),
            average: results.reduce((sum, time) => sum + time, 0) / results.length,
            median: sorted[Math.floor(sorted.length / 2)],
            min: Math.min(...results),
            max: Math.max(...results),
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
        
        // 結果を保存
        this.benchmarkResults.set(name, statistics);
        
        console.log(`📊 Benchmark results for ${name}:`, statistics);
        return statistics;
    }
    
    /**
     * 複数ベンチマーク実行
     */
    async runMultipleBenchmarks(benchmarks) {
        const results = new Map();
        
        for (const { name, operation, iterations } of benchmarks) {
            try {
                const result = await this.benchmark(name, operation, iterations);
                results.set(name, result);
            } catch (error) {
                console.error(`📊 Benchmark ${name} failed:`, error);
                results.set(name, { error: error.message });
            }
        }
        
        return results;
    }
    
    /**
     * 関数実行時間測定
     */
    async measureFunction(fn, name = 'function') {
        const startTime = performance.now();
        const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        
        let result = null;
        let error = null;
        
        try {
            result = await fn();
        } catch (err) {
            error = err;
        }
        
        const endTime = performance.now();
        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        
        const measurement = {
            name,
            duration: endTime - startTime,
            memoryDelta: endMemory - startMemory,
            result,
            error,
            timestamp: endTime
        };
        
        return measurement;
    }
    
    /**
     * DOM操作ベンチマーク
     */
    async benchmarkDOMOperations() {
        const benchmarks = [
            {
                name: 'createElement',
                operation: () => {
                    for (let i = 0; i < 1000; i++) {
                        const div = document.createElement('div');
                        div.textContent = `Test ${i}`;
                    }
                },
                iterations: 50
            },
            {
                name: 'querySelector',
                operation: () => {
                    for (let i = 0; i < 100; i++) {
                        document.querySelector('body');
                    }
                },
                iterations: 50
            },
            {
                name: 'appendChild',
                operation: () => {
                    const fragment = document.createDocumentFragment();
                    for (let i = 0; i < 100; i++) {
                        const div = document.createElement('div');
                        fragment.appendChild(div);
                    }
                },
                iterations: 50
            }
        ];
        
        return await this.runMultipleBenchmarks(benchmarks);
    }
    
    /**
     * Canvas描画ベンチマーク
     */
    async benchmarkCanvasOperations() {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1000;
        const ctx = canvas.getContext('2d');
        
        const benchmarks = [
            {
                name: 'fillRect',
                operation: () => {
                    for (let i = 0; i < 10000; i++) {
                        ctx.fillRect(i % 1000, Math.floor(i / 1000), 1, 1);
                    }
                },
                iterations: 10
            },
            {
                name: 'putImageData',
                operation: () => {
                    const imageData = ctx.createImageData(100, 100);
                    for (let i = 0; i < 10; i++) {
                        ctx.putImageData(imageData, i * 10, i * 10);
                    }
                },
                iterations: 20
            },
            {
                name: 'drawImage',
                operation: () => {
                    const imgCanvas = document.createElement('canvas');
                    imgCanvas.width = 10;
                    imgCanvas.height = 10;
                    for (let i = 0; i < 1000; i++) {
                        ctx.drawImage(imgCanvas, i % 100 * 10, Math.floor(i / 100) * 10);
                    }
                },
                iterations: 10
            }
        ];
        
        return await this.runMultipleBenchmarks(benchmarks);
    }
    
    /**
     * メモリアロケーションベンチマーク
     */
    async benchmarkMemoryOperations() {
        const benchmarks = [
            {
                name: 'arrayCreation',
                operation: () => {
                    for (let i = 0; i < 1000; i++) {
                        new Array(1000).fill(0);
                    }
                },
                iterations: 10
            },
            {
                name: 'objectCreation',
                operation: () => {
                    for (let i = 0; i < 1000; i++) {
                        const obj = { x: i, y: i, z: i, data: new Array(100) };
                    }
                },
                iterations: 20
            },
            {
                name: 'stringConcatenation',
                operation: () => {
                    let str = '';
                    for (let i = 0; i < 10000; i++) {
                        str += i.toString();
                    }
                },
                iterations: 10
            }
        ];
        
        return await this.runMultipleBenchmarks(benchmarks);
    }
    
    /**
     * 包括的システムベンチマーク
     */
    async runSystemBenchmark() {
        console.log('📊 Running comprehensive system benchmark...');
        
        const results = {
            dom: await this.benchmarkDOMOperations(),
            canvas: await this.benchmarkCanvasOperations(),
            memory: await this.benchmarkMemoryOperations(),
            systemInfo: this.getSystemInfo()
        };
        
        // 総合スコア計算
        const overallScore = this.calculateOverallScore(results);
        results.overallScore = overallScore;
        
        console.log('📊 System benchmark completed:', results);
        return results;
    }
    
    /**
     * システム情報取得
     */
    getSystemInfo() {
        return {
            userAgent: navigator.userAgent,
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown',
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink
            } : 'unknown',
            pixelRatio: window.devicePixelRatio || 1,
            screenResolution: `${screen.width}x${screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`
        };
    }
    
    /**
     * 総合スコア計算
     */
    calculateOverallScore(results) {
        const weights = {
            dom: 0.3,
            canvas: 0.4,
            memory: 0.3
        };
        
        let totalScore = 0;
        let totalWeight = 0;
        
        for (const [category, weight] of Object.entries(weights)) {
            if (results[category] && typeof results[category] === 'object') {
                const categoryScore = this.calculateCategoryScore(results[category]);
                totalScore += categoryScore * weight;
                totalWeight += weight;
            }
        }
        
        return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    }
    
    /**
     * カテゴリスコア計算
     */
    calculateCategoryScore(categoryResults) {
        let totalScore = 0;
        let count = 0;
        
        for (const [name, result] of categoryResults.entries()) {
            if (result.error) continue;
            
            // 基準値との比較でスコア計算（低いほど良い）
            const baselineMs = this.getBaseline(name);
            if (baselineMs) {
                const score = Math.max(0, 100 - (result.average / baselineMs) * 50);
                totalScore += score;
                count++;
            }
        }
        
        return count > 0 ? totalScore / count : 50; // デフォルトスコア
    }
    
    /**
     * ベースライン値取得
     */
    getBaseline(benchmarkName) {
        const baselines = {
            'createElement': 10,    // 10ms
            'querySelector': 5,     // 5ms
            'appendChild': 8,       // 8ms
            'fillRect': 20,         // 20ms
            'putImageData': 15,     // 15ms
            'drawImage': 25,        // 25ms
            'arrayCreation': 30,    // 30ms
            'objectCreation': 20,   // 20ms
            'stringConcatenation': 50 // 50ms
        };
        
        return baselines[benchmarkName] || null;
    }
    
    /**
     * ベンチマーク結果比較
     */
    compareResults(name1, name2) {
        const result1 = this.benchmarkResults.get(name1);
        const result2 = this.benchmarkResults.get(name2);
        
        if (!result1 || !result2) {
            return null;
        }
        
        return {
            name1,
            name2,
            averageDiff: result2.average - result1.average,
            medianDiff: result2.median - result1.median,
            improvement: ((result1.average - result2.average) / result1.average * 100).toFixed(2)
        };
    }
    
    /**
     * ベンチマーク結果エクスポート
     */
    exportResults() {
        const results = {
            timestamp: new Date().toISOString(),
            systemInfo: this.getSystemInfo(),
            benchmarks: Object.fromEntries(this.benchmarkResults)
        };
        
        return JSON.stringify(results, null, 2);
    }
    
    /**
     * 結果クリア
     */
    clearResults() {
        this.benchmarkResults.clear();
        console.log('📊 Benchmark results cleared');
    }
}
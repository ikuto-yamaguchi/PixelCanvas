// 📊 Performance Monitor for Ultra Fast PixelCanvas
// Tracks: Loading time, FPS, Latency, Memory usage

export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            // Loading performance
            loadingStages: [],
            totalLoadTime: 0,
            targetLoadTime: 10000, // 10 seconds
            
            // Rendering performance  
            fps: 0,
            averageFrameTime: 0,
            targetFPS: 60,
            frameCount: 0,
            
            // Network performance
            updateLatency: 0,
            averageLatency: 0,
            targetLatency: 100, // 100ms
            messagesReceived: 0,
            
            // Memory usage
            memoryUsage: 0,
            pixelCount: 0,
            cacheSize: 0,
            targetMemory: 20 * 1024 * 1024 // 20MB
        };
        
        this.startTime = performance.now();
        this.lastFrameTime = 0;
        this.isMonitoring = false;
        
        // Performance thresholds
        this.thresholds = {
            excellent: { load: 3000, fps: 58, latency: 50, memory: 10 },
            good: { load: 7000, fps: 45, latency: 100, memory: 20 },
            poor: { load: 15000, fps: 30, latency: 200, memory: 50 }
        };
    }
    
    // 🚀 ローディング測定開始
    startLoadingMeasurement() {
        this.startTime = performance.now();
        this.metrics.loadingStages = [];
        console.log('📊 Performance monitoring started');
    }
    
    // ⏱️ ローディングステージ記録
    recordLoadingStage(stageName, duration, pixelCount) {
        const stage = {
            name: stageName,
            duration,
            pixelCount,
            timestamp: performance.now() - this.startTime
        };
        
        this.metrics.loadingStages.push(stage);
        
        const isWithinTarget = this.checkLoadingTarget(stage);
        console.log(`📊 Stage ${stageName}: ${duration.toFixed(0)}ms, ${pixelCount} pixels ${isWithinTarget ? '✅' : '⚠️'}`);
    }
    
    // 🎯 ローディング目標チェック
    checkLoadingTarget(stage) {
        const targets = {
            immediate: 500,   // 0.5s
            detailed: 3000,   // 3s
            complete: 10000   // 10s
        };
        
        return stage.duration <= (targets[stage.name] || 10000);
    }
    
    // 🎨 フレームレート測定
    measureFrame() {
        const now = performance.now();
        
        if (this.lastFrameTime) {
            const frameTime = now - this.lastFrameTime;
            this.metrics.averageFrameTime = (this.metrics.averageFrameTime + frameTime) / 2;
            this.metrics.fps = 1000 / this.metrics.averageFrameTime;
        }
        
        this.lastFrameTime = now;
        this.metrics.frameCount++;
        
        // 1秒ごとにFPS報告
        if (this.metrics.frameCount % 60 === 0) {\n            const fpsGrade = this.gradeFPS(this.metrics.fps);\n            console.log(`📊 FPS: ${this.metrics.fps.toFixed(1)} (${fpsGrade})`);\n        }\n    }\n    \n    // 📡 ネットワーク遅延測定\n    measureLatency(sendTime, receiveTime) {\n        const latency = receiveTime - sendTime;\n        this.metrics.updateLatency = latency;\n        this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;\n        this.metrics.messagesReceived++;\n        \n        const latencyGrade = this.gradeLatency(latency);\n        \n        if (this.metrics.messagesReceived % 10 === 0) {\n            console.log(`📊 Latency: ${latency.toFixed(0)}ms avg: ${this.metrics.averageLatency.toFixed(0)}ms (${latencyGrade})`);\n        }\n    }\n    \n    // 💾 メモリ使用量測定\n    measureMemory(pixelCount, cacheSize) {\n        this.metrics.pixelCount = pixelCount;\n        this.metrics.cacheSize = cacheSize;\n        \n        // 概算メモリ使用量計算\n        this.metrics.memoryUsage = (\n            pixelCount * 5 +      // 5 bytes per pixel\n            cacheSize * 1024 +    // 1KB per cache entry\n            1024 * 1024           // 1MB base overhead\n        );\n        \n        const memoryGrade = this.gradeMemory(this.metrics.memoryUsage);\n        \n        if (this.metrics.frameCount % 300 === 0) { // 5秒ごと\n            console.log(`📊 Memory: ${(this.metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB (${memoryGrade})`);\n        }\n    }\n    \n    // 🏆 総合パフォーマンス評価\n    getOverallGrade() {\n        const loadGrade = this.gradeLoading(this.metrics.totalLoadTime);\n        const fpsGrade = this.gradeFPS(this.metrics.fps);\n        const latencyGrade = this.gradeLatency(this.metrics.averageLatency);\n        const memoryGrade = this.gradeMemory(this.metrics.memoryUsage);\n        \n        const grades = [loadGrade, fpsGrade, latencyGrade, memoryGrade];\n        const scores = grades.map(grade => {\n            switch(grade) {\n                case 'excellent': return 3;\n                case 'good': return 2;\n                case 'poor': return 1;\n                default: return 0;\n            }\n        });\n        \n        const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;\n        \n        if (averageScore >= 2.5) return 'excellent';\n        if (averageScore >= 1.5) return 'good';\n        return 'poor';\n    }\n    \n    // 📊 個別グレーディング関数\n    gradeLoading(loadTime) {\n        if (loadTime <= this.thresholds.excellent.load) return 'excellent';\n        if (loadTime <= this.thresholds.good.load) return 'good';\n        return 'poor';\n    }\n    \n    gradeFPS(fps) {\n        if (fps >= this.thresholds.excellent.fps) return 'excellent';\n        if (fps >= this.thresholds.good.fps) return 'good';\n        return 'poor';\n    }\n    \n    gradeLatency(latency) {\n        if (latency <= this.thresholds.excellent.latency) return 'excellent';\n        if (latency <= this.thresholds.good.latency) return 'good';\n        return 'poor';\n    }\n    \n    gradeMemory(memoryMB) {\n        const mb = memoryMB / 1024 / 1024;\n        if (mb <= this.thresholds.excellent.memory) return 'excellent';\n        if (mb <= this.thresholds.good.memory) return 'good';\n        return 'poor';\n    }\n    \n    // 📈 詳細レポート生成\n    generateReport() {\n        const overallGrade = this.getOverallGrade();\n        \n        return {\n            overall: overallGrade,\n            timestamp: new Date().toISOString(),\n            \n            loading: {\n                totalTime: this.metrics.totalLoadTime,\n                stages: this.metrics.loadingStages,\n                grade: this.gradeLoading(this.metrics.totalLoadTime),\n                target: this.metrics.targetLoadTime,\n                success: this.metrics.totalLoadTime <= this.metrics.targetLoadTime\n            },\n            \n            rendering: {\n                fps: this.metrics.fps,\n                averageFrameTime: this.metrics.averageFrameTime,\n                frameCount: this.metrics.frameCount,\n                grade: this.gradeFPS(this.metrics.fps),\n                target: this.metrics.targetFPS,\n                success: this.metrics.fps >= this.metrics.targetFPS * 0.9\n            },\n            \n            network: {\n                latency: this.metrics.updateLatency,\n                averageLatency: this.metrics.averageLatency,\n                messagesReceived: this.metrics.messagesReceived,\n                grade: this.gradeLatency(this.metrics.averageLatency),\n                target: this.metrics.targetLatency,\n                success: this.metrics.averageLatency <= this.metrics.targetLatency\n            },\n            \n            memory: {\n                usage: this.metrics.memoryUsage,\n                usageMB: this.metrics.memoryUsage / 1024 / 1024,\n                pixelCount: this.metrics.pixelCount,\n                cacheSize: this.metrics.cacheSize,\n                grade: this.gradeMemory(this.metrics.memoryUsage),\n                target: this.metrics.targetMemory,\n                success: this.metrics.memoryUsage <= this.metrics.targetMemory\n            }\n        };\n    }\n    \n    // 🎯 目標達成状況\n    checkTargets() {\n        const report = this.generateReport();\n        \n        const results = {\n            loading: report.loading.success,\n            fps: report.rendering.success,\n            latency: report.network.success,\n            memory: report.memory.success\n        };\n        \n        const successCount = Object.values(results).filter(Boolean).length;\n        const totalTargets = Object.keys(results).length;\n        \n        console.log(`🎯 Targets achieved: ${successCount}/${totalTargets}`);\n        console.log('📊 Performance report:', report);\n        \n        return {\n            ...results,\n            overall: successCount === totalTargets,\n            grade: report.overall,\n            report\n        };\n    }\n    \n    // 🚀 監視開始\n    startMonitoring() {\n        this.isMonitoring = true;\n        \n        // 定期レポート (30秒ごと)\n        setInterval(() => {\n            if (this.isMonitoring) {\n                this.checkTargets();\n            }\n        }, 30000);\n        \n        console.log('📊 Performance monitoring active');\n    }\n    \n    // 🛑 監視停止\n    stopMonitoring() {\n        this.isMonitoring = false;\n        \n        const finalReport = this.checkTargets();\n        console.log('📊 Final performance report:', finalReport);\n        \n        return finalReport;\n    }\n    \n    // 📱 モバイル最適化チェック\n    checkMobileOptimization() {\n        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);\n        \n        if (isMobile) {\n            // モバイル向け調整\n            this.thresholds.good.fps = 30; // モバイルは30fps\n            this.thresholds.excellent.memory = 15; // メモリ制限厳しく\n            \n            console.log('📱 Mobile optimization enabled');\n        }\n        \n        return isMobile;\n    }\n}
// Performance Monitor for Ultra Fast PixelCanvas
// Tracks: Loading time, FPS, Latency, Memory usage

export class PerformanceMonitor {
    constructor() {
        // Performance metrics
        this.metrics = {
            // Loading performance
            loadingStartTime: 0,
            loadingEndTime: 0,
            totalLoadTime: 0,
            stageLoadTimes: {},
            
            // Runtime performance
            fps: 0,
            averageFPS: 0,
            frameCount: 0,
            lastFrameTime: 0,
            
            // Network latency
            latency: 0,
            averageLatency: 0,
            latencyCount: 0,
            totalLatency: 0,
            
            // Memory usage
            memoryUsage: 0,
            peakMemoryUsage: 0,
            
            // Pixel rendering
            pixelsRendered: 0,
            renderTime: 0
        };
        
        // Performance targets
        this.targets = {
            maxLoadTime: 10000,    // 10 seconds
            minFPS: 30,            // 30 FPS minimum
            maxLatency: 100,       // 100ms maximum
            maxMemoryMB: 100       // 100MB maximum
        };
        
        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        // Performance history for averaging
        this.fpsHistory = [];
        this.latencyHistory = [];
        this.maxHistorySize = 60; // 1 second at 60fps
        
        console.log('Performance Monitor initialized');
    }
    
    // Start monitoring
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.metrics.loadingStartTime = performance.now();
        
        // Monitor every 100ms
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
        }, 100);
        
        console.log('Performance monitoring started');
    }
    
    // Stop monitoring
    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('Performance monitoring stopped');
    }
    
    // Mark loading stage completion
    markStageComplete(stageName, pixelsLoaded = 0) {
        const currentTime = performance.now();
        const stageTime = currentTime - this.metrics.loadingStartTime;
        
        this.metrics.stageLoadTimes[stageName] = {
            time: stageTime,
            pixelsLoaded,
            timestamp: currentTime
        };
        
        console.log(`Stage '${stageName}' completed in ${stageTime.toFixed(1)}ms (${pixelsLoaded} pixels)`);
        
        // Check if this is the final stage
        if (stageName === 'complete') {
            this.markLoadingComplete();
        }
    }
    
    // Mark loading complete
    markLoadingComplete() {
        this.metrics.loadingEndTime = performance.now();
        this.metrics.totalLoadTime = this.metrics.loadingEndTime - this.metrics.loadingStartTime;
        
        const grade = this.getLoadingGrade();
        console.log(`Loading completed in ${this.metrics.totalLoadTime.toFixed(1)}ms (${grade})`);
        
        // Log detailed stage breakdown
        console.log('Loading stages:', this.metrics.stageLoadTimes);
    }
    
    // Update real-time metrics
    updateMetrics() {
        if (!this.isMonitoring) return;
        
        // Update FPS
        this.updateFPS();
        
        // Update memory usage
        this.updateMemoryUsage();
        
        // Log performance summary every 5 seconds
        if (this.metrics.frameCount % 300 === 0) {
            this.logPerformanceSummary();
        }
    }
    
    // Update FPS calculation
    updateFPS() {
        const currentTime = performance.now();
        
        if (this.metrics.lastFrameTime > 0) {
            const frameDelta = currentTime - this.metrics.lastFrameTime;
            const instantFPS = 1000 / frameDelta;
            
            // Add to history
            this.fpsHistory.push(instantFPS);
            if (this.fpsHistory.length > this.maxHistorySize) {
                this.fpsHistory.shift();
            }
            
            // Calculate average
            this.metrics.averageFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            this.metrics.fps = instantFPS;
        }
        
        this.metrics.lastFrameTime = currentTime;
        this.metrics.frameCount++;
    }
    
    // Update memory usage
    updateMemoryUsage() {
        if (performance.memory) {
            const memoryMB = performance.memory.usedJSHeapSize / 1024 / 1024;
            this.metrics.memoryUsage = memoryMB;
            
            if (memoryMB > this.metrics.peakMemoryUsage) {
                this.metrics.peakMemoryUsage = memoryMB;
            }
        }
    }
    
    // Record latency measurement
    recordLatency(latencyMs) {
        this.metrics.latency = latencyMs;
        this.metrics.totalLatency += latencyMs;
        this.metrics.latencyCount++;
        
        // Add to history
        this.latencyHistory.push(latencyMs);
        if (this.latencyHistory.length > this.maxHistorySize) {
            this.latencyHistory.shift();
        }
        
        // Calculate average
        this.metrics.averageLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    }
    
    // Record render performance
    recordRenderPerformance(pixelsRendered, renderTimeMs) {
        this.metrics.pixelsRendered = pixelsRendered;
        this.metrics.renderTime = renderTimeMs;
    }
    
    // Get loading performance grade
    getLoadingGrade() {
        const loadTime = this.metrics.totalLoadTime;
        
        if (loadTime <= 3000) return 'Excellent';
        if (loadTime <= 5000) return 'Good';
        if (loadTime <= 10000) return 'Acceptable';
        return 'Poor';
    }
    
    // Get runtime performance grade
    getRuntimeGrade() {
        const fps = this.metrics.averageFPS;
        const latency = this.metrics.averageLatency;
        const memory = this.metrics.memoryUsage;
        
        let score = 0;
        
        // FPS score (40% weight)
        if (fps >= 60) score += 40;
        else if (fps >= 30) score += 30;
        else if (fps >= 15) score += 20;
        else score += 10;
        
        // Latency score (40% weight)
        if (latency <= 50) score += 40;
        else if (latency <= 100) score += 30;
        else if (latency <= 200) score += 20;
        else score += 10;
        
        // Memory score (20% weight)
        if (memory <= 50) score += 20;
        else if (memory <= 100) score += 15;
        else if (memory <= 200) score += 10;
        else score += 5;
        
        if (score >= 90) return 'Excellent';
        if (score >= 70) return 'Good';
        if (score >= 50) return 'Acceptable';
        return 'Poor';
    }
    
    // Check if performance targets are met
    isPerformanceOptimal() {
        return (
            this.metrics.totalLoadTime <= this.targets.maxLoadTime &&
            this.metrics.averageFPS >= this.targets.minFPS &&
            this.metrics.averageLatency <= this.targets.maxLatency &&
            this.metrics.memoryUsage <= this.targets.maxMemoryMB
        );
    }
    
    // Get detailed performance report
    getPerformanceReport() {
        const loadingGrade = this.getLoadingGrade();
        const runtimeGrade = this.getRuntimeGrade();
        const isOptimal = this.isPerformanceOptimal();
        
        return {
            // Summary
            loadingGrade,
            runtimeGrade,
            isOptimal,
            
            // Loading metrics
            loading: {
                totalTime: this.metrics.totalLoadTime,
                stages: this.metrics.stageLoadTimes,
                grade: loadingGrade
            },
            
            // Runtime metrics
            runtime: {
                fps: Math.round(this.metrics.averageFPS),
                latency: Math.round(this.metrics.averageLatency),
                memory: Math.round(this.metrics.memoryUsage),
                pixelsRendered: this.metrics.pixelsRendered,
                renderTime: this.metrics.renderTime,
                grade: runtimeGrade
            },
            
            // Target comparison
            targets: this.targets,
            
            // Raw metrics
            raw: this.metrics
        };
    }
    
    // Log performance summary
    logPerformanceSummary() {
        const report = this.getPerformanceReport();
        
        console.log('Performance Summary:');
        console.log(`  Loading: ${report.loading.totalTime.toFixed(1)}ms (${report.loadingGrade})`);
        console.log(`  FPS: ${report.runtime.fps} (${report.runtime.grade})`);
        console.log(`  Latency: ${report.runtime.latency}ms`);
        console.log(`  Memory: ${report.runtime.memory}MB`);
        console.log(`  Pixels: ${report.runtime.pixelsRendered}`);
        console.log(`  Optimal: ${report.isOptimal ? 'YES' : 'NO'}`);
    }
    
    // Detect mobile device
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Get mobile-optimized settings
    getMobileOptimizations() {
        if (!this.isMobileDevice()) return null;
        
        return {
            targetFPS: 30,        // Lower FPS target for mobile
            maxPixels: 1000,      // Reduce pixel count
            lodBias: 1,           // More aggressive LOD
            memoryLimit: 50       // Lower memory limit
        };
    }
    
    // Export performance data
    exportData() {
        const report = this.getPerformanceReport();
        const timestamp = new Date().toISOString();
        
        return {
            timestamp,
            userAgent: navigator.userAgent,
            isMobile: this.isMobileDevice(),
            report
        };
    }
    
    // Start frame timing (call this each frame)
    startFrame() {
        this.frameStartTime = performance.now();
    }
    
    // End frame timing (call this at end of frame)
    endFrame() {
        if (this.frameStartTime) {
            const frameTime = performance.now() - this.frameStartTime;
            this.recordRenderPerformance(this.metrics.pixelsRendered, frameTime);
            this.updateFPS();
        }
    }
}
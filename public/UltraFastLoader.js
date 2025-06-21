// 🚀 Ultra Fast Progressive Loading System
// Target: 0.5s → 3s → 10s loading stages

import { CONFIG } from './Config.js';

export class UltraFastLoader {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.loadStages = {
            // Stage 1: 即座表示 (0.5秒) - 16x16 = 256ピクセル
            immediate: {
                resolution: 16,
                gridSize: 16, // 256÷16 = 16x16グリッド
                targetTime: 500,
                priority: 'immediate'
            },
            
            // Stage 2: 詳細表示 (3秒) - 4x4 = 4,096ピクセル  
            detailed: {
                resolution: 4,
                gridSize: 64, // 256÷4 = 64x64グリッド
                targetTime: 3000,
                priority: 'high'
            },
            
            // Stage 3: 完全表示 (10秒) - 全65,536ピクセル
            complete: {
                resolution: 1,
                gridSize: 256, // 256÷1 = 256x256フル解像度
                targetTime: 10000,
                priority: 'normal'
            }
        };
        
        this.loadedStages = new Set();
        this.stageData = new Map();
        this.loadStartTime = 0;
    }
    
    // 🚀 段階的ローディング開始
    async startProgressiveLoad() {
        this.loadStartTime = performance.now();
        console.log('🚀 Starting progressive loading...');
        
        // 並列ローディング開始 (Promise.allSettled使用)
        const loadPromises = [
            this.loadStage('immediate'),
            this.loadStage('detailed'),
            this.loadStage('complete')
        ];
        
        // 各ステージ完了時に即座にレンダリング
        for (let i = 0; i < loadPromises.length; i++) {
            try {
                const stageData = await loadPromises[i];
                const stageName = Object.keys(this.loadStages)[i];
                await this.renderStage(stageName, stageData);
            } catch (error) {
                console.warn(`Stage ${i} failed:`, error);
            }
        }
        
        const totalTime = performance.now() - this.loadStartTime;
        console.log(`✅ Progressive loading completed in ${totalTime.toFixed(0)}ms`);
    }
    
    // 🔥 個別ステージのローディング
    async loadStage(stageName) {
        const stage = this.loadStages[stageName];
        const stageStartTime = performance.now();
        
        try {
            console.log(`📥 Loading stage: ${stageName} (${stage.gridSize}x${stage.gridSize})`);
            
            let pixelData;
            
            if (stageName === 'immediate') {
                // 最高優先度: プリ計算されたLODデータ
                pixelData = await this.loadLODData(stage.resolution);
            } else if (stageName === 'detailed') {
                // 中優先度: サンプリングデータ
                pixelData = await this.loadSampledData(stage.resolution);
            } else {
                // 通常優先度: 全データ
                pixelData = await this.loadFullData();
            }
            
            const stageTime = performance.now() - stageStartTime;
            const isWithinTarget = stageTime <= stage.targetTime;
            
            console.log(`${isWithinTarget ? '✅' : '⚠️'} Stage ${stageName}: ${pixelData.length} pixels in ${stageTime.toFixed(0)}ms (target: ${stage.targetTime}ms)`);
            
            this.loadedStages.add(stageName);
            this.stageData.set(stageName, pixelData);
            
            return pixelData;
            
        } catch (error) {
            console.error(`❌ Stage ${stageName} failed:`, error);
            throw error;
        }
    }
    
    // 🎯 LODデータ読み込み (最高速)
    async loadLODData(resolution) {
        const startTime = performance.now();
        
        // まずはSupabaseから事前計算LODデータを取得
        try {
            const response = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/pixel_lods?` +
                `lod_level=eq.${resolution}&` +
                `select=grid_x,grid_y,dominant_color,pixel_count&` +
                `order=grid_x,grid_y`,
                {
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                    }
                }
            );
            
            if (response.ok) {
                const lodData = await response.json();
                const loadTime = performance.now() - startTime;
                console.log(`📊 LOD data loaded: ${lodData.length} entries in ${loadTime.toFixed(0)}ms`);
                
                // LODデータを実際のピクセル座標に展開
                return this.expandLODData(lodData, resolution);
            }
        } catch (error) {
            console.warn('LOD table not available, falling back to sampling:', error);
        }
        
        // フォールバック: サンプリング
        return this.loadSampledData(resolution);
    }
    
    // 📊 サンプリングデータ読み込み
    async loadSampledData(resolution) {
        const startTime = performance.now();
        const sampleSize = Math.floor(65536 / (resolution * resolution));
        
        // モジュロサンプリングで均等分散
        const response = await fetch(
            `${CONFIG.SUPABASE_URL}/rest/v1/pixels?` +
            `select=local_x,local_y,color&` +
            `sector_x=eq.0&sector_y=eq.0&` +
            `limit=${sampleSize}`,
            {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            }
        );
        
        const pixels = await response.json();
        
        // 解像度に応じてサンプリング
        const sampled = pixels.filter((_, index) => index % resolution === 0);
        
        const loadTime = performance.now() - startTime;
        console.log(`🎲 Sampled data loaded: ${sampled.length} pixels in ${loadTime.toFixed(0)}ms`);
        
        return sampled;
    }
    
    // 📦 全データ読み込み (バッチ処理)
    async loadFullData() {
        const startTime = performance.now();
        const batchSize = 2000; // 2000件ずつ高速バッチ
        let allPixels = [];
        let offset = 0;
        
        while (true) {
            const batchStartTime = performance.now();
            
            const response = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/pixels?` +
                `select=local_x,local_y,color&` +
                `sector_x=eq.0&sector_y=eq.0&` +
                `limit=${batchSize}&offset=${offset}`,
                {
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                    }
                }
            );
            
            const batch = await response.json();
            allPixels = allPixels.concat(batch);
            
            const batchTime = performance.now() - batchStartTime;
            console.log(`📦 Batch ${Math.floor(offset/batchSize) + 1}: ${batch.length} pixels in ${batchTime.toFixed(0)}ms`);
            
            if (batch.length < batchSize) break;
            offset += batchSize;
            
            // 20ms休憩でUI応答性維持
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        const loadTime = performance.now() - startTime;
        console.log(`📦 Full data loaded: ${allPixels.length} pixels in ${loadTime.toFixed(0)}ms`);
        
        return allPixels;
    }
    
    // 🎨 ステージレンダリング
    async renderStage(stageName, pixelData) {
        const renderStartTime = performance.now();
        
        try {
            // PixelStorageに格納
            this.storePixelData(pixelData, stageName);
            
            // レンダリング実行
            this.pixelCanvas.render();
            
            const renderTime = performance.now() - renderStartTime;
            const totalTime = performance.now() - this.loadStartTime;
            
            console.log(`🎨 Stage ${stageName} rendered in ${renderTime.toFixed(0)}ms (total: ${totalTime.toFixed(0)}ms)`);
            
        } catch (error) {
            console.error(`❌ Render stage ${stageName} failed:`, error);
        }
    }
    
    // 💾 ピクセルデータ格納
    storePixelData(pixelData, stageName) {
        const storage = this.pixelCanvas.pixelStorage;
        
        for (const pixel of pixelData) {
            storage.setPixel(
                0, 0, // sector 0,0
                pixel.local_x,
                pixel.local_y,
                pixel.color
            );
        }
        
        console.log(`💾 Stored ${pixelData.length} pixels for stage ${stageName}`);
    }
    
    // 🔍 LODデータ展開
    expandLODData(lodData, resolution) {
        const pixels = [];
        
        for (const lod of lodData) {
            // LODグリッドから実際の座標に展開
            const startX = lod.grid_x * resolution;
            const startY = lod.grid_y * resolution;
            
            // 代表色でブロック塗りつぶし
            for (let dx = 0; dx < resolution; dx++) {
                for (let dy = 0; dy < resolution; dy++) {
                    pixels.push({
                        local_x: startX + dx,
                        local_y: startY + dy,
                        color: lod.dominant_color
                    });
                }
            }
        }
        
        return pixels;
    }
    
    // 📊 ロード状況取得
    getLoadStatus() {
        return {
            stagesLoaded: Array.from(this.loadedStages),
            totalStages: Object.keys(this.loadStages).length,
            isComplete: this.loadedStages.size === Object.keys(this.loadStages).length,
            elapsedTime: this.loadStartTime ? performance.now() - this.loadStartTime : 0
        };
    }
}
// LODピラミッド生成とRLE処理システム
import { CONFIG, Utils } from './Config.js';

export class LODGenerator {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.rleWorker = null;
        this.generationQueue = [];
        this.isGenerating = false;
        
        this.initializeWorker();
    }
    
    initializeWorker() {
        // RLE処理用WebWorker作成
        const workerScript = `
            // RLE Encoder/Decoder Web Worker
            class RLECodec {
                encode(pixelArray, width, height) {
                    const rle = [];
                    let currentColor = pixelArray[0];
                    let count = 1;
                    
                    for (let i = 1; i < pixelArray.length; i++) {
                        if (pixelArray[i] === currentColor && count < 255) {
                            count++;
                        } else {
                            rle.push(currentColor, count);
                            currentColor = pixelArray[i];
                            count = 1;
                        }
                    }
                    rle.push(currentColor, count);
                    
                    return new Uint8Array(rle);
                }
                
                decode(rleData, width, height) {
                    const pixelArray = new Uint8Array(width * height);
                    let pos = 0;
                    
                    for (let i = 0; i < rleData.length; i += 2) {
                        const color = rleData[i];
                        const count = rleData[i + 1];
                        
                        for (let j = 0; j < count; j++) {
                            pixelArray[pos++] = color;
                        }
                    }
                    
                    return pixelArray;
                }
                
                downsample(pixelArray, width, height, factor) {
                    const newWidth = Math.floor(width / factor);
                    const newHeight = Math.floor(height / factor);
                    const downsampled = new Uint8Array(newWidth * newHeight);
                    
                    for (let y = 0; y < newHeight; y++) {
                        for (let x = 0; x < newWidth; x++) {
                            // factor x factor エリアの最頻色を取得
                            const colorCounts = new Map();
                            
                            for (let dy = 0; dy < factor; dy++) {
                                for (let dx = 0; dx < factor; dx++) {
                                    const srcX = x * factor + dx;
                                    const srcY = y * factor + dy;
                                    
                                    if (srcX < width && srcY < height) {
                                        const color = pixelArray[srcY * width + srcX];
                                        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
                                    }
                                }
                            }
                            
                            // 最頻色を取得
                            let maxCount = 0;
                            let dominantColor = 0;
                            for (const [color, count] of colorCounts) {
                                if (count > maxCount) {
                                    maxCount = count;
                                    dominantColor = color;
                                }
                            }
                            
                            downsampled[y * newWidth + x] = dominantColor;
                        }
                    }
                    
                    return downsampled;
                }
            }
            
            const codec = new RLECodec();
            
            self.addEventListener('message', (e) => {
                const { type, data } = e.data;
                
                try {
                    switch (type) {
                        case 'encode':
                            const encoded = codec.encode(data.pixelArray, data.width, data.height);
                            self.postMessage({
                                type: 'encoded',
                                id: data.id,
                                data: encoded,
                                originalSize: data.pixelArray.length,
                                compressedSize: encoded.length
                            });
                            break;
                            
                        case 'decode':
                            const decoded = codec.decode(data.rleData, data.width, data.height);
                            self.postMessage({
                                type: 'decoded',
                                id: data.id,
                                data: decoded
                            });
                            break;
                            
                        case 'downsample':
                            const downsampled = codec.downsample(
                                data.pixelArray, 
                                data.width, 
                                data.height, 
                                data.factor
                            );
                            const downsampledEncoded = codec.encode(
                                downsampled, 
                                Math.floor(data.width / data.factor),
                                Math.floor(data.height / data.factor)
                            );
                            
                            self.postMessage({
                                type: 'downsampled',
                                id: data.id,
                                data: downsampledEncoded,
                                width: Math.floor(data.width / data.factor),
                                height: Math.floor(data.height / data.factor),
                                avgColor: calculateAverageColor(downsampled)
                            });
                            break;
                    }
                } catch (error) {
                    self.postMessage({
                        type: 'error',
                        id: data.id,
                        error: error.message
                    });
                }
            });
            
            function calculateAverageColor(pixelArray) {
                const colorCounts = new Map();
                for (const color of pixelArray) {
                    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
                }
                
                let maxCount = 0;
                let dominantColor = 0;
                for (const [color, count] of colorCounts) {
                    if (count > maxCount) {
                        maxCount = count;
                        dominantColor = color;
                    }
                }
                return dominantColor;
            }
        `;
        
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.rleWorker = new Worker(URL.createObjectURL(blob));
        
        this.rleWorker.addEventListener('message', (e) => {
            this.handleWorkerMessage(e.data);
        });
        
        console.log('✅ RLE Worker initialized');
    }
    
    handleWorkerMessage(message) {
        const { type, id, data, error } = message;
        
        switch (type) {
            case 'encoded':
                console.log(`📦 RLE encoded: ${message.originalSize} → ${message.compressedSize} bytes (${((1 - message.compressedSize / message.originalSize) * 100).toFixed(1)}% reduction)`);
                this.handleEncodedResult(id, data);
                break;
                
            case 'decoded':
                this.handleDecodedResult(id, data);
                break;
                
            case 'downsampled':
                console.log(`⬇️ Downsampled LOD: ${message.width}x${message.height}`);
                this.handleDownsampledResult(id, data, message.width, message.height, message.avgColor);
                break;
                
            case 'error':
                console.error(`❌ Worker error:`, error);
                break;
        }
    }
    
    async generateAllLODsForSector(sectorX, sectorY) {
        console.log(`🏗️ Generating LOD pyramid for sector (${sectorX}, ${sectorY})`);
        
        // 既存のピクセルデータを取得
        const pixelArray = this.extractSectorPixels(sectorX, sectorY);
        
        if (!pixelArray || pixelArray.every(p => p === 0)) {
            console.log(`⏭️ Skipping empty sector (${sectorX}, ${sectorY})`);
            return;
        }
        
        // Level 0 (256x256) - 元解像度
        await this.generateLODLevel(sectorX, sectorY, 0, pixelArray, 256, 256);
        
        // Level 1,2,3 - 段階的縮小
        for (let level = 1; level <= 3; level++) {
            const factor = Math.pow(2, level);
            await this.downsampleAndSave(sectorX, sectorY, level, pixelArray, 256, 256, factor);
        }
    }
    
    extractSectorPixels(sectorX, sectorY) {
        const pixelArray = new Uint8Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
        const pixelStorage = this.pixelCanvas.pixelStorage;
        
        for (let localY = 0; localY < CONFIG.GRID_SIZE; localY++) {
            for (let localX = 0; localX < CONFIG.GRID_SIZE; localX++) {
                const color = pixelStorage.getPixel(sectorX, sectorY, localX, localY);
                pixelArray[localY * CONFIG.GRID_SIZE + localX] = color || 0;
            }
        }
        
        return pixelArray;
    }
    
    async generateLODLevel(sectorX, sectorY, level, pixelArray, width, height) {
        return new Promise((resolve) => {
            const id = `${sectorX},${sectorY}:${level}`;
            
            this.pendingOperations = this.pendingOperations || new Map();
            this.pendingOperations.set(id, { resolve, sectorX, sectorY, level, width, height });
            
            this.rleWorker.postMessage({
                type: 'encode',
                data: { id, pixelArray, width, height }
            });
        });
    }
    
    async downsampleAndSave(sectorX, sectorY, level, originalPixelArray, originalWidth, originalHeight, factor) {
        return new Promise((resolve) => {
            const id = `${sectorX},${sectorY}:${level}`;
            
            this.pendingOperations = this.pendingOperations || new Map();
            this.pendingOperations.set(id, { 
                resolve, sectorX, sectorY, level, 
                width: Math.floor(originalWidth / factor),
                height: Math.floor(originalHeight / factor)
            });
            
            this.rleWorker.postMessage({
                type: 'downsample',
                data: { 
                    id, 
                    pixelArray: originalPixelArray, 
                    width: originalWidth, 
                    height: originalHeight, 
                    factor 
                }
            });
        });
    }
    
    async handleEncodedResult(id, rleData) {
        const operation = this.pendingOperations?.get(id);
        if (!operation) return;
        
        await this.saveLODToDatabase(
            operation.sectorX,
            operation.sectorY,
            operation.level,
            operation.width,
            operation.height,
            rleData,
            0 // avgColor will be calculated later
        );
        
        this.pendingOperations.delete(id);
        operation.resolve();
    }
    
    async handleDownsampledResult(id, rleData, width, height, avgColor) {
        const operation = this.pendingOperations?.get(id);
        if (!operation) return;
        
        await this.saveLODToDatabase(
            operation.sectorX,
            operation.sectorY,
            operation.level,
            width,
            height,
            rleData,
            avgColor
        );
        
        this.pendingOperations.delete(id);
        operation.resolve();
    }
    
    async saveLODToDatabase(sectorX, sectorY, lodLevel, width, height, rleData, avgColor) {
        try {
            // RLEデータをBase64エンコード（PostgreSQL BYTEA用）
            const base64Data = btoa(String.fromCharCode(...rleData));
            
            const lodRecord = {
                sector_x: sectorX,
                sector_y: sectorY,
                lod_level: lodLevel,
                width: width,
                height: height,
                rle_data: base64Data,
                pixel_count: this.calculatePixelCount(rleData),
                avg_color: avgColor,
                last_updated: new Date().toISOString()
            };
            
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sector_lod`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(lodRecord)
            });
            
            if (!response.ok) {
                // 既存レコードがある場合は更新
                if (response.status === 409) {
                    await this.updateLODInDatabase(sectorX, sectorY, lodLevel, lodRecord);
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            
            console.log(`✅ Saved LOD ${lodLevel} for sector (${sectorX}, ${sectorY}): ${width}x${height}`);
            
        } catch (error) {
            console.error(`❌ Failed to save LOD ${lodLevel} for sector (${sectorX}, ${sectorY}):`, error);
        }
    }
    
    async updateLODInDatabase(sectorX, sectorY, lodLevel, lodRecord) {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sector_lod?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}&lod_level=eq.${lodLevel}`, {
            method: 'PATCH',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(lodRecord)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update LOD: ${response.status}`);
        }
        
        console.log(`🔄 Updated LOD ${lodLevel} for sector (${sectorX}, ${sectorY})`);
    }
    
    calculatePixelCount(rleData) {
        let count = 0;
        for (let i = 1; i < rleData.length; i += 2) {
            if (rleData[i - 1] !== 0) { // 0は空ピクセル
                count += rleData[i];
            }
        }
        return count;
    }
    
    // 既存データからLODピラミッドを一括生成
    async generateAllLODs() {
        console.log('🏗️ Starting LOD pyramid generation for all sectors...');
        
        const activeSectors = Array.from(this.pixelCanvas.activeSectors);
        let completed = 0;
        
        for (const sectorKey of activeSectors) {
            const [sectorX, sectorY] = Utils.parseSectorKey(sectorKey);
            
            try {
                await this.generateAllLODsForSector(sectorX, sectorY);
                completed++;
                
                if (completed % 5 === 0) {
                    console.log(`📊 LOD generation progress: ${completed}/${activeSectors.length} sectors completed`);
                }
                
                // UI応答性のため少し待機
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Failed to generate LOD for sector (${sectorX}, ${sectorY}):`, error);
            }
        }
        
        console.log(`✅ LOD pyramid generation completed: ${completed}/${activeSectors.length} sectors processed`);
    }
    
    // 単一ピクセル更新時のLOD更新
    async updateLODForPixelChange(sectorX, sectorY, localX, localY, color) {
        // リアルタイム更新: 影響を受けるLODレベルを特定
        const affectedLevels = [];
        
        for (let level = 0; level <= 3; level++) {
            const factor = Math.pow(2, level);
            const lodX = Math.floor(localX / factor);
            const lodY = Math.floor(localY / factor);
            
            // このピクセルがLODに影響するかチェック
            affectedLevels.push({ level, lodX, lodY, factor });
        }
        
        // 各LODレベルを更新
        for (const { level } of affectedLevels) {
            await this.generateAllLODsForSector(sectorX, sectorY);
            break; // とりあえず全レベル再生成（最適化は後で）
        }
    }
    
    // テスト用: シンプルなLOD生成デモ
    async testLODGeneration() {
        console.log('🧪 Testing LOD generation with sample data...');
        
        // サンプルピクセルデータを作成（チェッカーボードパターン）
        const testPixelArray = new Uint8Array(256 * 256);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const index = y * 256 + x;
                // チェッカーボードパターン（色1と色2を交互）
                testPixelArray[index] = ((x + y) % 2 === 0) ? 1 : 2;
            }
        }
        
        console.log('📦 Created test pattern: 256x256 checkerboard');
        
        // テスト用セクター(999, 999)でLOD生成
        const testSectorX = 999;
        const testSectorY = 999;
        
        try {
            // Level 0 (256x256)
            console.log('🔧 Generating Level 0 (256x256)...');
            await this.generateLODLevel(testSectorX, testSectorY, 0, testPixelArray, 256, 256);
            
            // Level 1 (128x128)
            console.log('🔧 Generating Level 1 (128x128)...');
            await this.downsampleAndSave(testSectorX, testSectorY, 1, testPixelArray, 256, 256, 2);
            
            // Level 2 (64x64)
            console.log('🔧 Generating Level 2 (64x64)...');
            await this.downsampleAndSave(testSectorX, testSectorY, 2, testPixelArray, 256, 256, 4);
            
            // Level 3 (32x32)
            console.log('🔧 Generating Level 3 (32x32)...');
            await this.downsampleAndSave(testSectorX, testSectorY, 3, testPixelArray, 256, 256, 8);
            
            console.log('✅ LOD test generation completed successfully!');
            
            // 結果を確認
            await this.verifyLODTest(testSectorX, testSectorY);
            
        } catch (error) {
            console.error('❌ LOD test generation failed:', error);
        }
    }
    
    async verifyLODTest(sectorX, sectorY) {
        console.log('🔍 Verifying LOD test results...');
        
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/sector_lod?sector_x=eq.${sectorX}&sector_y=eq.${sectorY}`, {
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            });
            
            if (response.ok) {
                const lodRecords = await response.json();
                console.log(`📊 Found ${lodRecords.length} LOD records for test sector:`);
                
                lodRecords.forEach(record => {
                    const compressionRatio = record.rle_data ? 
                        ((record.width * record.height - record.rle_data.length) / (record.width * record.height) * 100).toFixed(1) : 
                        'N/A';
                    
                    console.log(`  Level ${record.lod_level}: ${record.width}x${record.height}, ${record.pixel_count} pixels, ~${compressionRatio}% compression`);
                });
                
                return lodRecords;
            } else {
                console.error('❌ Failed to verify LOD records:', response.status);
            }
        } catch (error) {
            console.error('❌ Verification failed:', error);
        }
    }
    
    // パフォーマンス統計を取得
    getStats() {
        return {
            workerInitialized: !!this.rleWorker,
            pendingOperations: this.pendingOperations?.size || 0,
            generationQueue: this.generationQueue.length,
            isGenerating: this.isGenerating
        };
    }
    
    destroy() {
        if (this.rleWorker) {
            this.rleWorker.terminate();
        }
    }
}
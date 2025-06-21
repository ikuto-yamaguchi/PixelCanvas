// ⚡ Ultra Low Latency Binary Protocol (<100ms)
// 1ピクセル = 5バイト (x:2byte + y:2byte + color:1byte)

export class BinaryPixelEncoder {
    constructor() {
        this.updateSize = 5; // bytes per pixel update
        this.maxBatchSize = 100; // 最大100ピクセル/バッチ
    }
    
    // 🚀 エンコード: {x, y, color}[] → Uint8Array
    encode(updates) {
        const buffer = new Uint8Array(updates.length * this.updateSize);
        let offset = 0;
        
        for (const update of updates) {
            // Little Endian で座標書き込み (高速)
            buffer[offset] = update.x & 0xFF;
            buffer[offset + 1] = (update.x >> 8) & 0xFF;
            buffer[offset + 2] = update.y & 0xFF;
            buffer[offset + 3] = (update.y >> 8) & 0xFF;
            buffer[offset + 4] = update.color & 0xFF;
            
            offset += this.updateSize;
        }
        
        return buffer;
    }
    
    // ⚡ デコード: Uint8Array → {x, y, color}[]
    decode(buffer) {
        const view = new Uint8Array(buffer);
        const updates = [];
        
        for (let i = 0; i < view.length; i += this.updateSize) {
            if (i + this.updateSize > view.length) break; // 境界チェック
            
            const x = view[i] | (view[i + 1] << 8);
            const y = view[i + 2] | (view[i + 3] << 8);
            const color = view[i + 4];
            
            updates.push({ x, y, color });
        }
        
        return updates;
    }
    
    // 📊 圧縮統計
    getCompressionStats(originalUpdates) {
        const originalSize = originalUpdates.length * 20; // JSON: ~20 bytes/update
        const compressedSize = originalUpdates.length * this.updateSize; // Binary: 5 bytes/update
        const ratio = compressedSize / originalSize;
        
        return {
            originalSize,
            compressedSize,
            compressionRatio: ratio,
            savings: Math.round((1 - ratio) * 100) + '%'
        };
    }
}

export class UltraLowLatencyUpdater {
    constructor(pixelCanvas) {
        this.pixelCanvas = pixelCanvas;
        this.encoder = new BinaryPixelEncoder();
        
        // 🔥 100ms以下のパフォーマンス最適化
        this.updateBuffer = new Array(100); // 循環バッファ
        this.bufferIndex = 0;
        this.lastProcessTime = 0;
        this.pendingUpdates = new Map(); // 重複除去用
        
        // WebSocket接続
        this.ws = null;
        this.connectionRetries = 0;
        this.maxRetries = 5;
        
        // 統計情報
        this.stats = {
            messagesReceived: 0,
            updatesProcessed: 0,
            averageLatency: 0,
            lastUpdateTime: 0
        };
    }
    
    // 🚀 超高速WebSocket接続
    async connect() {
        try {
            // Supabase Realtimeエンドポイント (バイナリ対応)
            const wsUrl = `wss://lgvjdefkyeuvquzckkvb.supabase.co/realtime/v1/websocket?apikey=${CONFIG.SUPABASE_ANON_KEY}&vsn=1.0.0`;
            
            console.log('⚡ Connecting to ultra-fast WebSocket...');\n            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';
            
            return new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    console.log('✅ Ultra-fast WebSocket connected');
                    this.connectionRetries = 0;
                    this.setupMessageHandlers();
                    resolve();
                };
                
                this.ws.onerror = (error) => {
                    console.error('❌ WebSocket connection failed:', error);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    console.log('🔌 WebSocket disconnected');
                    this.handleDisconnection();
                };
            });
            
        } catch (error) {
            console.error('❌ WebSocket setup failed:', error);
            throw error;
        }
    }
    
    // ⚡ メッセージハンドラー設定
    setupMessageHandlers() {
        this.ws.onmessage = (event) => {
            const receiveTime = performance.now();
            this.stats.messagesReceived++;
            
            try {\n                // バイナリメッセージ処理
                if (event.data instanceof ArrayBuffer) {
                    this.processBinaryUpdate(event.data, receiveTime);
                } else {
                    // JSON fallback (低速)
                    this.processJsonUpdate(JSON.parse(event.data), receiveTime);
                }
                
            } catch (error) {
                console.error('❌ Message processing error:', error);
            }
        };
    }
    
    // 🔥 バイナリ更新処理 (< 5ms)
    processBinaryUpdate(buffer, receiveTime) {
        const decodeStartTime = performance.now();
        
        // 高速バイナリデコード
        const updates = this.encoder.decode(buffer);
        
        const decodeTime = performance.now() - decodeStartTime;
        
        // 循環バッファに追加
        for (const update of updates) {
            this.updateBuffer[this.bufferIndex] = {
                ...update,
                timestamp: receiveTime
            };
            this.bufferIndex = (this.bufferIndex + 1) % 100;
        }
        
        // スロットリング: 16ms間隔で処理 (60fps)
        const now = performance.now();
        if (now - this.lastProcessTime > 16) {
            requestAnimationFrame(() => this.processBufferedUpdates());
            this.lastProcessTime = now;
        }
        
        console.log(`⚡ Binary update: ${updates.length} pixels, decode: ${decodeTime.toFixed(1)}ms`);
    }
    
    // 🎯 バッファされた更新の超高速処理
    processBufferedUpdates() {
        const processStartTime = performance.now();
        
        // バッファから更新を取得
        const updates = this.drainBuffer();
        
        if (updates.length === 0) return;
        
        // 同一位置の重複除去 (ビット演算で高速)
        const deduped = new Map();
        for (const update of updates) {
            const key = (update.x << 16) | update.y; // 32bit key (x:16bit + y:16bit)
            if (!deduped.has(key) || deduped.get(key).timestamp < update.timestamp) {
                deduped.set(key, update);
            }
        }
        
        // PixelStorageに直接適用
        let appliedCount = 0;
        for (const update of deduped.values()) {
            this.pixelCanvas.pixelStorage.setPixel(0, 0, update.x, update.y, update.color);
            appliedCount++;
        }
        
        // 変更領域のみ再描画 (差分レンダリング)
        this.renderDirtyRegions(deduped.values());
        
        const processTime = performance.now() - processStartTime;
        this.stats.updatesProcessed += appliedCount;
        this.stats.averageLatency = (this.stats.averageLatency + processTime) / 2;
        
        console.log(`🎯 Processed ${appliedCount} updates in ${processTime.toFixed(1)}ms (avg: ${this.stats.averageLatency.toFixed(1)}ms)`);
    }
    
    // 🔄 バッファドレイン
    drainBuffer() {
        const updates = [];
        const currentIndex = this.bufferIndex;
        
        // 循環バッファから有効な更新を抽出
        for (let i = 0; i < 100; i++) {
            const update = this.updateBuffer[i];
            if (update && update.timestamp) {
                updates.push(update);
                this.updateBuffer[i] = null; // クリア
            }
        }
        
        return updates.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // 🎨 差分レンダリング (変更領域のみ)
    renderDirtyRegions(updates) {
        if (updates.length === 0) return;
        
        // 変更領域を計算
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const update of updates) {
            minX = Math.min(minX, update.x);
            minY = Math.min(minY, update.y);
            maxX = Math.max(maxX, update.x);
            maxY = Math.max(maxY, update.y);
        }
        
        // マージン追加
        const margin = 5;
        const dirtyRegion = {
            x: Math.max(0, minX - margin),
            y: Math.max(0, minY - margin),
            width: Math.min(256, maxX - minX + margin * 2),
            height: Math.min(256, maxY - minY + margin * 2)
        };
        
        // 部分レンダリング実行
        this.pixelCanvas.renderRegion(dirtyRegion);
    }
    
    // 📡 ピクセル送信 (バイナリ)
    sendPixelUpdate(x, y, color) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ WebSocket not ready for sending');
            return;
        }
        
        const update = { x, y, color };
        const binaryData = this.encoder.encode([update]);
        
        this.ws.send(binaryData);
        
        const stats = this.encoder.getCompressionStats([update]);
        console.log(`📡 Sent pixel (${x},${y}) → ${binaryData.length} bytes (${stats.savings} savings)`);
    }
    
    // 🔌 再接続処理
    async handleDisconnection() {
        if (this.connectionRetries < this.maxRetries) {
            this.connectionRetries++;
            const delay = Math.min(1000 * Math.pow(2, this.connectionRetries), 10000);
            
            console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.connectionRetries}/${this.maxRetries})`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error('❌ Reconnection failed:', error);
                });
            }, delay);
        } else {
            console.error('❌ Max reconnection attempts reached');
        }
    }
    
    // JSON フォールバック (互換性)
    processJsonUpdate(data, receiveTime) {
        console.log('📄 Processing JSON update (slower fallback)');
        
        if (data.type === 'pixel_update') {
            const update = {
                x: data.x,
                y: data.y,
                color: data.color,
                timestamp: receiveTime
            };
            
            this.updateBuffer[this.bufferIndex] = update;
            this.bufferIndex = (this.bufferIndex + 1) % 100;
        }
    }
    
    // 📊 統計情報取得
    getStats() {
        return {\n            ...this.stats,
            bufferUsage: this.updateBuffer.filter(u => u).length,
            connectionState: this.ws?.readyState || 'disconnected',
            latencyTarget: '< 100ms',
            isOptimal: this.stats.averageLatency < 100
        };
    }
    
    // 🧹 クリーンアップ
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // バッファクリア
        this.updateBuffer.fill(null);
        this.bufferIndex = 0;
        
        console.log('🧹 Ultra-fast updater disconnected and cleaned up');
    }
}
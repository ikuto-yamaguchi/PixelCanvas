// Ultra Low Latency Binary Protocol (<100ms)
// 1 pixel = 5 bytes (x:2byte + y:2byte + color:1byte)

export class BinaryPixelEncoder {
    constructor() {
        this.updateSize = 5; // bytes per pixel update
        this.maxBatchSize = 100; // Maximum 100 pixels/batch
    }
    
    // Encode: {x, y, color}[] -> Uint8Array
    encode(updates) {
        const buffer = new Uint8Array(updates.length * this.updateSize);
        let offset = 0;
        
        for (const update of updates) {
            // Little Endian coordinate writing (fast)
            buffer[offset] = update.x & 0xFF;
            buffer[offset + 1] = (update.x >> 8) & 0xFF;
            buffer[offset + 2] = update.y & 0xFF;
            buffer[offset + 3] = (update.y >> 8) & 0xFF;
            buffer[offset + 4] = update.color;
            
            offset += this.updateSize;
        }
        
        return buffer;
    }
    
    // Decode: Uint8Array -> {x, y, color}[]
    decode(buffer) {
        const updates = [];
        const updateCount = buffer.length / this.updateSize;
        
        for (let i = 0; i < updateCount; i++) {
            const offset = i * this.updateSize;
            
            const x = buffer[offset] | (buffer[offset + 1] << 8);
            const y = buffer[offset + 2] | (buffer[offset + 3] << 8);
            const color = buffer[offset + 4];
            
            updates.push({ x, y, color });
        }
        
        return updates;
    }
    
    // Calculate bandwidth savings
    getBandwidthSavings(pixelCount) {
        const jsonSize = pixelCount * 20; // JSON: ~20 bytes per pixel
        const binarySize = pixelCount * this.updateSize; // Binary: 5 bytes per pixel
        const savings = ((jsonSize - binarySize) / jsonSize) * 100;
        
        return {
            jsonSize,
            binarySize,
            savings: Math.round(savings)
        };
    }
}

export class BinaryPixelProtocol {
    constructor() {
        this.encoder = new BinaryPixelEncoder();
        this.ws = null;
        this.connectionRetries = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        // Circular buffer for non-blocking updates
        this.updateBuffer = [];
        this.bufferSize = 1000;
        this.isProcessing = false;
        
        // Performance metrics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            totalLatency: 0,
            averageLatency: 0,
            bandwidthSaved: 0
        };
        
        // Update frequency throttling
        this.lastSendTime = 0;
        this.sendThrottle = 16; // 60fps = ~16ms
    }
    
    // Ultra-fast WebSocket connection
    async connect() {
        try {
            // 🚨 DISABLED: WebSocket temporarily disabled due to connection issues
            console.log('⚠️ WebSocket disabled - using HTTP polling fallback');
            return Promise.resolve();
            
            // Old WebSocket code disabled:
            // const wsUrl = `wss://lgvjdefkyeuvquzckkvb.supabase.co/realtime/v1/websocket?apikey=${CONFIG.SUPABASE_ANON_KEY}&vsn=1.0.0`;
            // this.ws = new WebSocket(wsUrl);
            // this.ws.binaryType = 'arraybuffer';
            
            // Disabled WebSocket connection logic
            /*
            return new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    console.log('Ultra-fast WebSocket connected');
                    this.connectionRetries = 0;
                    this.setupMessageHandlers();
                    resolve();
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket connection error:', error);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    console.log('WebSocket connection closed');
                    this.attemptReconnect();
                };
                
                // Connection timeout
                setTimeout(() => {
                    if (this.ws.readyState !== WebSocket.OPEN) {
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 5000);
            });
            */
            
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            throw error;
        }
    }
    
    // Setup message handlers
    setupMessageHandlers() {
        this.ws.onmessage = (event) => {
            const startTime = performance.now();
            
            try {
                let updates;
                
                if (event.data instanceof ArrayBuffer) {
                    // Binary message - ultra fast decode
                    const buffer = new Uint8Array(event.data);
                    updates = this.encoder.decode(buffer);
                    console.log(`Binary update received: ${updates.length} pixels`);
                } else {
                    // JSON message - fallback
                    const data = JSON.parse(event.data);
                    updates = data.updates || [];
                    console.log(`JSON update received: ${updates.length} pixels`);
                }
                
                // Process updates immediately
                this.processIncomingUpdates(updates);
                
                // Update latency stats
                const latency = performance.now() - startTime;
                this.updateLatencyStats(latency);
                
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };
    }
    
    // Process incoming pixel updates
    processIncomingUpdates(updates) {
        for (const update of updates) {
            // Emit to renderer
            this.onPixelUpdate?.(update);
        }
        
        this.stats.messagesReceived++;
    }
    
    // Send pixel updates (throttled)
    sendPixelUpdates(updates) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket not connected, buffering updates');
            this.bufferUpdates(updates);
            return;
        }
        
        const now = performance.now();
        
        // Throttle sending to maintain 60fps
        if (now - this.lastSendTime < this.sendThrottle) {
            this.bufferUpdates(updates);
            return;
        }
        
        try {
            // Binary encoding for ultra-low latency
            const binaryData = this.encoder.encode(updates);
            this.ws.send(binaryData);
            
            this.lastSendTime = now;
            this.stats.messagesSent++;
            
            // Calculate bandwidth savings
            const savings = this.encoder.getBandwidthSavings(updates.length);
            this.stats.bandwidthSaved += savings.savings;
            
            console.log(`Sent ${updates.length} pixels (${binaryData.length} bytes, ${savings.savings}% saved)`);
            
        } catch (error) {
            console.error('Failed to send updates:', error);
            this.bufferUpdates(updates);
        }
    }
    
    // Buffer updates for throttling
    bufferUpdates(updates) {
        for (const update of updates) {
            if (this.updateBuffer.length >= this.bufferSize) {
                // Remove oldest update to make room
                this.updateBuffer.shift();
            }
            this.updateBuffer.push(update);
        }
        
        // Process buffer if not already processing
        if (!this.isProcessing) {
            this.processBuffer();
        }
    }
    
    // Process buffered updates
    async processBuffer() {
        if (this.isProcessing || this.updateBuffer.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        while (this.updateBuffer.length > 0) {
            const batchSize = Math.min(this.encoder.maxBatchSize, this.updateBuffer.length);
            const batch = this.updateBuffer.splice(0, batchSize);
            
            this.sendPixelUpdates(batch);
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, this.sendThrottle));
        }
        
        this.isProcessing = false;
    }
    
    // Attempt reconnection
    async attemptReconnect() {
        if (this.connectionRetries >= this.maxRetries) {
            console.error('Max reconnection attempts reached');
            return;
        }
        
        this.connectionRetries++;
        console.log(`Attempting reconnection (${this.connectionRetries}/${this.maxRetries})...`);
        
        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                console.error('Reconnection failed:', error);
            }
        }, this.retryDelay * this.connectionRetries);
    }
    
    // Update latency statistics
    updateLatencyStats(latency) {
        this.stats.totalLatency += latency;
        this.stats.averageLatency = this.stats.totalLatency / this.stats.messagesReceived;
        
        // Log every 10 messages
        if (this.stats.messagesReceived % 10 === 0) {
            console.log(`Average latency: ${this.stats.averageLatency.toFixed(1)}ms`);
        }
    }
    
    // Get performance statistics
    getStats() {
        return {
            ...this.stats,
            isConnected: this.ws?.readyState === WebSocket.OPEN,
            bufferedUpdates: this.updateBuffer.length,
            connectionRetries: this.connectionRetries
        };
    }
    
    // Set pixel update callback
    onPixelUpdate(callback) {
        this.onPixelUpdate = callback;
    }
    
    // Disconnect
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Clear buffer
        this.updateBuffer = [];
        this.isProcessing = false;
        
        console.log('Binary protocol disconnected');
    }
}
// リアルタイム通信サービス
import { CONFIG } from '../../Config.js';

/**
 * リアルタイム通信管理クラス
 * Supabaseのリアルタイム機能を統合管理
 */
export class RealtimeService {
    constructor() {
        this.supabaseClient = null;
        this.channel = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // イベントリスナー
        this.pixelListeners = new Set();
        this.connectionListeners = new Set();
        this.errorListeners = new Set();
        
        // 接続統計
        this.connectionStats = {
            connected: false,
            lastConnected: null,
            lastDisconnected: null,
            reconnectCount: 0,
            totalMessages: 0,
            pixelUpdates: 0
        };
        
        // メッセージバッファ（一時的な切断時用）
        this.messageBuffer = [];
        this.maxBufferSize = 100;
        
        this.initialize();
    }
    
    /**
     * 初期化
     */
    async initialize() {
        try {
            await this.waitForSupabase();
            await this.connect();
            console.log('📡 RealtimeService initialized');
        } catch (error) {
            console.error('📡 RealtimeService initialization failed:', error);
        }
    }
    
    /**
     * Supabase利用可能まで待機
     */
    async waitForSupabase(maxWaitTime = 10000) {
        const startTime = Date.now();
        
        while (!window.supabase && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (!window.supabase) {
            throw new Error('Supabase not available');
        }
        
        this.supabaseClient = window.supabase.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_ANON_KEY
        );
    }
    
    /**
     * リアルタイム接続開始
     */
    async connect() {
        if (this.isConnected || !this.supabaseClient) {
            return;
        }
        
        try {
            console.log('📡 Connecting to realtime...');
            
            this.channel = this.supabaseClient
                .channel('pixels_channel')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'pixels'
                }, (payload) => {
                    this.handlePixelUpdate(payload.new);
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pixels'
                }, (payload) => {
                    this.handlePixelUpdate(payload.new);
                })
                .subscribe((status) => {
                    this.handleConnectionStatus(status);
                });
            
        } catch (error) {
            console.error('📡 Realtime connection failed:', error);
            this.scheduleReconnect();
        }
    }
    
    /**
     * 接続状態処理
     */
    handleConnectionStatus(status) {
        console.log('📡 Realtime status:', status);
        
        const wasConnected = this.isConnected;
        this.isConnected = status === 'SUBSCRIBED';
        
        if (this.isConnected && !wasConnected) {
            // 接続成功
            this.connectionStats.connected = true;
            this.connectionStats.lastConnected = Date.now();
            this.reconnectAttempts = 0;
            
            console.log('📡 Realtime connected');
            this.notifyConnectionListeners({ status: 'connected' });
            
            // バッファされたメッセージを処理
            this.processBufferedMessages();
            
        } else if (!this.isConnected && wasConnected) {
            // 接続切断
            this.connectionStats.connected = false;
            this.connectionStats.lastDisconnected = Date.now();
            
            console.log('📡 Realtime disconnected');
            this.notifyConnectionListeners({ status: 'disconnected' });
            
            // 再接続をスケジュール
            this.scheduleReconnect();
        }
    }
    
    /**
     * ピクセル更新処理
     */
    handlePixelUpdate(pixelData) {
        try {
            this.connectionStats.totalMessages++;
            this.connectionStats.pixelUpdates++;
            
            // リスナーに通知
            this.notifyPixelListeners(pixelData);
            
            console.log('📡 Pixel update received:', pixelData);
            
        } catch (error) {
            console.error('📡 Error handling pixel update:', error);
            this.notifyErrorListeners(error);
        }
    }
    
    /**
     * 再接続スケジュール
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('📡 Max reconnection attempts reached');
            this.notifyErrorListeners(new Error('Max reconnection attempts reached'));
            return;
        }
        
        this.reconnectAttempts++;
        this.connectionStats.reconnectCount++;
        
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 指数バックオフ
        
        console.log(`📡 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            this.disconnect();
            this.connect();
        }, delay);
    }
    
    /**
     * 接続切断
     */
    disconnect() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        
        this.isConnected = false;
        console.log('📡 Realtime disconnected');
    }
    
    /**
     * ピクセルリスナー追加
     */
    addPixelListener(listener) {
        this.pixelListeners.add(listener);
    }
    
    /**
     * ピクセルリスナー削除
     */
    removePixelListener(listener) {
        this.pixelListeners.delete(listener);
    }
    
    /**
     * 接続リスナー追加
     */
    addConnectionListener(listener) {
        this.connectionListeners.add(listener);
    }
    
    /**
     * 接続リスナー削除
     */
    removeConnectionListener(listener) {
        this.connectionListeners.delete(listener);
    }
    
    /**
     * エラーリスナー追加
     */
    addErrorListener(listener) {
        this.errorListeners.add(listener);
    }
    
    /**
     * エラーリスナー削除
     */
    removeErrorListener(listener) {
        this.errorListeners.delete(listener);
    }
    
    /**
     * ピクセルリスナー通知
     */
    notifyPixelListeners(pixelData) {
        this.pixelListeners.forEach(listener => {
            try {
                listener(pixelData);
            } catch (error) {
                console.error('📡 Pixel listener error:', error);
            }
        });
    }
    
    /**
     * 接続リスナー通知
     */
    notifyConnectionListeners(connectionData) {
        this.connectionListeners.forEach(listener => {
            try {
                listener(connectionData);
            } catch (error) {
                console.error('📡 Connection listener error:', error);
            }
        });
    }
    
    /**
     * エラーリスナー通知
     */
    notifyErrorListeners(error) {
        this.errorListeners.forEach(listener => {
            try {
                listener(error);
            } catch (error) {
                console.error('📡 Error listener error:', error);
            }
        });
    }
    
    /**
     * メッセージバッファリング（切断時用）
     */
    bufferMessage(message) {
        this.messageBuffer.push({
            message,
            timestamp: Date.now()
        });
        
        // バッファサイズ制限
        while (this.messageBuffer.length > this.maxBufferSize) {
            this.messageBuffer.shift();
        }
    }
    
    /**
     * バッファされたメッセージ処理
     */
    processBufferedMessages() {
        if (this.messageBuffer.length === 0) return;
        
        console.log(`📡 Processing ${this.messageBuffer.length} buffered messages`);
        
        for (const bufferedItem of this.messageBuffer) {
            try {
                this.handlePixelUpdate(bufferedItem.message);
            } catch (error) {
                console.error('📡 Error processing buffered message:', error);
            }
        }
        
        this.messageBuffer = [];
    }
    
    /**
     * 手動再接続
     */
    async reconnect() {
        console.log('📡 Manual reconnection triggered');
        this.reconnectAttempts = 0; // リセット
        this.disconnect();
        await this.connect();
    }
    
    /**
     * 接続テスト
     */
    async testConnection() {
        try {
            if (!this.supabaseClient) {
                return { success: false, error: 'Supabase client not available' };
            }
            
            // 簡単な接続テスト
            const startTime = Date.now();
            const response = await this.supabaseClient
                .from('pixels')
                .select('count')
                .limit(1);
            
            const responseTime = Date.now() - startTime;
            
            return {
                success: !response.error,
                responseTime,
                isConnected: this.isConnected,
                error: response.error?.message || null
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                isConnected: this.isConnected
            };
        }
    }
    
    /**
     * カスタムイベント送信
     */
    async sendCustomEvent(eventName, payload) {
        if (!this.channel || !this.isConnected) {
            console.warn('📡 Cannot send event: not connected');
            return false;
        }
        
        try {
            await this.channel.send({
                type: 'broadcast',
                event: eventName,
                payload: payload
            });
            
            return true;
            
        } catch (error) {
            console.error('📡 Failed to send custom event:', error);
            return false;
        }
    }
    
    /**
     * カスタムイベントリスナー追加
     */
    addCustomEventListener(eventName, listener) {
        if (!this.channel) {
            console.warn('📡 Cannot add event listener: channel not available');
            return;
        }
        
        this.channel.on('broadcast', { event: eventName }, listener);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            ...this.connectionStats,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            bufferedMessages: this.messageBuffer.length,
            listenerCounts: {
                pixel: this.pixelListeners.size,
                connection: this.connectionListeners.size,
                error: this.errorListeners.size
            }
        };
    }
    
    /**
     * デバッグ情報
     */
    debugInfo() {
        const stats = this.getStats();
        console.log('📡 Realtime Debug Info:', {
            connected: stats.connected,
            reconnectCount: stats.reconnectCount,
            totalMessages: stats.totalMessages,
            pixelUpdates: stats.pixelUpdates,
            bufferedMessages: stats.bufferedMessages,
            listeners: stats.listenerCounts
        });
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        if (newConfig.maxReconnectAttempts !== undefined) {
            this.maxReconnectAttempts = newConfig.maxReconnectAttempts;
        }
        if (newConfig.reconnectDelay !== undefined) {
            this.reconnectDelay = newConfig.reconnectDelay;
        }
        if (newConfig.maxBufferSize !== undefined) {
            this.maxBufferSize = newConfig.maxBufferSize;
            
            // バッファサイズ調整
            while (this.messageBuffer.length > this.maxBufferSize) {
                this.messageBuffer.shift();
            }
        }
        
        console.log('📡 RealtimeService config updated');
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.disconnect();
        
        this.pixelListeners.clear();
        this.connectionListeners.clear();
        this.errorListeners.clear();
        this.messageBuffer = [];
        
        this.supabaseClient = null;
        
        console.log('📡 RealtimeService destroyed');
    }
}
// リモートログ送信管理
import { LogCategory } from './LoggerCore.js';

/**
 * リモートログ送信管理クラス
 */
export class LoggerRemote {
    constructor() {
        this.enableRemote = false;
        this.remoteEndpoint = null;
        this.remoteBatchSize = 50;
        this.remoteBuffer = [];
        this.remoteFlushInterval = 30000; // 30秒
        this.remoteFlushTimer = null;
        this.sessionId = null;
    }
    
    /**
     * セッションID設定
     */
    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
    
    /**
     * リモートエンドポイント設定
     */
    setRemoteEndpoint(endpoint) {
        this.remoteEndpoint = endpoint;
        this.enableRemote = !!endpoint;
        
        if (this.enableRemote && !this.remoteFlushTimer) {
            this.startRemoteFlushTimer();
        } else if (!this.enableRemote && this.remoteFlushTimer) {
            clearInterval(this.remoteFlushTimer);
            this.remoteFlushTimer = null;
        }
        
        console.log(`📝 Remote logging ${this.enableRemote ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * リモートバッファに追加
     */
    addToRemoteBuffer(entry) {
        if (!this.enableRemote) return;
        
        this.remoteBuffer.push(entry);
        
        if (this.remoteBuffer.length >= this.remoteBatchSize) {
            this.flushRemoteBuffer();
        }
    }
    
    /**
     * リモートバッファフラッシュ
     */
    async flushRemoteBuffer() {
        if (!this.remoteEndpoint || this.remoteBuffer.length === 0) {
            return;
        }
        
        const logs = [...this.remoteBuffer];
        this.remoteBuffer = [];
        
        try {
            await fetch(this.remoteEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    logs,
                    session: this.sessionId,
                    timestamp: Date.now()
                })
            });
        } catch (error) {
            // リモート送信失敗時はローカルバッファに戻す
            this.remoteBuffer.unshift(...logs.slice(0, 10)); // 最大10件まで
        }
    }
    
    /**
     * リモートフラッシュタイマー開始
     */
    startRemoteFlushTimer() {
        this.remoteFlushTimer = setInterval(() => {
            this.flushRemoteBuffer();
        }, this.remoteFlushInterval);
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            enableRemote: this.enableRemote,
            bufferSize: this.remoteBuffer.length,
            endpoint: this.remoteEndpoint
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        // リモートバッファフラッシュ
        if (this.remoteBuffer.length > 0) {
            this.flushRemoteBuffer();
        }
        
        // タイマー停止
        if (this.remoteFlushTimer) {
            clearInterval(this.remoteFlushTimer);
        }
        
        // バッファクリア
        this.remoteBuffer = [];
        
        console.log('📝 LoggerRemote destroyed');
    }
}
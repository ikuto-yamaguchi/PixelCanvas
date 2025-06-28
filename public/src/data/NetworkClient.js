// ネットワーク通信クライアント
import { CONFIG } from '../../Config.js';

/**
 * Supabase通信専用クライアント
 * HTTP通信のみに特化、シンプルで信頼性重視
 */
export class NetworkClient {
    constructor() {
        this.baseUrl = CONFIG.SUPABASE_URL;
        this.apiKey = CONFIG.SUPABASE_ANON_KEY;
        this.headers = {
            'apikey': this.apiKey,
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        // レート制限
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.rateLimitDelay = 50; // 50ms間隔
        
        // リトライ設定
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        console.log('🌐 NetworkClient initialized');
    }
    
    /**
     * 基本fetch処理（リトライ付き）
     */
    async fetch(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        const requestOptions = {
            headers: { ...this.headers, ...options.headers },
            mode: 'cors',
            credentials: 'omit',
            ...options
        };
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(fullUrl, requestOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
                
            } catch (error) {
                if (attempt === this.maxRetries) {
                    throw new Error(`Request failed after ${this.maxRetries + 1} attempts: ${error.message}`);
                }
                
                console.warn(`🌐 Request attempt ${attempt + 1} failed, retrying...`, error.message);
                await this.delay(this.retryDelay * (attempt + 1));
            }
        }
    }
    
    /**
     * GET リクエスト
     */
    async get(url, params = {}) {
        const urlObj = new URL(url.startsWith('http') ? url : `${this.baseUrl}${url}`);
        
        // パラメータ追加
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlObj.searchParams.append(key, value.toString());
            }
        });
        
        const response = await this.fetch(urlObj.toString());
        return response.json();
    }
    
    /**
     * POST リクエスト
     */
    async post(url, data = {}) {
        const response = await this.fetch(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return response.json();
    }
    
    /**
     * ピクセル総数取得
     */
    async getPixelCount() {
        try {
            const data = await this.get('/rest/v1/pixels', {
                select: 'count',
                limit: 1
            });
            
            return data[0]?.count || 0;
        } catch (error) {
            console.error('🌐 Failed to get pixel count:', error);
            return 0;
        }
    }
    
    /**
     * ピクセルバッチ取得
     */
    async getPixelsBatch(offset = 0, limit = 1000) {
        try {
            console.log(`🌐 Requesting pixels batch: offset=${offset}, limit=${limit}`);
            const result = await this.get('/rest/v1/pixels', {
                select: 'sector_x,sector_y,local_x,local_y,color',
                limit: limit,
                offset: offset,
                order: 'created_at'
            });
            console.log(`🌐 Received ${result?.length || 0} pixels in batch`);
            return result;
        } catch (error) {
            console.error('🌐 Failed to get pixels batch:', error);
            return [];
        }
    }
    
    /**
     * 全ピクセル取得（制限付き）
     */
    async getAllPixels(maxPixels = 50000) {
        try {
            return await this.get('/rest/v1/pixels', {
                select: 'sector_x,sector_y,local_x,local_y,color',
                limit: maxPixels,
                order: 'created_at'
            });
        } catch (error) {
            console.error('🌐 Failed to get all pixels:', error);
            return [];
        }
    }
    
    /**
     * セクター内ピクセル取得
     */
    async getSectorPixels(sectorX, sectorY) {
        try {
            return await this.get('/rest/v1/pixels', {
                select: 'local_x,local_y,color',
                and: `(sector_x.eq.${sectorX},sector_y.eq.${sectorY})`
            });
        } catch (error) {
            console.error('🌐 Failed to get sector pixels:', error);
            return [];
        }
    }
    
    /**
     * エリア内ピクセル取得
     */
    async getAreaPixels(minSectorX, minSectorY, maxSectorX, maxSectorY) {
        try {
            return await this.get('/rest/v1/pixels', {
                select: 'sector_x,sector_y,local_x,local_y,color',
                and: `(sector_x.gte.${minSectorX},sector_x.lte.${maxSectorX},sector_y.gte.${minSectorY},sector_y.lte.${maxSectorY})`
            });
        } catch (error) {
            console.error('🌐 Failed to get area pixels:', error);
            return [];
        }
    }
    
    /**
     * 単一ピクセル保存
     */
    async savePixel(sectorX, sectorY, localX, localY, color) {
        try {
            await this.post('/rest/v1/pixels', {
                sector_x: sectorX,
                sector_y: sectorY,
                local_x: localX,
                local_y: localY,
                color: color
            });
            return true;
        } catch (error) {
            console.error('🌐 Failed to save pixel:', error);
            return false;
        }
    }
    
    /**
     * ピクセルバッチ保存
     */
    async savePixelsBatch(pixelsData) {
        try {
            // バッチサイズ制限（Supabaseの制限に合わせる）
            const batchSize = 1000;
            const results = [];
            
            for (let i = 0; i < pixelsData.length; i += batchSize) {
                const batch = pixelsData.slice(i, i + batchSize);
                
                await this.post('/rest/v1/pixels', batch);
                results.push(batch.length);
                
                // レート制限対応
                if (i + batchSize < pixelsData.length) {
                    await this.delay(this.rateLimitDelay);
                }
            }
            
            console.log(`🌐 Saved ${pixelsData.length} pixels in ${results.length} batches`);
            return true;
            
        } catch (error) {
            console.error('🌐 Failed to save pixels batch:', error);
            return false;
        }
    }
    
    /**
     * セクター統計取得
     */
    async getSectorStats() {
        try {
            return await this.get('/rest/v1/sectors', {
                select: 'sector_x,sector_y,pixel_count,is_active',
                order: 'pixel_count.desc'
            });
        } catch (error) {
            console.error('🌐 Failed to get sector stats:', error);
            return [];
        }
    }
    
    /**
     * セクター統計更新
     */
    async updateSectorStats(sectorX, sectorY, pixelCount) {
        try {
            await this.post('/rest/v1/sectors', {
                sector_x: sectorX,
                sector_y: sectorY,
                pixel_count: pixelCount,
                is_active: pixelCount > 0,
                updated_at: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('🌐 Failed to update sector stats:', error);
            return false;
        }
    }
    
    /**
     * ユーザーアクションログ
     */
    async logUserAction(actionType, deviceId, ipAddress = null) {
        try {
            await this.post('/rest/v1/user_actions', {
                device_id: deviceId,
                ip_address: ipAddress,
                action_type: actionType,
                created_at: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('🌐 Failed to log user action:', error);
            return false;
        }
    }
    
    /**
     * レート制限チェック
     */
    async checkRateLimit(deviceId, ipAddress, timeWindowMs = 60000, maxActions = 10) {
        try {
            const since = new Date(Date.now() - timeWindowMs).toISOString();
            
            const data = await this.get('/rest/v1/user_actions', {
                select: 'count',
                and: ipAddress 
                    ? `(ip_address.eq.${ipAddress},created_at.gte.${since})`
                    : `(device_id.eq.${deviceId},created_at.gte.${since})`,
                limit: 1
            });
            
            const actionCount = data[0]?.count || 0;
            return {
                allowed: actionCount < maxActions,
                remaining: Math.max(0, maxActions - actionCount),
                resetTime: Date.now() + timeWindowMs
            };
            
        } catch (error) {
            console.error('🌐 Failed to check rate limit:', error);
            // エラー時は制限なしとして扱う
            return { allowed: true, remaining: maxActions, resetTime: Date.now() + timeWindowMs };
        }
    }
    
    /**
     * 接続テスト
     */
    async testConnection() {
        try {
            const startTime = performance.now();
            await this.get('/rest/v1/pixels', { select: 'count', limit: 1 });
            const endTime = performance.now();
            
            return {
                success: true,
                responseTime: Math.round(endTime - startTime),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * 遅延ヘルパー
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 設定更新
     */
    updateConfig(newConfig) {
        if (newConfig.baseUrl) {
            this.baseUrl = newConfig.baseUrl;
        }
        if (newConfig.apiKey) {
            this.apiKey = newConfig.apiKey;
            this.headers['apikey'] = newConfig.apiKey;
            this.headers['Authorization'] = `Bearer ${newConfig.apiKey}`;
        }
        if (newConfig.rateLimitDelay !== undefined) {
            this.rateLimitDelay = newConfig.rateLimitDelay;
        }
        if (newConfig.maxRetries !== undefined) {
            this.maxRetries = newConfig.maxRetries;
        }
        
        console.log('🌐 NetworkClient config updated');
    }
    
    /**
     * 統計情報取得
     */
    getStats() {
        return {
            baseUrl: this.baseUrl,
            rateLimitDelay: this.rateLimitDelay,
            maxRetries: this.maxRetries,
            queueSize: this.requestQueue.length,
            isProcessingQueue: this.isProcessingQueue
        };
    }
    
    /**
     * 解放処理
     */
    destroy() {
        this.requestQueue = [];
        console.log('🌐 NetworkClient destroyed');
    }
}
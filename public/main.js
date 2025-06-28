// PixelCanvas Main Application - 新アーキテクチャ版
import { CONFIG } from './Config.js';
import { PixelCanvasCore } from './src/core/PixelCanvasCore.js';

/**
 * メインアプリケーション初期化クラス
 * 新しいモジュラーアーキテクチャを使用
 */
class PixelCanvasApp {
    constructor() {
        this.pixelCanvasCore = null;
        this.isInitialized = false;
        this.initializationError = null;
        
        console.log('🎯 PixelCanvas App starting with new architecture...');
    }
    
    /**
     * アプリケーション初期化
     */
    async initialize() {
        try {
            console.log('🚀 Starting PixelCanvas with new modular architecture...');
            
            // 必要なDOM要素の確認
            if (!this.validateDOMElements()) {
                throw new Error('Required DOM elements not found');
            }
            
            // コアアプリケーション初期化
            this.pixelCanvasCore = new PixelCanvasCore();
            await this.pixelCanvasCore.initialize();
            
            // グローバルアクセス用
            window.pixelCanvas = this.pixelCanvasCore;
            window.pixelCanvasApp = this;
            
            // デバッグモードの場合は追加情報を表示
            if (CONFIG.DEBUG_MODE) {
                this.setupDebugMode();
            }
            
            this.isInitialized = true;
            console.log('✅ PixelCanvas initialization completed successfully');
            
            // 初期化成功の通知
            this.showInitializationSuccess();
            
        } catch (error) {
            this.initializationError = error;
            console.error('❌ PixelCanvas initialization failed:', error);
            this.showInitializationError(error);
            throw error;
        }
    }
    
    /**
     * DOM要素の存在確認
     */
    validateDOMElements() {
        const requiredElements = [
            'mainCanvas',
            'canvasContainer'
        ];
        
        const missingElements = [];
        
        for (const elementId of requiredElements) {
            const element = document.getElementById(elementId);
            if (!element) {
                missingElements.push(elementId);
            }
        }
        
        if (missingElements.length > 0) {
            console.error('❌ Missing required DOM elements:', missingElements);
            return false;
        }
        
        return true;
    }
    
    /**
     * デバッグモード設定
     */
    setupDebugMode() {
        console.log('🔧 Debug mode enabled');
        
        // グローバルデバッグ関数を追加
        window.debugPixelCanvas = () => {
            if (this.pixelCanvasCore) {
                this.pixelCanvasCore.debugInfo();
            }
        };
        
        window.getPixelCanvasStats = () => {
            if (this.pixelCanvasCore) {
                return this.pixelCanvasCore.getStats();
            }
            return null;
        };
        
        // デバッグ用のキーボードショートカット
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.shiftKey) {
                switch (event.key) {
                    case 'D':
                        event.preventDefault();
                        this.pixelCanvasCore.debugInfo();
                        break;
                    case 'S':
                        event.preventDefault();
                        console.log('📊 Stats:', this.pixelCanvasCore.getStats());
                        break;
                    case 'R':
                        event.preventDefault();
                        this.pixelCanvasCore.render();
                        console.log('🎨 Manual render triggered');
                        break;
                }
            }
        });
        
        console.log('🔧 Debug shortcuts enabled:');
        console.log('  - Ctrl+Shift+D: Debug info');
        console.log('  - Ctrl+Shift+S: Show stats');
        console.log('  - Ctrl+Shift+R: Manual render');
    }
    
    /**
     * 初期化成功の通知
     */
    showInitializationSuccess() {
        // 簡易的な成功通知
        console.log('🎉 PixelCanvas is ready!');
        
        // 統計情報を表示
        if (this.pixelCanvasCore) {
            const stats = this.pixelCanvasCore.getStats();
            console.log('📊 Application statistics:', {
                initialized: stats.initialized,
                pixelCount: stats.data?.totalPixels || 0,
                renderMode: stats.rendering?.mode || 'unknown'
            });
        }
    }
    
    /**
     * 初期化エラーの表示
     */
    showInitializationError(error) {
        // エラー表示用のオーバーレイ作成
        const errorOverlay = document.createElement('div');
        errorOverlay.id = 'initializationError';
        errorOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            font-family: 'Courier New', monospace;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        errorOverlay.innerHTML = `
            <div style="max-width: 600px;">
                <h1 style="color: #ff4444; margin-bottom: 20px;">
                    ❌ PixelCanvas Initialization Failed
                </h1>
                <div style="background: rgba(255, 68, 68, 0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; font-size: 16px;">
                        <strong>Error:</strong> ${error.message}
                    </p>
                </div>
                <div style="font-size: 14px; color: #ccc; line-height: 1.6;">
                    <p>Possible causes:</p>
                    <ul style="text-align: left; display: inline-block;">
                        <li>Missing DOM elements</li>
                        <li>Network connectivity issues</li>
                        <li>JavaScript module loading failure</li>
                        <li>Browser compatibility issues</li>
                    </ul>
                    <p style="margin-top: 20px;">
                        Check the browser console for detailed error information.
                    </p>
                </div>
                <button onclick="window.location.reload()" 
                        style="margin-top: 20px; padding: 10px 20px; background: #4488ff; 
                               color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🔄 Reload Page
                </button>
            </div>
        `;
        
        document.body.appendChild(errorOverlay);
    }
    
    /**
     * アプリケーション統計取得
     */
    getAppStats() {
        return {
            isInitialized: this.isInitialized,
            initializationError: this.initializationError?.message || null,
            coreStats: this.pixelCanvasCore ? this.pixelCanvasCore.getStats() : null,
            timestamp: Date.now()
        };
    }
    
    /**
     * アプリケーション再初期化
     */
    async reinitialize() {
        if (this.pixelCanvasCore) {
            console.log('🔄 Destroying existing PixelCanvas instance...');
            this.pixelCanvasCore.destroy();
        }
        
        this.pixelCanvasCore = null;
        this.isInitialized = false;
        this.initializationError = null;
        
        // エラーオーバーレイを削除
        const errorOverlay = document.getElementById('initializationError');
        if (errorOverlay) {
            errorOverlay.remove();
        }
        
        console.log('🔄 Reinitializing PixelCanvas...');
        await this.initialize();
    }
    
    /**
     * アプリケーション解放
     */
    destroy() {
        if (this.pixelCanvasCore) {
            this.pixelCanvasCore.destroy();
        }
        
        // グローバル参照を削除
        if (window.pixelCanvas === this.pixelCanvasCore) {
            delete window.pixelCanvas;
        }
        if (window.pixelCanvasApp === this) {
            delete window.pixelCanvasApp;
        }
        
        this.pixelCanvasCore = null;
        this.isInitialized = false;
        this.initializationError = null;
        
        console.log('🗑️ PixelCanvas application destroyed');
    }
}

/**
 * DOM準備完了時の初期化
 */
async function initializeApp() {
    try {
        console.log('🚀 Initializing PixelCanvas App...');
        
        // アプリケーション作成と初期化
        const app = new PixelCanvasApp();
        await app.initialize();
        
        console.log('✅ PixelCanvas App initialization completed');
        
    } catch (error) {
        console.error('❌ Failed to initialize PixelCanvas App:', error);
        
        // 致命的エラーの場合でも基本的な操作は可能にする
        window.pixelCanvasError = error;
        window.retryInitialization = () => {
            window.location.reload();
        };
    }
}

/**
 * ページロード時の初期化処理
 */
function onDOMReady() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        // DOMが既に準備完了している場合
        initializeApp();
    }
}

// 即座に実行
onDOMReady();

// モジュールエクスポート（テスト用）
export { PixelCanvasApp };
export default PixelCanvasApp;
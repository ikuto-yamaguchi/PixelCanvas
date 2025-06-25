// DiagnosticPanel.js - 完全なアプリケーション診断パネル

export class DiagnosticPanel {
    constructor() {
        this.isVisible = false;
        this.panel = null;
        this.updateInterval = null;
        this.createPanel();
        this.createToggleButton();
    }

    createToggleButton() {
        const button = document.createElement('button');
        button.textContent = '🔍 診断';
        button.style.cssText = `
            position: fixed;
            top: 130px;
            right: 10px;
            z-index: 10000;
            background: #9C27B0;
            border: none;
            border-radius: 5px;
            padding: 8px 12px;
            color: white;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        button.addEventListener('click', () => this.toggle());
        document.body.appendChild(button);
        this.button = button;
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            color: white;
            font-family: monospace;
            font-size: 11px;
            z-index: 9999;
            display: none;
            overflow: auto;
            padding: 20px;
            box-sizing: border-box;
        `;

        const header = document.createElement('div');
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #9C27B0;">🔍 PixelCanvas 完全診断</h2>
                <button id="closeDiagnostic" style="padding: 5px 10px; background: #666; border: none; color: white; cursor: pointer;">✕ 閉じる</button>
            </div>
        `;

        const content = document.createElement('div');
        content.id = 'diagnosticContent';
        
        this.panel.appendChild(header);
        this.panel.appendChild(content);
        document.body.appendChild(this.panel);

        // イベントリスナー
        document.getElementById('closeDiagnostic').addEventListener('click', () => this.toggle());
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.startDiagnostic();
        } else {
            this.stopDiagnostic();
        }
    }

    startDiagnostic() {
        this.updateDiagnostic();
        this.updateInterval = setInterval(() => this.updateDiagnostic(), 2000);
    }

    stopDiagnostic() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateDiagnostic() {
        const content = document.getElementById('diagnosticContent');
        if (!content) return;

        const pixelCanvas = window.pixelCanvas;
        const diagnosticData = this.gatherDiagnosticData(pixelCanvas);
        
        content.innerHTML = this.formatDiagnosticData(diagnosticData);
    }

    gatherDiagnosticData(pixelCanvas) {
        const data = {
            timestamp: new Date().toISOString(),
            
            // 基本状態
            pixelCanvasExists: !!pixelCanvas,
            pixelCanvasType: pixelCanvas ? typeof pixelCanvas : 'undefined',
            
            // Canvas要素
            canvasElement: this.getCanvasInfo(),
            
            // PixelStorage状態
            pixelStorage: this.getPixelStorageInfo(pixelCanvas),
            
            // レンダリングシステム
            rendering: this.getRenderingInfo(pixelCanvas),
            
            // イベントシステム
            events: this.getEventInfo(pixelCanvas),
            
            // ビューポート
            viewport: this.getViewportInfo(pixelCanvas),
            
            // ネットワーク
            network: this.getNetworkInfo(pixelCanvas),
            
            // ブラウザ状態
            browser: this.getBrowserInfo()
        };

        return data;
    }

    getCanvasInfo() {
        const canvas = document.getElementById('mainCanvas');
        return {
            exists: !!canvas,
            width: canvas ? canvas.width : 'N/A',
            height: canvas ? canvas.height : 'N/A',
            styleWidth: canvas ? canvas.style.width : 'N/A',
            styleHeight: canvas ? canvas.style.height : 'N/A',
            clientWidth: canvas ? canvas.clientWidth : 'N/A',
            clientHeight: canvas ? canvas.clientHeight : 'N/A',
            offsetParent: canvas ? !!canvas.offsetParent : 'N/A',
            visible: canvas ? (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) : false
        };
    }

    getPixelStorageInfo(pixelCanvas) {
        if (!pixelCanvas || !pixelCanvas.pixelStorage) {
            return { exists: false };
        }

        const storage = pixelCanvas.pixelStorage;
        return {
            exists: true,
            pixelCount: storage.pixels ? storage.pixels.size : 'N/A',
            pixelStock: storage.pixelStock || 'N/A',
            maxStock: storage.maxStock || 'N/A',
            samplePixels: storage.pixels ? Array.from(storage.pixels.entries()).slice(0, 3) : []
        };
    }

    getRenderingInfo(pixelCanvas) {
        if (!pixelCanvas) {
            return { pixelCanvasExists: false };
        }

        return {
            ultraFastRenderer: {
                exists: !!pixelCanvas.ultraFastRenderer,
                type: pixelCanvas.ultraFastRenderer ? typeof pixelCanvas.ultraFastRenderer : 'undefined'
            },
            pixiRenderer: {
                exists: !!pixelCanvas.pixiRenderer,
                initialized: pixelCanvas.pixiRenderer ? pixelCanvas.pixiRenderer.isInitialized : false,
                app: pixelCanvas.pixiRenderer && pixelCanvas.pixiRenderer.app ? 'exists' : 'missing'
            },
            lastRenderTime: pixelCanvas.lastRenderTime || 'N/A',
            pendingRender: pixelCanvas.pendingRender || false,
            scale: pixelCanvas.scale || 'N/A',
            offsetX: pixelCanvas.offsetX || 'N/A',
            offsetY: pixelCanvas.offsetY || 'N/A'
        };
    }

    getEventInfo(pixelCanvas) {
        if (!pixelCanvas || !pixelCanvas.eventHandlers) {
            return { exists: false };
        }

        const canvas = document.getElementById('mainCanvas');
        return {
            eventHandlersExists: true,
            canvasHasListeners: canvas ? canvas.onclick !== null || canvas.ontouchstart !== null : false,
            mouseState: pixelCanvas.eventHandlers.mouseState || 'N/A',
            touchState: pixelCanvas.eventHandlers.touchState || 'N/A'
        };
    }

    getViewportInfo(pixelCanvas) {
        if (!pixelCanvas) {
            return { pixelCanvasExists: false };
        }

        return {
            logicalWidth: pixelCanvas.logicalWidth || 'N/A',
            logicalHeight: pixelCanvas.logicalHeight || 'N/A',
            showGrid: pixelCanvas.showGrid || false,
            activeSectors: pixelCanvas.activeSectors ? pixelCanvas.activeSectors.size : 'N/A',
            deviceId: pixelCanvas.deviceId || 'N/A'
        };
    }

    getNetworkInfo(pixelCanvas) {
        if (!pixelCanvas || !pixelCanvas.networkManager) {
            return { exists: false };
        }

        return {
            exists: true,
            isOnline: navigator.onLine,
            supabaseURL: typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_URL : 'CONFIG undefined',
            supabaseKey: typeof CONFIG !== 'undefined' ? (CONFIG.SUPABASE_ANON_KEY ? 'Present' : 'Missing') : 'CONFIG undefined'
        };
    }

    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: screen.width,
            screenHeight: screen.height,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
        };
    }

    formatDiagnosticData(data) {
        const sections = [
            this.formatSection('🎯 基本状態', {
                'PixelCanvas存在': data.pixelCanvasExists ? '✅' : '❌',
                'タイプ': data.pixelCanvasType,
                'タイムスタンプ': data.timestamp
            }),
            
            this.formatSection('🖼️ Canvas要素', data.canvasElement),
            
            this.formatSection('💾 PixelStorage', data.pixelStorage),
            
            this.formatSection('🎨 レンダリング', data.rendering),
            
            this.formatSection('👆 イベント', data.events),
            
            this.formatSection('📍 ビューポート', data.viewport),
            
            this.formatSection('🌐 ネットワーク', data.network),
            
            this.formatSection('🌍 ブラウザ', data.browser)
        ];

        return sections.join('\n\n');
    }

    formatSection(title, data) {
        const lines = [`<div style="color: #9C27B0; font-weight: bold; margin-bottom: 10px;">${title}</div>`];
        
        for (const [key, value] of Object.entries(data)) {
            const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            const color = this.getValueColor(value);
            lines.push(`<div style="margin-left: 10px; color: ${color};">${key}: ${valueStr}</div>`);
        }
        
        return lines.join('\n');
    }

    getValueColor(value) {
        if (value === true || value === '✅') return '#4CAF50';
        if (value === false || value === '❌') return '#f44336';
        if (value === 'N/A' || value === 'undefined' || value === 'missing') return '#ff9800';
        return '#ffffff';
    }

    // 強制テスト描画
    static forceTestRender() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) {
            console.error('❌ Canvas element not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('❌ Canvas context not available');
            return;
        }

        console.log('🧪 Force test render starting...');
        
        // 画面クリア
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // テストピクセル描画（画面中央）
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
        
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                ctx.fillStyle = colors[(i + j) % colors.length];
                ctx.fillRect(
                    centerX - 50 + i * 20,
                    centerY - 50 + j * 20,
                    15, 15
                );
            }
        }
        
        // テキスト描画
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px monospace';
        ctx.fillText('TEST RENDER', centerX - 50, centerY - 70);
        
        console.log('✅ Force test render completed');
    }
}

// グローバルに利用可能にする
window.DiagnosticPanel = DiagnosticPanel;
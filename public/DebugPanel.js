// Mobile Debug Panel for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class DebugPanel {
    constructor() {
        this.debugLogs = [];
        this.logsFrozen = false;
        this.isVisible = false;
        
        this.createDebugPanel();
        this.createButtons();
        this.setupEventListeners();
    }
    
    createDebugPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'mobileDebugPanel';
        this.panel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: calc(100vw - 20px);
            max-height: 200px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            padding: 30px 10px 10px 10px;
            border-radius: 5px;
            z-index: 10000;
            overflow-y: auto;
            display: none;
        `;
        document.body.appendChild(this.panel);
    }
    
    createButtons() {
        this.createToggleButton();
        this.createCopyButton();
        this.createFreezeButton();
        this.createClearButton();
    }
    
    createToggleButton() {
        this.toggleButton = document.createElement('button');
        this.toggleButton.textContent = '🐛';
        this.toggleButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 20px;
            z-index: 10001;
            cursor: pointer;
        `;
        document.body.appendChild(this.toggleButton);
    }
    
    createCopyButton() {
        this.copyButton = document.createElement('button');
        this.copyButton.textContent = '📋 Copy';
        this.copyButton.style.cssText = this.getButtonStyle('5px');
        this.panel.appendChild(this.copyButton);
    }
    
    createFreezeButton() {
        this.freezeButton = document.createElement('button');
        this.freezeButton.textContent = '❄️ Freeze';
        this.freezeButton.style.cssText = this.getButtonStyle('75px');
        this.panel.appendChild(this.freezeButton);
    }
    
    createClearButton() {
        this.clearButton = document.createElement('button');
        this.clearButton.textContent = '🗑️ Clear';
        this.clearButton.style.cssText = this.getButtonStyle('145px');
        this.panel.appendChild(this.clearButton);
    }
    
    getButtonStyle(rightPosition) {
        return `
            position: absolute;
            top: 5px;
            right: ${rightPosition};
            background: #333;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
            padding: 5px 8px;
            font-size: 10px;
            cursor: pointer;
            z-index: 10002;
        `;
    }
    
    setupEventListeners() {
        this.toggleButton.addEventListener('click', () => this.toggle());
        this.copyButton.addEventListener('click', () => this.copyLogsToClipboard());
        this.freezeButton.addEventListener('click', () => this.toggleFreeze());
        this.clearButton.addEventListener('click', () => this.clearLogs());
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        this.toggleButton.textContent = this.isVisible ? '❌' : '🐛';
    }
    
    log(message) {
        if (this.logsFrozen) return;
        
        const timestamp = Utils.getTimestamp();
        const logEntry = `[${timestamp}] ${message}`;
        
        this.debugLogs.push(logEntry);
        
        // Limit log retention
        if (this.debugLogs.length > CONFIG.MAX_DEBUG_LOGS) {
            this.debugLogs = this.debugLogs.slice(-CONFIG.MAX_DEBUG_LOGS);
        }
        
        this.updateDisplay();
    }
    
    updateDisplay() {
        if (!this.panel) return;
        
        const content = this.debugLogs.slice(-50).join('\n');
        this.panel.innerHTML = `
            <div style="padding-top: 20px;">${content.replace(/\n/g, '<br>')}</div>
        `;
        
        // Re-append buttons
        this.panel.appendChild(this.copyButton);
        this.panel.appendChild(this.freezeButton);
        this.panel.appendChild(this.clearButton);
        
        // Auto-scroll to bottom
        this.panel.scrollTop = this.panel.scrollHeight;
    }
    
    async copyLogsToClipboard() {
        const allLogs = this.debugLogs.join('\n');
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(allLogs);
            } else {
                this.fallbackCopy(allLogs);
            }
            this.showCopySuccess();
        } catch (error) {
            console.error('Failed to copy logs:', error);
            this.fallbackCopy(allLogs);
        }
    }
    
    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 2em;
            height: 2em;
            padding: 0;
            border: none;
            outline: none;
            box-shadow: none;
            background: transparent;
            opacity: 0;
        `;
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopySuccess();
        } catch (error) {
            console.error('Fallback copy failed:', error);
        } finally {
            document.body.removeChild(textArea);
        }
    }
    
    showCopySuccess() {
        const originalText = this.copyButton.textContent;
        this.copyButton.textContent = '✅ Copied!';
        this.copyButton.style.background = '#4CAF50';
        
        setTimeout(() => {
            this.copyButton.textContent = originalText;
            this.copyButton.style.background = '#333';
        }, 2000);
    }
    
    toggleFreeze() {
        this.logsFrozen = !this.logsFrozen;
        this.freezeButton.textContent = this.logsFrozen ? '🔥 Unfreeze' : '❄️ Freeze';
        this.freezeButton.style.background = this.logsFrozen ? '#ff4444' : '#333';
    }
    
    clearLogs() {
        this.debugLogs = [];
        this.updateDisplay();
    }
    
    // Utility method for other modules to access logging
    static getInstance() {
        if (!DebugPanel.instance) {
            DebugPanel.instance = new DebugPanel();
        }
        return DebugPanel.instance;
    }
}
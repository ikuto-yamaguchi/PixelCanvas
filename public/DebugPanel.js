// Mobile Debug Panel for PixelCanvas
import { CONFIG, Utils } from './Config.js';

export class DebugPanel {
    constructor() {
        this.debugLogs = [];
        this.logsFrozen = false;
        this.isVisible = true; // Start visible to show all errors immediately
        
        this.createDebugPanel();
        this.createButtons();
        this.setupEventListeners();
        // PERFORMANCE: Disable console interception
        // this.interceptConsole();
        
        // Show panel immediately
        this.panel.style.display = 'block';
        console.log('🐛 Debug Panel initialized - logging disabled for performance');
    }
    
    createDebugPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'mobileDebugPanel';
        this.panel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: calc(100vw - 20px);
            max-height: 50vh;
            background: rgba(0, 0, 0, 0.95);
            color: #00ff00;
            font-family: monospace;
            font-size: 11px;
            padding: 35px 10px 10px 10px;
            border-radius: 5px;
            z-index: 10000;
            overflow-y: auto;
            display: block;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            border: 1px solid #333;
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
        this.toggleButton.textContent = '❌'; // Start with X since panel is visible
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
        // PERFORMANCE: Disable all logging operations
        return;
        
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
        
        // Show more logs for debugging (last 100 instead of 50)
        const content = this.debugLogs.slice(-100).join('\n');
        const contentDiv = document.createElement('div');
        contentDiv.style.paddingTop = '20px';
        contentDiv.style.wordBreak = 'break-word';
        contentDiv.style.whiteSpace = 'pre-wrap';
        
        // Color code different log types
        const colorizedContent = content
            .replace(/\[ERROR\]/g, '<span style="color: #ff4444;">[ERROR]</span>')
            .replace(/\[WARN\]/g, '<span style="color: #ffaa00;">[WARN]</span>')
            .replace(/\[LOG\]/g, '<span style="color: #44ff44;">[LOG]</span>')
            .replace(/\[INFO\]/g, '<span style="color: #4488ff;">[INFO]</span>')
            .replace(/\[UNCAUGHT ERROR\]/g, '<span style="color: #ff0000; font-weight: bold;">[UNCAUGHT ERROR]</span>')
            .replace(/\[UNHANDLED REJECTION\]/g, '<span style="color: #ff0000; font-weight: bold;">[UNHANDLED REJECTION]</span>');
        
        contentDiv.innerHTML = colorizedContent.replace(/\n/g, '<br>');
        
        // Clear panel and add content
        this.panel.innerHTML = '';
        this.panel.appendChild(contentDiv);
        
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
    
    interceptConsole() {
        // Store original console methods
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };
        
        // Override console methods to capture all logs
        console.log = (...args) => {
            this.originalConsole.log(...args);
            this.log(`[LOG] ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        };
        
        console.error = (...args) => {
            this.originalConsole.error(...args);
            this.log(`[ERROR] ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        };
        
        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            this.log(`[WARN] ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        };
        
        console.info = (...args) => {
            this.originalConsole.info(...args);
            this.log(`[INFO] ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
        };
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            this.log(`[UNCAUGHT ERROR] ${event.error?.stack || event.message} at ${event.filename}:${event.lineno}`);
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.log(`[UNHANDLED REJECTION] ${event.reason?.stack || event.reason}`);
        });
    }
    
    restoreConsole() {
        console.log = this.originalConsole.log;
        console.error = this.originalConsole.error;
        console.warn = this.originalConsole.warn;
        console.info = this.originalConsole.info;
    }
    
    // Utility method for other modules to access logging
    static getInstance() {
        if (!DebugPanel.instance) {
            DebugPanel.instance = new DebugPanel();
        }
        return DebugPanel.instance;
    }
}
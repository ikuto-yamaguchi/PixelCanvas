#!/usr/bin/env node

/**
 * Real-time Autonomous System Monitor
 * Provides live progress updates and control
 */

const fs = require('fs').promises;
const { execSync } = require('child_process');

class RealTimeMonitor {
    constructor() {
        this.logFile = './autonomous.log';
        this.isMonitoring = false;
        this.lastLogSize = 0;
        
        console.log('📊 Real-time Autonomous Monitor started');
        console.log('👀 Watching autonomous system progress...\n');
    }

    async startMonitoring() {
        this.isMonitoring = true;
        
        while (this.isMonitoring) {
            try {
                await this.checkProgress();
                await this.sleep(2000); // Check every 2 seconds
            } catch (error) {
                console.error('Monitor error:', error.message);
                await this.sleep(5000);
            }
        }
    }

    async checkProgress() {
        try {
            const stat = await fs.stat(this.logFile);
            const currentSize = stat.size;
            
            if (currentSize > this.lastLogSize) {
                // New content available
                const content = await fs.readFile(this.logFile, 'utf8');
                const lines = content.split('\n');
                const newLines = lines.slice(-20); // Last 20 lines
                
                this.displayProgress(newLines);
                this.lastLogSize = currentSize;
            }
        } catch {
            // Log file doesn't exist yet
            console.log('⏳ Waiting for autonomous system to start...');
        }
    }

    displayProgress(lines) {
        // Clear console and show header
        console.clear();
        console.log('🤖 PixelCanvas Autonomous System - LIVE MONITOR');
        console.log('=' .repeat(60));
        console.log(`📅 ${new Date().toLocaleString()}`);
        console.log('=' .repeat(60));
        
        // Show recent activity
        console.log('\n📊 RECENT ACTIVITY:');
        lines.forEach(line => {
            if (line.trim()) {
                // Color code the output
                if (line.includes('✅')) {
                    console.log(`\x1b[32m${line}\x1b[0m`); // Green
                } else if (line.includes('❌')) {
                    console.log(`\x1b[31m${line}\x1b[0m`); // Red
                } else if (line.includes('🔄')) {
                    console.log(`\x1b[36m${line}\x1b[0m`); // Cyan
                } else if (line.includes('🔍')) {
                    console.log(`\x1b[33m${line}\x1b[0m`); // Yellow
                } else {
                    console.log(line);
                }
            }
        });
        
        // Show system status
        this.showSystemStatus();
        
        console.log('\n💡 Press Ctrl+C to exit monitor');
    }

    showSystemStatus() {
        try {
            // Check if autonomous process is running
            const processes = execSync('ps aux | grep autonomous-claude.js | grep -v grep', { encoding: 'utf8' });
            
            if (processes.trim()) {
                console.log('\n🟢 AUTONOMOUS SYSTEM: ACTIVE');
                console.log('🔄 Continuous improvement in progress...');
            } else {
                console.log('\n🔴 AUTONOMOUS SYSTEM: STOPPED');
            }
        } catch {
            console.log('\n🔴 AUTONOMOUS SYSTEM: STOPPED');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.isMonitoring = false;
        console.log('\n📴 Monitor stopped');
    }
}

// Main execution
if (require.main === module) {
    const monitor = new RealTimeMonitor();
    
    process.on('SIGINT', () => {
        monitor.stop();
        process.exit(0);
    });

    monitor.startMonitoring().catch(error => {
        console.error('Monitor crashed:', error);
        process.exit(1);
    });
}

module.exports = RealTimeMonitor;
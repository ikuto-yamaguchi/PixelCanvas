// ログエクスポート機能
import { LogCategory } from './LoggerCore.js';

/**
 * ログエクスポート機能クラス
 */
export class LoggerExport {
    constructor() {
        // エクスポート設定
    }
    
    /**
     * ログエクスポート
     */
    exportLogs(logs, format = 'json', options = {}) {
        switch (format) {
            case 'json':
                return JSON.stringify(logs, null, 2);
            
            case 'csv':
                return this.exportToCsv(logs);
            
            case 'text':
                return this.exportToText(logs);
            
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    
    /**
     * CSV形式でエクスポート
     */
    exportToCsv(logs) {
        const headers = ['timestamp', 'level', 'category', 'message', 'data'];
        const csvLines = [headers.join(',')];
        
        for (const log of logs) {
            const row = [
                log.timestamp,
                log.level,
                log.category,
                `"${log.message.replace(/"/g, '""')}"`,
                `"${JSON.stringify(log.data || {}).replace(/"/g, '""')}"`
            ];
            csvLines.push(row.join(','));
        }
        
        return csvLines.join('\n');
    }
    
    /**
     * テキスト形式でエクスポート
     */
    exportToText(logs) {
        return logs.map(log => {
            const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
            const levelName = levelNames[log.level] || 'UNKNOWN';
            let line = `[${log.timestamp}] [${levelName}] [${log.category}] ${log.message}`;
            if (log.data) {
                line += `\n  Data: ${JSON.stringify(log.data)}`;
            }
            return line;
        }).join('\n');
    }
    
    /**
     * ログダウンロード
     */
    downloadLogs(logs, format = 'json', filename = null) {
        const data = this.exportLogs(logs, format);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultFilename = `pixelcanvas-logs-${timestamp}.${format}`;
        
        const blob = new Blob([data], {
            type: format === 'json' ? 'application/json' : 'text/plain'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`📝 Logs downloaded: ${a.download}`);
    }
    
    /**
     * ログインポート
     */
    importLogs(data, format = 'json') {
        try {
            switch (format) {
                case 'json':
                    return JSON.parse(data);
                
                case 'csv':
                    return this.importFromCsv(data);
                
                case 'text':
                    return this.importFromText(data);
                
                default:
                    throw new Error(`Unsupported import format: ${format}`);
            }
        } catch (error) {
            throw new Error(`Failed to import logs: ${error.message}`);
        }
    }
    
    /**
     * CSV形式からインポート
     */
    importFromCsv(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',');
        const logs = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            const values = this.parseCsvLine(line);
            if (values.length >= 5) {
                logs.push({
                    timestamp: values[0],
                    level: parseInt(values[1]),
                    category: values[2],
                    message: values[3].replace(/^"|"$/g, '').replace(/""/g, '"'),
                    data: JSON.parse(values[4].replace(/^"|"$/g, '').replace(/""/g, '"') || '{}')
                });
            }
        }
        
        return logs;
    }
    
    /**
     * CSV行をパース
     */
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }
    
    /**
     * テキスト形式からインポート
     */
    importFromText(textData) {
        const lines = textData.split('\n');
        const logs = [];
        
        for (const line of lines) {
            const match = line.match(/^\[(.+?)\] \[(.+?)\] \[(.+?)\] (.+)$/);
            if (match) {
                const levelMap = { 'ERROR': 0, 'WARN': 1, 'INFO': 2, 'DEBUG': 3, 'TRACE': 4 };
                logs.push({
                    timestamp: match[1],
                    level: levelMap[match[2]] || 2,
                    category: match[3],
                    message: match[4],
                    data: null
                });
            }
        }
        
        return logs;
    }
    
    /**
     * ログレポート生成
     */
    generateReport(logs, stats) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalLogs: logs.length,
                errorCount: stats.errorCount,
                warnCount: stats.warnCount,
                categories: stats.categoryCounts
            },
            logs: logs.slice(-100), // 最新100件
            browser: {
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            }
        };
        
        return report;
    }
}
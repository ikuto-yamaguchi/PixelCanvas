// SupabaseTest.js - Supabase接続テスト用ユーティリティ

import { CONFIG } from './Config.js';

export class SupabaseTest {
    static async testConnection() {
        console.log('🧪 Testing Supabase connection...');
        
        try {
            // 1. 基本的な接続テスト（シンプルなGET）
            const testUrl = `${CONFIG.SUPABASE_URL}/rest/v1/`;
            console.log(`🌐 Testing basic connection to: ${testUrl}`);
            
            const basicResponse = await fetch(testUrl, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY
                },
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log(`📊 Basic connection test: ${basicResponse.status} ${basicResponse.statusText}`);
            
            if (basicResponse.ok) {
                console.log('✅ Basic Supabase connection successful');
            } else {
                console.error('❌ Basic Supabase connection failed');
                return false;
            }
            
            // 2. テーブル存在確認
            const tableUrl = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=count&limit=1`;
            console.log(`🔍 Testing table access: ${tableUrl}`);
            
            const tableResponse = await fetch(tableUrl, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log(`📊 Table access test: ${tableResponse.status} ${tableResponse.statusText}`);
            
            if (tableResponse.ok) {
                const data = await tableResponse.json();
                console.log('✅ Table access successful, data:', data);
                return true;
            } else {
                const errorText = await tableResponse.text();
                console.error('❌ Table access failed:', errorText);
                return false;
            }
            
        } catch (error) {
            console.error('🚨 Supabase connection test failed:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            return false;
        }
    }
    
    static async testPixelQuery() {
        console.log('🧪 Testing pixel query...');
        
        try {
            const url = `${CONFIG.SUPABASE_URL}/rest/v1/pixels?select=sector_x,sector_y,local_x,local_y,color&limit=5`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log(`📊 Pixel query test: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const pixels = await response.json();
                console.log(`✅ Pixel query successful, got ${pixels.length} pixels:`, pixels);
                return pixels;
            } else {
                const errorText = await response.text();
                console.error('❌ Pixel query failed:', errorText);
                return null;
            }
            
        } catch (error) {
            console.error('🚨 Pixel query test failed:', error);
            return null;
        }
    }
    
    static createTestButton() {
        const button = document.createElement('button');
        button.textContent = '🧪 Test Supabase';
        button.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            z-index: 10000;
            background: #2196F3;
            border: none;
            border-radius: 5px;
            padding: 8px 12px;
            color: white;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        button.addEventListener('click', async () => {
            button.textContent = '🔄 Testing...';
            button.disabled = true;
            
            const connectionOk = await SupabaseTest.testConnection();
            if (connectionOk) {
                await SupabaseTest.testPixelQuery();
            }
            
            button.textContent = connectionOk ? '✅ Test OK' : '❌ Test Failed';
            button.style.background = connectionOk ? '#4CAF50' : '#f44336';
            
            setTimeout(() => {
                button.textContent = '🧪 Test Supabase';
                button.style.background = '#2196F3';
                button.disabled = false;
            }, 3000);
        });
        
        document.body.appendChild(button);
        return button;
    }
}

// 自動でテストボタンを作成
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        setTimeout(() => {
            SupabaseTest.createTestButton();
        }, 2000);
    });
}

// グローバルに利用可能にする
window.SupabaseTest = SupabaseTest;
// セクター(0,0)を256x256ピクセルでランダム色塗り尽くしスクリプト
const SUPABASE_URL = 'https://lgvjdefkyeuvquzckkvb.supabase.co';
const SUPABASE_ACCESS_TOKEN = 'sbp_015b2158d74b1624eec097e0d445b207cd5ebf04';
const GRID_SIZE = 256;

async function executeQuery(query) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndmpkZWZreWV1dnF1emNra3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MjMxNzEsImV4cCI6MjA2NTI5OTE3MX0.AqXyT6m78-O7X-ulzYdfBsLLMVsRoelpOUvPp9PCqiY'
        },
        body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return response.json();
}

async function fillSector() {
    console.log('🎨 セクター(0,0)をランダム色で塗り尽くし開始...');
    
    const batchSize = 1000; // バッチサイズ
    const totalPixels = GRID_SIZE * GRID_SIZE; // 65,536ピクセル
    
    let insertedPixels = 0;
    
    for (let batch = 0; batch < Math.ceil(totalPixels / batchSize); batch++) {
        const values = [];
        
        for (let i = 0; i < batchSize && insertedPixels < totalPixels; i++) {
            const localX = insertedPixels % GRID_SIZE;
            const localY = Math.floor(insertedPixels / GRID_SIZE);
            const color = Math.floor(Math.random() * 16); // 0-15のランダム色
            
            values.push(`(0, 0, ${localX}, ${localY}, ${color}, NOW())`);
            insertedPixels++;
        }
        
        if (values.length > 0) {
            const query = `
                INSERT INTO pixels (sector_x, sector_y, local_x, local_y, color, created_at) 
                VALUES ${values.join(', ')};
            `;
            
            try {
                await executeQuery(query);
                console.log(`✅ バッチ ${batch + 1}: ${values.length}ピクセル挿入完了 (${insertedPixels}/${totalPixels})`);
            } catch (error) {
                console.error(`❌ バッチ ${batch + 1} 失敗:`, error);
            }
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // セクター(0,0)のピクセル数更新
    await executeQuery(`
        UPDATE sectors 
        SET pixel_count = ${totalPixels}, 
            updated_at = NOW() 
        WHERE sector_x = 0 AND sector_y = 0;
    `);
    
    console.log(`🎉 完了！セクター(0,0)に${totalPixels}ピクセル挿入完了`);
}

// Node.js環境用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fillSector };
} else {
    // ブラウザ環境用
    fillSector().catch(console.error);
}
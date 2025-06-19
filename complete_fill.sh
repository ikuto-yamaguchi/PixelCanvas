#!/bin/bash

echo "🎨 セクター(0,0)塗り尽くし完了スクリプト開始"

# 現在のピクセル数確認
CURRENT=$(curl -s -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) as count FROM pixels WHERE sector_x = 0 AND sector_y = 0;"}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query | grep -o '"count":[0-9]*' | cut -d: -f2)

echo "📊 現在のピクセル数: $CURRENT"

# 残りピクセル数計算
REMAINING=$((65536 - CURRENT))
echo "📊 残りピクセル数: $REMAINING"

# 1000ピクセルずつバッチ処理
BATCH_SIZE=1000
START_INDEX=$CURRENT

for ((batch_start=START_INDEX; batch_start<65536; batch_start+=BATCH_SIZE)); do
    batch_end=$((batch_start + BATCH_SIZE - 1))
    if [ $batch_end -gt 65535 ]; then
        batch_end=65535
    fi
    
    batch_num=$(((batch_start - START_INDEX) / BATCH_SIZE + 1))
    echo "📊 バッチ $batch_num: ピクセル $batch_start-$batch_end 挿入中..."
    
    # VALUES句生成
    VALUES=""
    for ((i=batch_start; i<=batch_end; i++)); do
        local_x=$((i % 256))
        local_y=$((i / 256))
        color=$((RANDOM % 16))
        
        if [ $i -eq $batch_start ]; then
            VALUES="(0, 0, $local_x, $local_y, $color, NOW())"
        else
            VALUES="$VALUES, (0, 0, $local_x, $local_y, $color, NOW())"
        fi
    done
    
    # JSON生成
    echo "{\"query\": \"INSERT INTO pixels (sector_x, sector_y, local_x, local_y, color, created_at) VALUES $VALUES;\"}" > batch_$batch_num.json
    
    # 実行
    RESULT=$(curl -s -X POST \
      -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
      -H "Content-Type: application/json" \
      -d @batch_$batch_num.json \
      https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query)
    
    if [[ "$RESULT" == "[]" ]]; then
        echo "✅ バッチ $batch_num 成功"
        rm batch_$batch_num.json
    else
        echo "❌ バッチ $batch_num 失敗: $RESULT"
    fi
    
    # プログレス表示
    COMPLETED=$((batch_end + 1))
    PROGRESS=$((COMPLETED * 100 / 65536))
    echo "📈 進捗: $COMPLETED/65536 ($PROGRESS%)"
    
    # レート制限対策
    sleep 0.2
    
    # 完了チェック
    if [ $batch_end -eq 65535 ]; then
        break
    fi
done

echo "🎉 塗り尽くし完了！セクター(0,0)のピクセル数更新中..."

# セクターのピクセル数更新
curl -s -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE sectors SET pixel_count = 65536, updated_at = NOW() WHERE sector_x = 0 AND sector_y = 0;"}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query

echo "✅ セクター(0,0)完全塗り尽くし完了！65,536ピクセル挿入済み"
#!/bin/bash

# セクター(0,0)全体をランダム色で塗り尽くすスクリプト
echo "🎨 セクター(0,0)をランダム色で塗り尽くし中..."

# 効率的なバッチ挿入（1000ピクセルずつ）
for batch in {0..65}; do
    start=$((batch * 1000))
    end=$((start + 999))
    if [ $end -gt 65535 ]; then
        end=65535
    fi
    
    # VALUES句生成
    VALUES=""
    for ((i=start; i<=end; i++)); do
        local_x=$((i % 256))
        local_y=$((i / 256))
        color=$((RANDOM % 16))
        
        if [ "$VALUES" = "" ]; then
            VALUES="(0, 0, $local_x, $local_y, $color, NOW())"
        else
            VALUES="$VALUES, (0, 0, $local_x, $local_y, $color, NOW())"
        fi
    done
    
    # SQL実行
    echo "📊 バッチ $((batch + 1)): ピクセル $start-$end 挿入中..."
    
    curl -s -X POST \
      -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"INSERT INTO pixels (sector_x, sector_y, local_x, local_y, color, created_at) VALUES $VALUES;\"}" \
      https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ バッチ $((batch + 1)) 完了"
    else
        echo "❌ バッチ $((batch + 1)) 失敗"
    fi
    
    # レート制限対策
    sleep 0.1
    
    # 最後のバッチなら終了
    if [ $end -eq 65535 ]; then
        break
    fi
done

# セクター(0,0)のピクセル数更新
echo "📊 セクター(0,0)ピクセル数更新中..."
curl -s -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE sectors SET pixel_count = 65536, updated_at = NOW() WHERE sector_x = 0 AND sector_y = 0;"}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query > /dev/null

echo "🎉 完了！セクター(0,0)に65,536ピクセル挿入完了"
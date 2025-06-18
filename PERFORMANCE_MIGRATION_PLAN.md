# PixelCanvas パフォーマンス革命: PixiJS + LOD 移行計画

## 📋 現在のアーキテクチャ分析

### 🔍 現状システム
- **レンダリング**: Canvas 2D API (CPU描画)
- **レイヤー**: 5段階カスタムレイヤー (pixels → blocks → tiles → chunks → regions)
- **データ**: Supabase REST API + 単一解像度ピクセル
- **カメラ**: カスタムEventHandlers (パン&ズーム)
- **ストレージ**: PixelStorage (Map-based メモリ管理)

### ⚠️ 現在のボトルネック
1. **CPU描画限界**: Canvas 2D APIでの大量ピクセル描画
2. **転送量爆発**: ズームアウト時の指数的セクター増加
3. **メモリ効率**: 単一解像度での大量データ保持
4. **UI応答性**: メインスレッドでの重い処理

## 🎯 目標アーキテクチャ

### 🚀 新システム構成
- **レンダリング**: PixiJS + pixi-tilemap (GPU描画)
- **カメラ**: pixi-viewport (統一2Dカメラ)
- **LOD**: 4段階ピラミッド (1x, 1/2, 1/4, 1/8)
- **データ**: Supabase Realtime + 動的LOD切り替え
- **処理**: Web Workers (RLE decode, ImageBitmap生成)

## 📅 段階的移行戦略

### Phase 1: 基盤準備 (1-2日)
- [ ] PixiJS環境構築とテスト
- [ ] LODテーブル設計・作成
- [ ] 既存データからLODピラミッド生成

### Phase 2: 並行システム構築 (2-3日)  
- [ ] PixiJSレンダラー実装
- [ ] pixi-viewport統合
- [ ] LOD動的切り替えロジック

### Phase 3: 統合・最適化 (1-2日)
- [ ] Supabase Realtime統合
- [ ] パフォーマンス最適化
- [ ] 設定フラグによる切り替え

### Phase 4: 完全移行 (1日)
- [ ] 旧システム削除
- [ ] 最終調整・デバッグ

## 🔧 技術選定

### 必須ライブラリ
```json
{
  "pixi.js": "^7.3.0",
  "@pixi/tilemap": "^4.2.0", 
  "pixi-viewport": "^5.0.0"
}
```

### LODピラミッド構造
```
Level 0: 256x256 (フル解像度)
Level 1: 128x128 (1/2)
Level 2: 64x64   (1/4)  
Level 3: 32x32   (1/8)
```

### スケール閾値設計
```
scale >= 2.0  → Level 0 (256x256)
scale >= 0.5  → Level 1 (128x128)
scale >= 0.125 → Level 2 (64x64)
scale < 0.125 → Level 3 (32x32)
```

## 💾 データベース設計

### sector_lod テーブル
```sql
CREATE TABLE public.sector_lod (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_x INTEGER NOT NULL,
    sector_y INTEGER NOT NULL,
    lod_level INTEGER NOT NULL, -- 0,1,2,3
    width INTEGER NOT NULL,     -- 256,128,64,32
    height INTEGER NOT NULL,
    rle_data BYTEA,            -- RLE圧縮ピクセルデータ
    pixel_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(sector_x, sector_y, lod_level)
);

CREATE INDEX idx_sector_lod_coords ON sector_lod(sector_x, sector_y, lod_level);
CREATE INDEX idx_sector_lod_level ON sector_lod(lod_level);
```

## 🎮 パフォーマンス目標

### 描画性能
- 60fps @ 1000+ セクター表示
- <100ms LOD切り替え遅延
- <50MB GPU メモリ使用量

### 通信効率  
- 90% 転送量削減 (LODによる)
- <200ms 初期ロード時間
- リアルタイム更新 <100ms

## 🔄 フォールバック戦略

1. **設定フラグ**: `USE_PIXI_RENDERER` で切り替え
2. **エラー処理**: PixiJS失敗時は自動的に旧システム
3. **デバイス判定**: 低性能デバイスは旧システム継続
4. **段階展開**: ユーザー単位での新システム有効化

これにより安全で段階的な移行が可能になります。
# PixelCanvas 開発フロー

## 開発の基本原則
1. **ドキュメント先行開発**: 実装前に必ず設計書・仕様書を更新
2. **段階的実装**: 小さな単位で実装・テスト・デプロイを繰り返す
3. **モバイルファースト**: 常にモバイル環境を想定した開発

## Phase 1: フロントエンド基盤構築

### Step 1: プロジェクト構造セットアップ
```bash
pixelcanvas/
├── public/              # 静的ファイル
│   ├── index.html
│   ├── style.css
│   ├── main.js
│   ├── idb.js
│   ├── manifest.webmanifest
│   └── sw.js
├── supabase/           # 既存
├── package.json        # 更新
└── .github/            # 既存
```

### Step 2: 基本UI実装（モックアップ）
1. **index.html**
   - セマンティックHTML構造
   - Canvas要素配置
   - カラーパレットUI
   - レスポンシブメタタグ

2. **style.css**
   - CSS変数での色定義
   - Flexboxレイアウト
   - モバイル最適化
   - タッチ操作用スタイル

3. **main.js（基本機能）**
   - Canvas初期化
   - グリッド描画
   - タッチ/クリックイベント
   - カラー選択機能

### Step 3: オフライン機能実装
1. **idb.js**
   - IndexedDBラッパー実装
   - キュー管理機能

2. **sw.js**
   - 基本キャッシュ戦略
   - オフライン検知
   - バックグラウンド同期

3. **manifest.webmanifest**
   - PWA設定
   - アイコン定義
   - テーマカラー

### Step 4: GitHub Actions更新
1. **package.json**
   - ビルドスクリプト追加
   - 静的ファイルコピー

2. **deploy.yml**
   - publicディレクトリのデプロイ設定

## Phase 2: Supabaseバックエンド構築

### Step 1: データベース設計
1. **migrations/001_initial_schema.sql**
   - sectors, pixels, timelapse_videosテーブル
   - インデックス設定
   - RLS（Row Level Security）ポリシー

### Step 2: Edge Functions実装
1. **functions/draw/**
   - ピクセル描画API
   - レート制限
   - リアルタイム通知

2. **functions/tile/**
   - PNG生成ロジック
   - キャッシュヘッダー

3. **functions/expand/**
   - 70%判定ロジック
   - セクター生成

### Step 3: リアルタイム統合
1. **main.js更新**
   - Supabase Clientセットアップ
   - リアルタイム購読
   - 差分描画実装

## Phase 3: 最適化・完成

### Step 1: パフォーマンス最適化
1. タイル画像の遅延読み込み
2. Canvas描画バッチ処理
3. メモリ使用量最適化

### Step 2: エラーハンドリング
1. ネットワークエラー対応
2. 再接続ロジック
3. ユーザーフィードバック

### Step 3: テスト・デプロイ
1. モバイル実機テスト
2. パフォーマンス計測
3. 本番デプロイ

## 実装チェックリスト

### フロントエンド
- [ ] HTML構造完成
- [ ] CSS（4KB以内）
- [ ] main.js（18KB以内）
- [ ] idb.js（2KB以内）
- [ ] sw.js（3KB以内）
- [ ] PWA対応
- [ ] タッチ操作対応
- [ ] レスポンシブ対応

### バックエンド
- [ ] データベーススキーマ
- [ ] draw API
- [ ] tile API
- [ ] expand API
- [ ] リアルタイム設定
- [ ] レート制限
- [ ] エラーハンドリング

### デプロイ
- [ ] GitHub Actions設定
- [ ] Supabase設定
- [ ] ドメイン設定（オプション）
- [ ] SSL証明書
- [ ] CDN設定（オプション）

## トラブルシューティング

### よくある問題
1. **CORS エラー**
   - Supabase Edge Functionでヘッダー設定

2. **WebSocket接続エラー**
   - Supabaseダッシュボードでリアルタイム有効化確認

3. **描画パフォーマンス**
   - requestAnimationFrameでバッチ処理
   - 不要な再描画を避ける

## 開発コマンド

```bash
# ローカル開発
npm run dev

# ビルド
npm run build

# デプロイ（自動）
git push origin master
```
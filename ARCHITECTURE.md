# PixelCanvas アーキテクチャ設計書

## 🏗️ 新アーキテクチャ概要

### レイヤー構造 (4層)
```
src/
├── core/           # コア機能（状態管理、初期化）
│   ├── PixelCanvasCore.js     # メインアプリケーション
│   ├── StateManager.js       # 状態管理
│   └── ConfigManager.js      # 設定管理
├── data/           # データ層（通信、ストレージ）  
│   ├── PixelDataManager.js   # ピクセルデータ統合管理
│   ├── NetworkClient.js      # ネットワーク通信
│   ├── StorageService.js     # ストレージ管理
│   └── RealtimeService.js    # リアルタイム通信
├── render/         # 描画層（統一レンダリング）
│   ├── RenderStrategy.js     # 描画戦略パターン
│   ├── Canvas2DRenderer.js   # Canvas2D描画実装
│   ├── PixiRenderer.js       # PixiJS描画実装
│   └── ViewportManager.js    # ビューポート管理
├── utils/          # ユーティリティ層
│   ├── MathUtils.js          # 数学計算
│   ├── PerformanceMonitor.js # パフォーマンス監視
│   └── Logger.js             # ログ管理
└── ui/             # UI層
    ├── EventManager.js       # イベント処理
    ├── ControlsManager.js    # UI制御
    └── DebugManager.js       # デバッグ機能
```

## 🎯 設計原則

### 1. 単一責任の原則
- 各ファイルは1つの責任のみを持つ
- 最大行数制限: 300行

### 2. 依存関係の最小化
- 循環依存を完全排除
- インターフェース駆動設計

### 3. 戦略パターンの採用
- Renderer: Canvas2D vs PixiJS
- Storage: Supabase vs LocalStorage  
- Loading: Progressive vs Batch

### 4. パフォーマンス最適化
- 遅延読み込み
- メモリ効率化
- レンダリング最適化

## 🔄 移行計画

### Phase 1: 描画層統合
1. 7個のRendererを統合 → 3個に削減
2. 戦略パターンで切り替え可能に

### Phase 2: データ層整理  
1. NetworkManager分割 → 4個のサービスに
2. PixelStorage最適化

### Phase 3: コア層簡素化
1. main.js分割 → コア + UI
2. 初期化プロセス最適化

### Phase 4: 最終最適化
1. 不要ファイル削除
2. パフォーマンステスト
3. ドキュメント更新

## 📊 削減予定

| 項目 | 現在 | 削減後 | 削減率 |
|------|------|--------|--------|
| JSファイル数 | 40+ | 20 | 50% |
| 総行数 | 15,000+ | 8,000 | 47% |
| 重複コード | 5,000+ | 0 | 100% |

## 🎯 期待効果

1. **保守性向上**: 責任範囲明確化
2. **パフォーマンス向上**: 冗長処理削除
3. **テスト容易性**: 単体テスト可能
4. **拡張性向上**: モジュラー設計
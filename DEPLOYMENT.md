# デプロイメント設定ガイド

## GitHub Secrets設定

GitHubリポジトリの設定で以下のSecretsを追加してください：

### 必須のSecrets

1. **SUPABASE_PROJECT_ID**
   - 値: `lgvjdefkyeuvquzckkvb`

2. **SUPABASE_ACCESS_TOKEN**
   - 値: `sbp_015b2158d74b1624eec097e0d445b207cd5ebf04`

### GitHub Secrets設定手順

1. GitHubリポジトリページで `Settings` タブをクリック
2. 左サイドバーから `Secrets and variables` → `Actions` を選択
3. `New repository secret` ボタンをクリック
4. 上記の各Secretを追加

## 自動デプロイの流れ

1. `main` または `master` ブランチにプッシュ
2. GitHub Actionsが自動実行
3. 依存関係のインストール
4. アプリケーションのビルド
5. テストの実行
6. Supabaseへのデプロイ

## ファイル構成

```
pixcel_canvas/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions設定
├── supabase/
│   ├── config.toml            # Supabase設定
│   └── functions/             # Edge Functions用ディレクトリ
├── package.json               # Node.js設定
├── CLAUDE.md                  # プロジェクト設定
└── DEPLOYMENT.md              # このファイル
```

## 次のステップ

1. アプリケーションの実装
2. package.jsonのスクリプト更新
3. 必要に応じてSupabase関数の作成
4. GitHubにプッシュしてデプロイテスト
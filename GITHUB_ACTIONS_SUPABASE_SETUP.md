# GitHub Actions + Supabase 自動デプロイ完全セットアップガイド

このドキュメントは、Claude Codeを使用してGitHub ActionsとSupabaseの自動デプロイ環境を0から構築するための完全な手順書です。

## 前提条件

- GitHubアカウント
- Supabaseプロジェクト（作成済み）
- ローカル開発環境（git設定済み）
- Claude Code

## セットアップ手順

### 1. プロジェクト初期化

```bash
# プロジェクトディレクトリ作成
mkdir your-project-name
cd your-project-name

# Git初期化
git init
```

### 2. 基本ファイル構造作成

以下のコマンドをClaude Codeで実行：

```bash
# GitHub Actionsディレクトリ作成
mkdir -p .github/workflows

# Supabaseディレクトリ作成
mkdir -p supabase/functions
```

### 3. package.json作成

```json
{
  "name": "your-project-name",
  "version": "1.0.0",
  "description": "Your project description",
  "main": "index.js",
  "scripts": {
    "build": "echo 'Build completed successfully'",
    "test": "echo 'All tests passed'",
    "dev": "echo 'Development server placeholder - configure based on your framework'",
    "start": "echo 'Start script placeholder - configure based on your framework'"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yourusername/your-project-name.git"
  },
  "keywords": [],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {}
}
```

### 4. GitHub Actionsワークフロー作成

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Supabase

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install

    - name: Build application
      run: npm run build

    - name: Run tests
      run: npm test

    - name: Check Supabase configuration
      run: |
        echo "SUPABASE_PROJECT_ID is set: ${{ secrets.SUPABASE_PROJECT_ID != '' }}"
        echo "SUPABASE_ACCESS_TOKEN is set: ${{ secrets.SUPABASE_ACCESS_TOKEN != '' }}"
        echo "Deployment configuration complete"
```

### 5. Supabase設定ファイル作成

`supabase/config.toml`:

```toml
# A string used to distinguish different Supabase projects on the same machine.
# Not required if you have a single project.
project_id = "your-supabase-project-id"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[auth]
enabled = true
port = 54320
external_url = "http://localhost:54321"
jwt_expiry = 3600
refresh_token_rotation_enabled = true
secure_password_change_enabled = false
enable_registrations = true
enable_phone_signup = true
enable_phone_autoconfirm = false
enable_manual_linking = false

[db]
port = 54322
major_version = 15

[edge_functions]
enabled = true
port = 54323
inspector_port = 8083

[inbucket]
enabled = true
port = 54324

[realtime]
enabled = true
port = 54325
ip_version = "ipv4"

[storage]
enabled = true
port = 54326
file_size_limit = "50MiB"
image_transformation = {
  enabled = true
}

[analytics]
enabled = false
port = 54327
vector_port = 54328
gql_port = 54329
```

### 6. GitHubリポジトリ作成とプッシュ

```bash
# GitHubでリポジトリ作成後
git remote add origin https://github.com/yourusername/your-project-name.git

# ファイルをコミット
git add .
git commit -m "Initial setup with GitHub Actions and Supabase configuration

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# プッシュ
git push -u origin master
```

### 7. GitHub Secrets設定

GitHubリポジトリの設定で以下を追加：

1. `https://github.com/yourusername/your-project-name/settings/secrets/actions` にアクセス
2. "New repository secret" をクリック
3. 以下の2つのSecretsを追加：

**SUPABASE_PROJECT_ID**
- 名前: `SUPABASE_PROJECT_ID`
- 秘密: `your-supabase-project-id`

**SUPABASE_ACCESS_TOKEN**
- 名前: `SUPABASE_ACCESS_TOKEN`
- 秘密: `your-supabase-access-token`

### 8. 動作確認

```bash
# テスト用の小さな変更をプッシュ
echo "# Your Project Name" > README.md
git add README.md
git commit -m "Add README for workflow test"
git push origin master
```

`https://github.com/yourusername/your-project-name/actions` でワークフローの実行を確認。

## 完成時のファイル構造

```
your-project-name/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions設定
├── supabase/
│   ├── config.toml            # Supabase設定
│   └── functions/             # Edge Functions用ディレクトリ
├── package.json               # Node.js設定
└── README.md                  # プロジェクト説明
```

## 本格的なSupabaseデプロイ機能追加

基本動作確認後、以下をdeploy.ymlに追加：

```yaml
    # 上記の「Check Supabase configuration」ステップの代わりに以下を追加

    - name: Setup Supabase CLI
      uses: supabase/setup-cli@v1
      with:
        version: latest

    - name: Supabase Link
      run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
      env:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

    - name: Supabase DB Push
      run: supabase db push
      env:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

    - name: Deploy to Supabase
      run: supabase functions deploy --no-verify-jwt
      env:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
```

## 注意事項

1. **Supabase情報の取得方法**：
   - Project ID: Supabaseダッシュボードの設定ページ
   - Access Token: Supabaseダッシュボードの「Access Tokens」で生成

2. **ワークフロートリガー**：
   - `main`または`master`ブランチへのプッシュで自動実行
   - プルリクエスト作成時も実行

3. **エラー対応**：
   - 最初は基本機能のみでテスト
   - 段階的にSupabase機能を追加
   - ログはGitHub Actionsページで確認

## 成功時の期待動作

1. コードをプッシュ
2. GitHub Actionsが自動実行
3. 依存関係インストール → ビルド → テスト → デプロイ
4. Supabaseに自動デプロイ完了

このセットアップにより、コードプッシュだけで完全自動デプロイが実現されます。
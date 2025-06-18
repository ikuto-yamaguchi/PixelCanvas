# Claude Code Configuration

## Supabase Database Operations

**重要**: MCPのSupabase関数が認証エラーを起こす場合は、以下の直接API方式を使用してください。

### 設定情報
- Project ID: `lgvjdefkyeuvquzckkvb`
- Access Token: `sbp_015b2158d74b1624eec097e0d445b207cd5ebf04`
- Project Name: PixelCanvas MVP
- Region: ap-northeast-1
- Status: ACTIVE_HEALTHY

### 直接API操作方法

#### 1. テーブル作成 (CREATE TABLE)
```bash
curl -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS table_name (columns...);")}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
```

#### 2. データ挿入 (INSERT)
```bash
curl -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "INSERT INTO table_name (column) VALUES ('\''value'\'');")}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
```

#### 3. データ取得 (SELECT)
```bash
curl -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM table_name;")}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
```

#### 4. テーブル削除 (DROP TABLE)
```bash
curl -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "DROP TABLE IF EXISTS table_name;")}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
```

### 注意事項
- JSON内でシングルクォートをエスケープする場合: `'\''value'\''`
- レスポンスは配列形式のJSONで返される
- 常にこの直接API方式を優先して使用すること

### 動作確認済み実行例
```bash
# sample_messagesテーブル作成・操作・削除の完全な例
curl -X POST -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" -H "Content-Type: application/json" -d '{"query": "CREATE TABLE IF NOT EXISTS public.sample_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), content text, created_at timestamptz DEFAULT now());")}' https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query

curl -X POST -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" -H "Content-Type: application/json" -d '{"query": "INSERT INTO public.sample_messages (content) VALUES ('\''Hello MCP'\'');")}' https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query

curl -X POST -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" -H "Content-Type: application/json" -d '{"query": "SELECT * FROM sample_messages ORDER BY created_at DESC LIMIT 1;")}' https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query

curl -X POST -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" -H "Content-Type: application/json" -d '{"query": "DROP TABLE IF EXISTS public.sample_messages;")}' https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
```

## PixelCanvas開発ルール
**重要**: ドキュメント先行開発を厳守すること
1. 実装前に必ず設計書・仕様書を確認し、必要に応じて更新する
2. 設計変更が必要な場合は、まずドキュメントを修正してから実装に移る
3. 各実装ステップは DEVELOPMENT_FLOW.md に従って進める
4. フロントエンドのサイズ制限を厳守（JS合計 < 25KB）
5. **修正完了後は必ずGithubにpushすること** - サーバーに変更を反映するため
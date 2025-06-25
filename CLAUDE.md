# Claude Code Configuration

## 🚨 作業開始前確認事項
**必須**: 作業を開始する前に毎回1度CLAUDE.mdを読み、読んだことをユーザに報告すること
1. 作業依頼を受けた際は、まずCLAUDE.mdの内容を確認する
2. 現在のプロジェクト設定、開発ルール、制約事項を把握する
3. 「CLAUDE.mdを確認しました」と報告し、関連する重要事項があれば併せて言及する
4. その後、具体的な作業に着手する

## 🚨 よくあるミス防止ルール
**重要**: 同じミスを繰り返さないため、発見されたミスパターンを記録し予防策を実装する
1. **テスト未実行の防止**: 実装後は必ず動作テストを行い、テスト結果をユーザに報告する
2. **ファイル読み込み確認**: 新規作成したHTMLファイルには必要なJSモジュールが正しく読み込まれているか確認する
3. **パス指定ミス防止**: 相対パス・絶対パスを正しく区別し、ブラウザからアクセス可能な形式で記述する
4. **同期/非同期処理の明確化**: async/awaitの必要性を事前に検討し、適切に実装する
5. **依存関係の事前確認**: 新機能実装前に、必要なライブラリ・モジュールの存在と動作を確認する

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

## TODO管理システム
**重要**: 実装進捗は番号付きTODOリストで管理すること
1. `/todos/` ディレクトリで番号順にタスク管理
2. 大きなタスクリストが完了したら新規番号でファイル作成
3. 各TODOファイルは `XX_TASK_NAME.md` 形式で命名
4. 完了したタスクは必ず ✅ マークを付ける
5. 次のTODOリストへの引き継ぎ事項を明記する

## テスト駆動開発ルール
**重要**: 全てのテストがパスした時、正常に動作するものが完成する
1. 実装前に必ずテストを作成し、各コンポーネントの動作を検証する
2. テストは個別に実行でき、それぞれが独立して動作確認できること
3. 全てのテストがパスするまで、次の実装段階に進まない
4. テストが失敗した場合は、必ずその原因を特定し修正してからコード変更を行う
5. 統合テストでは実際のデータフローが正常に動作することを確認する


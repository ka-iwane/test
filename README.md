# LENS NOTE

GitHub PagesとSupabaseで動作する、社員旅行参加者専用の写真投稿サイトです。管理者が登録した参加者だけがログインでき、写真の選択・自動圧縮・投稿・一覧・拡大表示・所有者による削除に対応しています。

## Supabaseの準備

1. Supabaseでプロジェクトを作成します。
2. AuthenticationのProviders設定でEmail認証を有効にし、Anonymous Sign-Insと新規ユーザー登録を無効にします。
3. SupabaseのSQL Editorで [`supabase/schema.sql`](./supabase/schema.sql) を実行します。既存環境への再実行にも対応しています。
4. Project SettingsのAPI画面からProject URLとpublishable key（またはanon public key）を確認します。
5. [`js/config.js`](./js/config.js) のプレースホルダーを、確認した値へ置き換えます。

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-publishable-key";
```

Supabase URLとpublishable keyはブラウザへ公開されます。データの権限はRLSポリシーで制御します。service_role keyやデータベースパスワードは、絶対にこのリポジトリへ保存しないでください。

## 参加者の登録

自己登録画面はありません。管理者がSupabase DashboardのAuthentication > Usersから、参加者のメールアドレスと初期パスワードを登録します。作成されたユーザーのUUIDを確認し、SQL Editorで参加者情報を追加してください。

```sql
insert into public.participants (user_id, display_name, team_name)
values ('Authenticationに表示されたUUID', '山田 太郎', 'チームA');
```

参加を停止するときは、ユーザーを削除する代わりに無効化できます。

```sql
update public.participants
set is_active = false
where user_id = '対象ユーザーのUUID';
```

`team_name`はチーム別ミッション表示を追加するときの識別情報として利用できます。

## ローカルで確認

ES Modulesを利用しているため、ローカルWebサーバーから開いてください。

```powershell
npx serve .
```

Supabase未設定時はログインできません。

## GitHub Pagesへ公開

1. GitHubリポジトリのSettingsを開きます。
2. PagesのBuild and deploymentで「Deploy from a branch」を選択します。
3. 公開対象のブランチと`/(root)`を選択して保存します。
4. 発行されたURLでページを確認します。

CSS、JavaScriptなどは相対パスで参照しているため、プロジェクトサイト形式のURLにも対応します。

## セキュリティと画像処理

- 写真と参加者情報は、有効な参加者として登録されたログインユーザーだけが閲覧できます。
- Storageバケットは非公開で、画像表示には有効期間15分の署名付きURLを使用します。
- 投稿者は自分の写真だけを追加・削除できます。
- JPEG、PNG、WebPの入力に対応し、入力ファイルの上限は10MBです。
- 投稿時に最大1920pxのWebPへ再エンコードするため、EXIFなどのメタデータは保存されません。
- 一覧用に最大720pxのサムネイルを生成し、通信量を抑えます。
- 削除時はレコードを先に非表示化します。Storage削除に失敗しても、壊れた画像が一覧へ残りません。

## 動作確認

- PCとスマートフォンで表示が崩れないこと
- 未ログイン時にサイト本体が表示されないこと
- 未登録ユーザーがログイン後に拒否されること
- 無効化した参加者が写真とStorageへアクセスできないこと
- JPEG、PNG、WebPを投稿できること
- 10MBを超える画像が拒否されること
- 保存画像がWebPで、EXIF情報を含まないこと
- 一覧でサムネイル、拡大画面で通常サイズの画像が使われること
- 投稿後に一覧へ写真が追加されること
- 投稿者本人だけに削除操作が表示されること
- 別の参加者が他人の写真を削除できないこと
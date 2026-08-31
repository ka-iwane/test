# LENS NOTE

GitHub PagesとSupabaseで動作する、小規模な写真投稿サイトです。写真の選択・プレビュー・投稿・一覧・拡大表示・所有者による削除に対応しています。

Supabase未設定時はサンプル写真によるデモ表示になります。実際の投稿には以下の設定が必要です。

## Supabaseの準備

1. Supabaseでプロジェクトを作成します。
2. AuthenticationのProviders設定でAnonymous Sign-Insを有効にします。
3. SupabaseのSQL Editorで [`supabase/schema.sql`](./supabase/schema.sql) を実行します。
4. Project SettingsのAPI画面からProject URLとanon public keyを確認します。
5. [`js/config.js`](./js/config.js) のプレースホルダーを、確認した値へ置き換えます。

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-key";
```

Supabase URLとanon keyはブラウザへ公開されます。これはSupabaseの想定された使い方であり、データの権限はanon keyを隠すのではなくRLSポリシーで制御します。service_role keyやデータベースパスワードは、絶対にこのリポジトリへ保存しないでください。

## ローカルで確認

ES Modulesを利用しているため、ローカルWebサーバーから開いてください。VS CodeのLive Server、または任意の静的ファイルサーバーを利用できます。

```powershell
npx serve .
```

表示されたURLをブラウザで開きます。Supabase未設定でもUIは確認できますが、投稿ボタンからの保存はできません。

## GitHub Pagesへ公開

1. GitHubリポジトリのSettingsを開きます。
2. PagesのBuild and deploymentで「Deploy from a branch」を選択します。
3. 公開対象のブランチと`/(root)`を選択して保存します。
4. 発行されたURLでページを確認します。

CSS、JavaScriptなどは相対パスで参照しているため、プロジェクトサイト形式のURLにも対応します。

## セキュリティ

- データベースとStorageの変更は、匿名認証されたユーザー本人のデータだけに許可されます。
- 写真の閲覧は公開です。非公開写真を扱う用途では、Storageバケットをprivateに変更し、署名付きURLを発行する設計へ変更してください。
- 対応ファイルはJPEG、PNG、WebP、上限は10MBです。ブラウザ側とStorage側の両方で制限しています。
- ブラウザの匿名セッションを消去すると、以前の投稿を所有者として削除できなくなります。本番運用ではメール認証などの恒久的なログイン方式を推奨します。

## 動作確認

- PCとスマートフォンで表示が崩れないこと
- JPEG、PNG、WebPを投稿できること
- 10MBを超える画像が拒否されること
- 投稿後に一覧へ写真が追加されること
- 投稿者本人だけに削除操作が表示されること
- 別の匿名セッションから他人の写真を削除できないこと
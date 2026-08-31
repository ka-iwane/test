# タビクエ！

GitHub PagesとSupabaseで動作する、社員旅行参加者専用の写真投稿サイトです。参加者はチーム別QRコードとイベントPINで端末を初回登録します。メールアドレスやパスワードは不要です。

## Supabaseの準備

1. Supabaseでプロジェクトを作成します。
2. AuthenticationのProviders設定で、参加者用のAnonymous Sign-Insと管理者用のEmail認証を有効にします。一般利用者の新規ユーザー登録は無効にしてください。
3. SupabaseのSQL Editorで [`supabase/schema.sql`](./supabase/schema.sql) を実行します。既存環境への再実行にも対応しています。
4. Project SettingsのAPI画面からProject URLとpublishable key（またはanon public key）を確認します。
5. [`js/config.js`](./js/config.js) のプレースホルダーを、確認した値へ置き換えます。

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-publishable-key";
```

Supabase URLとpublishable keyはブラウザへ公開されます。データの権限はRLSポリシーで制御します。service_role keyやデータベースパスワードは、絶対にこのリポジトリへ保存しないでください。

## チームQRコードの発行

管理画面から6チームをまとめて発行できます。SQL Editorから発行する場合は [`supabase/create-six-teams.sql`](./supabase/create-six-teams.sql) を開き、共通PIN、有効期限、各チームの登録上限を変更して実行してください。

チームごとに個別発行する場合は次のSQLを実行します。PINは4〜8桁の数字、有効期限は旅行終了後まで、登録上限はチームの端末数に少し余裕を持たせて設定します。

```sql
select public.create_team_access(
	'チームA',
	'4826',
	'2026-09-03 23:59:59+09',
	10
) as team_token;
```

結果に表示されたトークンは再表示できないため、安全な場所へ控えます。公開サイトが`https://example.github.io/trip/`の場合、次の参加URLを作成します。

```text
https://example.github.io/trip/#team=発行されたトークン
```

このURLをChromeやEdgeの「このページのQRコードを作成」機能などでQRコード化し、該当チームだけに配布します。`#team=`以降はWebサーバーへ送信されないため、通常のアクセスログにはトークンが残りません。イベントPINはQRコードへ含めず、旅行案内など別の経路で知らせてください。

参加者はQRコードを読み取り、表示名とPINを入力します。登録後は同じブラウザなら自動的に参加状態が復元されます。ブラウザデータを消去した場合や端末を変更した場合は再登録が必要です。

### 登録状況の確認

```sql
select team_name, registration_count, max_registrations, expires_at, is_active
from public.team_access
order by created_at;
```

### QRコードの無効化

```sql
update public.team_access
set is_active = false
where team_name = 'チームA';
```

すでに登録済みの端末も停止する場合は、対象の参加者を無効化します。

```sql
update public.participants
set is_active = false
where team_name = 'チームA';
```

## 管理者ページ

### 初回管理者の登録

1. Supabase DashboardのAuthentication > Usersから、管理者のメールアドレスとパスワードを登録します。
2. 作成されたユーザーのUUIDを確認します。
3. SQL Editorで次を実行します。

```sql
insert into public.admins (user_id, display_name)
values ('Authenticationに表示されたUUID', '旅行運営');
```

service_role keyを管理画面へ設定する必要はありません。管理操作はログインユーザーが`admins`に登録されているか、Supabase側で毎回確認されます。

### アクセスURL

ローカルでは次のURLです。

```text
http://localhost:4173/admin/
```

GitHub Pagesでは公開URLの末尾へ`admin/`を付けます。

```text
https://example.github.io/trip/admin/
```

管理画面では次の操作ができます。

- チームA〜FのQRコード一括発行・画像保存
- QR受付の停止・再開
- 参加登録端末の確認・停止・再開
- 全チームの達成レポート確認・削除

QRトークンはハッシュ化して保存され、発行後に復元できません。管理画面で発行した直後にQR画像を保存してください。

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

- 写真と参加者情報は、QRコードとPINで登録された有効な端末だけが閲覧できます。
- Storageバケットは非公開で、画像表示には有効期間15分の署名付きURLを使用します。
- 写真の追加は登録端末本人、削除は同じチームの参加者だけが実行できます。
- QRトークンとPINはハッシュ化して保存し、平文では保持しません。
- PIN入力は匿名セッションごとに10分間5回までです。
- QRコードには推測困難なランダムトークンだけを含め、PINは別経路で共有します。
- 管理ページはメール認証に加え、`admins`テーブルによる権限確認を行います。
- JPEG、PNG、WebPの入力に対応し、入力ファイルの上限は10MBです。
- 投稿時に最大1920pxのWebPへ再エンコードするため、EXIFなどのメタデータは保存されません。
- 一覧用に最大720pxのサムネイルを生成し、通信量を抑えます。
- 削除時はレコードを先に非表示化します。Storage削除に失敗しても、壊れた画像が一覧へ残りません。

## 動作確認

- PCとスマートフォンで表示が崩れないこと
- 通常URLではサイト本体が表示されず、QRコードを求められること
- 正しいチームQRとPINで端末を登録できること
- 誤ったPINが拒否され、6回目は試行制限になること
- 期限切れ・人数上限到達・無効化済みQRが拒否されること
- 登録後は通常URLから自動的に参加状態が復元されること
- 無効化した端末が写真とStorageへアクセスできないこと
- JPEG、PNG、WebPを投稿できること
- 10MBを超える画像が拒否されること
- 保存画像がWebPで、EXIF情報を含まないこと
- 一覧でサムネイル、拡大画面で通常サイズの画像が使われること
- 投稿後に一覧へ写真が追加されること
- 同じチームの写真に削除操作が表示されること
- 別チームの参加者が写真を削除できないこと
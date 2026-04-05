# 祭り告知 LINE ボット

Google スプレッドシートで管理した祭り情報を、LINE に自動で告知するボットです。

## 通知タイミング

| タイミング | 内容 |
|-----------|------|
| 毎週月曜 8:00 | 今週の祭りをまとめて送信 |
| 毎日 18:00 | 翌日の祭りを告知 |
| 毎日 8:00 | 当日朝に祭りを告知 |

祭りのない日は何も送信しません。

---

## セットアップ手順

### 1. Google スプレッドシートの準備

スプレッドシートを新規作成し、以下のフォーマットで入力します（1行目はヘッダー）:

| 祭り名 | 日付 | 時間 | 場所 | 詳細 |
|--------|------|------|------|------|
| ○○夏祭り | 2026-07-25 | 18:00 〜 21:00 | ○○公園 | 雨天時は屋内に変更 |
| △△神社例大祭 | 2026-08-10 | 09:00〜17:00 | △△神社 |  |

**列と通知文の対応（当日・翌日）**

- **時間** … カード上では「🌙 前夜祭」として表示します（空欄なら行ごと省略）。
- **詳細** … 「⚠️ 特記事項」として表示します（空欄なら省略）。

**シートを公開する手順:**
1. 「共有」ボタンをクリック
2. 「リンクをコピー」の設定を「リンクを知っている全員 > 閲覧者」に変更
3. URLから `spreadsheets/d/` の後ろの ID をメモしておく

---

### 2. LINE Developers でチャネルを作成

1. [LINE Developers](https://developers.line.biz/) にログイン
2. 「新規プロバイダー作成」→「新規チャネル作成」→「Messaging API」を選択
3. チャネル作成後、「Messaging API設定」タブを開く
4. **チャネルアクセストークン**（長期）を発行してメモ
5. 「LINE Official Account Manager」で友達を募集（QRコードなど）

---

### 3. ローカルで動作確認

```bash
cd festival-line-bot

# .env ファイルを作成
copy .env.example .env
# .env を開いて値を入力

# テスト送信（当日分）
node scripts/notify.js today

# テスト送信（翌日分）
node scripts/notify.js tomorrow

# テスト送信（今週分）
node scripts/notify.js weekly
```

---

### 4. GitHub Actions に Secrets を設定

**注意:** Secret の登録は GitHub 上で **あなたのアカウント権限**が必要です。第三者やスクリプトが代わりに書き込むことはできません（トークンを安全に保つための仕様です）。

#### 設定ページを開く（このリポジトリ用）

`festival-line-bot` フォルダで次を実行すると、**正しいリポジトリの Secrets 画面**の URL が表示され、ブラウザでも開きます（Windows / Mac / Linux 対応）。

```bash
cd festival-line-bot
npm run github-secrets
```

ブラウザを開きたくないときは `NO_OPEN=1 npm run github-secrets`（Windows PowerShell では `$env:NO_OPEN=1; npm run github-secrets`）。

#### 手動で開く場合

`Settings` → `Secrets and variables` → `Actions` → `Repository secrets` から、次の **3 つ**を登録します。

| Secret 名 | 値 |
|-----------|-----|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEのチャネルアクセストークン |
| `GOOGLE_SHEET_ID` | スプレッドシートの ID（またはスプレッドシートの URL 全文でも可） |
| `GOOGLE_SHEET_GID` | シートの GID（半角数字。先頭シートなら通常 `0`） |

#### GitHub CLI（`gh`）で登録する場合

`npm run github-secrets` の出力に、`gh secret set ... --repo 所有者/リポジトリ` の例が表示されます（**github.com のリポジトリのときだけ**）。未ログインなら先に `gh auth login` を実行してください。

**GitHub 以外**（GitLab など）でリモートを置いている場合は、同コマンドで **CI/CD の Variables 画面**を開くようにしてあります。変数名は GitHub Actions と同じ `LINE_CHANNEL_ACCESS_TOKEN` などに合わせ、ワークフロー側でそれを参照する必要があります。

設定後、GitHub Actions が自動でスケジュール実行します。

### 通知の見た目（テキスト / カード / 画像）

- 既定では **Flex メッセージ**（祭り情報カード）で送ります。文面は「祭り情報のお知らせ」「本日開催／明日開催」、場所・前夜祭・特記事項の構成です。
- プレーンテキストにしたい場合は環境変数 `LINE_NOTIFY_DELIVERY=text` を設定します。
- **画像だけで送りたい場合**は、LINE Messaging API の仕様上、画像は **誰でも取得できる HTTPS の URL** が必要です（ローカルファイルをそのままでは送れません）。
  - Canva や Figma、スマホの画像編集アプリでカード画像を作成し、自サイト・オブジェクトストレージ・ブログ等にアップロードした URL を指定します。
  - `.env` に `LINE_NOTIFY_IMAGE_ORIGINAL_URL`（必須）と `LINE_NOTIFY_IMAGE_PREVIEW_URL`（任意、省略時は ORIGINAL と同じ）を書くと、**カードの前に画像メッセージが 1 通**付きます（自作画像に文言を全部載せたい場合は `LINE_NOTIFY_DELIVERY=image` で画像のみも可）。

#### 手動でテスト実行する

GitHub リポジトリの「Actions」タブ → 「祭り告知 LINE 通知」→ 「Run workflow」から
モード（today / tomorrow / weekly）を選んで手動実行できます。

**ドライラン**: 同じ画面の「LINE は送らず件数だけ確認」をオンにすると `LINE_NOTIFY_DRY_RUN=1` になり、スプレッドシート取得と該当件数のログだけ行います（401 の切り分けに使えます）。

---

## 単体リポジトリで動かしている場合：「pull / コピー」って何？

GitHub には次の **2 通りの置き方**があります。

| 形 | 例 | 説明 |
|----|-----|------|
| **単体リポジトリ** | `あなた名/festival-line-bot` | リポジトリの**いちばん上**に `scripts/` や `package.json` がある |
| **モノレポの中のフォルダ** | 大きなリポジトリの中の `festival-line-bot/` だけがこのボット | 別プロジェクトと同じリポジトリにまとまっている |

**`git pull` できるのは「今いるフォルダがつながっている GitHub の 1 個のリポジトリ」だけです。**  
Cursor で別の場所（例: 友人や別プロジェクトの `creating-visual-explainers/festival-line-bot`）を直しても、**あなたの `festival-line-bot` 単体リポジトリには自動では入りません。** だから「同じ変更を pull」と言ったのは、**単体リポ側に、更新済みのファイルを持ってくる**という意味です。

### 手順（わかりやすいやり方）

#### A. Cursor のターミナルから自動コピー（おすすめ）

このリポジトリの **`creating-visual-explainers/festival-line-bot`** をカレントにして:

```bash
npm run sync-standalone -- "C:\実際のパス\festival-line-bot"
```

`scripts/`・`package.json`・`.env.example`・`README.md`・`.github/workflows/festival-notify.yml` が、指定した **単体リポの clone 先**に上書きされます。

毎回パスを省略するには `.sync-target.example` を `.sync-target` にコピーし、1 行目に clone 先の絶対パスを書いてから `npm run sync-standalone` だけ実行してください（`.sync-target` は git に含めない運用が安全です）。

同期後は **単体リポのフォルダ**に移動し、下の「3. 4.」と同じく `git add` → `commit` → `push` してください。

#### B. 手でコピーする場合

1. **単体リポジトリを PC に clone しているフォルダ**を開く（例: `C:\src\festival-line-bot`）。ここが GitHub の `tsurimatsurikai-art/festival-line-bot` と同期する場所。
2. **更新したい中身**を、次のどちらかでそこへ持ってくる。
   - **コピー**: 別フォルダ（モノレポの `festival-line-bot` など）から、`scripts` フォルダ・`package.json`・`.github/workflows/festival-notify.yml`・`.env.example`・`README.md` などを上書きコピーする。
   - **自分だけが直すなら**: 単体リポの clone の中で、GitHub の「Code」から ZIP を落として必要なファイルだけ差し替えてもよい。
3. 単体リポのフォルダでターミナルを開き、次を実行する。

```bash
git add -A
git status
git commit -m "祭りボットのスクリプトを更新"
git push
```

4. GitHub の Actions が**新しいコミット**で動くので、必要なら **Secret を更新**してから手動でワークフローを再実行する。

### 迷ったら

- **いつも Cursor で触る場所を 1 つに決める**のがおすすめです。単体リポだけ使うなら、**単体リポを clone したフォルダだけ**を Cursor で開き、そこで編集 → `git push` すれば説明どおり動きます。
- モノレポ内の `festival-line-bot` だけ Cursor で開いている場合は、上の **コピー → 単体リポへ push** を一度だけでも行えば、GitHub Actions 上のコードが新しくなります。

---

## ファイル構成

```
festival-line-bot/
├── scripts/
│   ├── notify.js            メイン通知ロジック
│   ├── festival-message.js  テキスト・Flex の文面組み立て
│   ├── fetch-festivals.js   Google Sheetsからデータ取得
│   ├── send-line.js         LINE Messaging API送信
│   ├── verify-line-token.js チャネルアクセストークン検証（/v2/bot/info）
│   ├── github-secrets-helper.js  GitHub Secrets 設定ページを開く補助
│   ├── sync-to-standalone-repo.js 単体リポ clone へ一括コピー
│   └── load-env.js          ローカル用 .env 読み込み
├── .env.example             環境変数テンプレート
├── .env                     ローカル用（git管理外）
└── README.md

.github/workflows/
└── festival-notify.yml      GitHub Actions スケジュール設定
```

---

## 注意事項

- LINE Messaging API の Broadcast は **月200通まで無料**（2026年時点）。有料プランで増量可能。
- `.env` ファイルは `.gitignore` に追加してください（トークンを公開しないため）。
- GitHub Actions の cron はやや遅延する場合があります（数分程度）。

---

## テスト送信が失敗するとき

### GitHub Actions（リポジトリ直下に `scripts/` がある場合）

このリポジトリを **モノレポの下層フォルダではなく、単体の GitHub リポジトリのルート**に置いている場合、フォルダ構成は次のようになります。

```
（リポジトリのルート）
├── .github/workflows/
├── scripts/
├── package.json
└── …
```

このとき、ワークフローに **`working-directory: festival-line-bot`** だけが書いてあると、`festival-line-bot` というサブフォルダが存在せず **ジョブが即失敗**します。  
本リポジトリ付属のワークフローは、`festival-line-bot` フォルダがあればそこに入り、**なければルートのまま** `node scripts/notify.js` を実行する形に直してあります。古い yml をコピーしている場合は、こちらの内容に差し替えてください。

### ローカルで `node scripts/notify.js today` を実行するとき

- カレントディレクトリは **`festival-line-bot`（または `scripts` の親フォルダ）** にしてください。`scripts` の中に入った状態で実行すると `.env` が読めません。
- `LINE_CHANNEL_ACCESS_TOKEN` と `GOOGLE_SHEET_ID` が未設定だとエラーになります。
- `.env` に `LINE_NOTIFY_DELIVERY=image` とあるのに `LINE_NOTIFY_IMAGE_ORIGINAL_URL` が空だとエラーになります。画像を使わない場合は `flex` か `text` にするか、該当行を削除してください。

### スプレッドシートの取得が 400 Bad Request になる

シートの**データをいじっていなくても**、Secret の誤更新・共有設定の変化・Google 側の挙動で失敗することがあります。取得はまず通常の `export`、だめなら **gviz 経由**に自動で切り替えます（ログに `gviz で取得しました` と出ます）。

- **ID の貼り付け**: `GOOGLE_SHEET_ID` には、`https://docs.google.com/spreadsheets/d/【この部分】/edit` の **ID だけ**でも、**ブラウザのアドレスバーの URL 全体**でも構いません（スクリプトが ID を抜き出します）。
- **GID**: 2枚目以降のシートを読むときは、シートを開いたときの URL の `#gid=123456789` や `?gid=` の **半角数字**を `GOOGLE_SHEET_GID` に入れてください。未設定なら先頭シート（多くの場合 `0`）を読みます。
- **共有**: 「共有」で **リンクを知っている全員が閲覧者**になっているか確認してください。閲覧できないと取得に失敗します（403 や HTML が返ることもあります）。
- **GitHub Secret**: `GOOGLE_SHEET_ID` の値の先頭・末尾に **余計な改行**が入っていないか確認してください。

### LINE が 400 を返す（Flex が不正など）

Flex の JSON が LINE 側で弾かれた場合、**自動で同じ内容のテキストメッセージに切り替えて再送**します（ログに理由が出ます）。常にテキストだけにしたい場合は `LINE_NOTIFY_DELIVERY=text` を設定してください。

### 「スプレッドシートを編集したらエラー」ように見える（401 / Authentication failed）

**スプレッドシートの編集がトークンを無効にすることはありません。**  
該当する祭りの行がないときは **LINE API を呼ばない**のでジョブは成功します。日付を入れて「今日」に一致させると **初めて Broadcast が走り**、そこで **チャネルアクセストークンが無効**だと 401 になります。

1. LINE Developers で **チャネルアクセストークン（長期）を再発行**  
2. GitHub の **Repository secret `LINE_CHANNEL_ACCESS_TOKEN`** を更新（改行・余計な引用符なし）  
3. ログの `4***1` のような表記は、GitHub が数字をマスクしているだけで **中身は多くの場合 401（認証失敗）** です  

トークンを直す前に **スプレッドシートだけ試したい**ときは、Actions の環境変数に `LINE_NOTIFY_DRY_RUN=1` を足すか、ローカルで `LINE_NOTIFY_DRY_RUN=1 node scripts/notify.js today` を実行すると **LINE は呼ばず件数だけ**確認できます。

### トークンを再発行しても 401 のまま・届かない

1. **エラー行番号を見る**  
   ログが `send-line.js:38` で `LINE送信に失敗` となっている場合、**38 行目が `fetch` ではなく `throw` の古いスクリプト**です。このリポジトリの最新の `scripts/` と `.github/workflows/festival-notify.yml` を **単体リポジトリへコピーして push** してください（README 冒頭の「単体リポジトリで動かしている場合」の節も参照）。

2. **トークンが本当に有効かローカルで確認**  
   `.env` に再発行したトークンを入れたうえで、`festival-line-bot` フォルダで次を実行します。

   ```bash
   npm run verify-line
   ```

   - **成功** … `トークンは有効です` と出る → GitHub の Secret が **別の文字列**になっている可能性が高いです。Secret を開き、**いったん削除して新規作成**し、トークンを**1文字も欠かさず**貼り直してください（先頭末尾のスペース・改行なし）。
   - **失敗** … LINE Developers で **Messaging API** チャネルを開き、**チャネルアクセストークン（長期）** を発行し直してください（**チャネルシークレット**・**LINE Notify** のトークンは不可）。

3. **Secret を更新しているリポジトリが正しいか**  
   `tsurimatsurikai-art/festival-line-bot` で Actions を動かしているなら、**そのリポジトリ**の `Settings → Secrets → Actions` です。別リポジトリや Organization の Environment だけ更新していないか確認してください。

4. **検証は GitHub 上でも先に走ります**  
   最新のワークフローでは、通知の前に **「LINE トークン検証」** ステップが入ります。ここで落ちる場合は、まだトークンか Secret の参照が間違っています。

### Actions は成功（緑）なのに LINE が届かない

よくあるのは **そもそも送信処理をスキップした** パターンです。`today` は「実行日の日付」とスプレッドシートの**日付列が一致する行**があるときだけ Broadcast します。一致がなければジョブは**エラーにせず終了**します。

- 実行ログ末尾の **`======== 結果 ========`** を見る。`LINE は送信しませんでした` と出ていれば該当データなしです。
- GitHub Actions のジョブ画面では **Summary** に同じ内容が Markdown で出ます。
- 手動実行で `today` を選んでいるのに、シート上は「明日」の日付だけ入っている → **届きません**（`tomorrow` で試すか、日付を合わせる）。
- 日付は **`YYYY-MM-DD` 推奨**。`2026/4/4` のような形式も読み取るようになっています。
- 送信 API が成功しても、**その公式アカウントを友だち追加していないユーザーには届きません**。

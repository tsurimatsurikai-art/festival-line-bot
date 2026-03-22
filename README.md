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
| ○○夏祭り | 2026-07-25 | 10:00〜21:00 | ○○公園 | 花火あり |
| △△神社例大祭 | 2026-08-10 | 09:00〜17:00 | △△神社 |  |

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

リポジトリの `Settings > Secrets and variables > Actions` から以下を登録:

| Secret 名 | 値 |
|-----------|-----|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEのチャネルアクセストークン |
| `GOOGLE_SHEET_ID` | スプレッドシートのID |
| `GOOGLE_SHEET_GID` | シートのGID（通常は `0`） |

設定後、GitHub Actions が自動でスケジュール実行します。

#### 手動でテスト実行する

GitHub リポジトリの「Actions」タブ → 「祭り告知 LINE 通知」→ 「Run workflow」から
モード（today / tomorrow / weekly）を選んで手動実行できます。

---

## ファイル構成

```
festival-line-bot/
├── scripts/
│   ├── notify.js            メイン通知ロジック
│   ├── fetch-festivals.js   Google Sheetsからデータ取得
│   ├── send-line.js         LINE Messaging API送信
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

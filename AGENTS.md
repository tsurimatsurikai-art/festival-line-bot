# エージェント向けリポジトリ地図

人間向けの詳細は **README.md**（セットアップ・トラブルシュート・単体リポとの同期）。ここでは **変更の入り口と責務**だけを短くまとめる。

## 何をするリポジトリか

閲覧公開した Google スプレッドシートの祭り一覧を読み、**LINE Messaging API の Broadcast** で公式アカウントの友だちへ告知する。スケジュールは **GitHub Actions**（`TZ: Asia/Tokyo`）。

## 実行の入口

| 場所 | 役割 |
|------|------|
| `scripts/notify.js` | **メイン。** `node scripts/notify.js today \| tomorrow \| countdown`。シート取得 → 日付で絞り込み → 送信。Flex 失敗時のテキスト再送、ドライラン、GitHub Step Summary もここ。 |
| `scripts/fetch-festivals.js` | スプレッドシート CSV 取得（`export` → 失敗時 `gviz`）。`GOOGLE_SHEET_ID` / `GOOGLE_SHEET_GID` の正規化。 |
| `scripts/festival-message.js` | 当日・翌日・カウントダウン用の **テキスト / Flex JSON** の組み立て。 |
| `scripts/send-line.js` | LINE への `broadcast` 実装。 |
| `scripts/load-env.js` | ローカルで `.env` を読む（CI では未使用想定）。 |
| `scripts/verify-line-token.js` | Actions 先頭でトークン検証。 |
| `scripts/github-secrets-helper.js` | `npm run github-secrets` 用。 |
| `scripts/sync-to-standalone-repo.js` | モノレポから単体リポへファイル同期。 |

**環境変数の一覧と意味の正**は `notify.js` 先頭のコメントと **`.env.example`**。README にも同趣旨の説明あり。

## CI（GitHub Actions）

- ワークフロー: `.github/workflows/festival-notify.yml`（表示名: 祭り告知 LINE 通知）
- ジョブは `today` / `tomorrow` / `countdown` に分かれ、手動は `workflow_dispatch` の `mode` で選択。`dry_run` は手動時のみ `LINE_NOTIFY_DRY_RUN=1`。
- リポジトリ直下に `festival-line-bot` サブフォルダがあればそこに `cd` してから `node scripts/...`（モノレポ配置との両立）。

## ローカルで触るとき

- カレントは **リポジトリルート**（`package.json` と `scripts/` の親）。`scripts/` の中に入ったままだと `.env` が読めない。
- 例: `node scripts/notify.js today`、`LINE_NOTIFY_DRY_RUN=1 node scripts/notify.js today`（PowerShell は `$env:LINE_NOTIFY_DRY_RUN=1; node scripts/notify.js today`）。
- `npm run verify-line` でトークン確認。

## よくある変更パターン

| やりたいこと | 主に触るファイル |
|--------------|------------------|
| 告知文・カードの見た目 | `festival-message.js` |
| いつ「対象祭り」とみなすか（半年前ウィンドウなど） | `notify.js`（`filterFestivalsInCountdownWindow` など） |
| シートの列・CSV 解釈 | `fetch-festivals.js` |
| 送信 API・エラー文言 | `send-line.js` |
| スケジュール・Secrets 名・Node 版 | `festival-notify.yml` |

## 制約メモ（変更時に踏みやすい点）

- 同一日の Flex **カルーセル上限**は `notify.js` の `CAROUSEL_MAX`（超えるとテキストに切り替え）。
- `LINE_NOTIFY_DELIVERY=image` は **公開 HTTPS の画像 URL** が必須（ローカルファイル不可）。
- 本体リポを **private** のままにしつつ `raw` で取らせるには: **public 専用リポ**（例: `countdown 画像専用`）を作り、Actions の **任意シークレット** `COUNTDOWN_PUBLIC_GITHUB_PAT` + `COUNTDOWN_PUBLIC_GITHUB_REPO`（`owner/name`）を設定すると、countdown ジョブ内で同パス `assets/generated/countdown.png` に push し、送信用 URL は `https://raw.githubusercontent.com/…/main/…?run=…` を自動採用する。手動で別URLにしたい場合は `LINE_COUNTDOWN_IMAGE_RAW_BASE_URL`（`?` 有無はシェルで分岐）が最優先。
- 該当行がないときは **LINE を呼ばず成功終了**（「届かない」調査ではログと Summary の `======== 結果 ========` を見る）。

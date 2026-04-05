/**
 * チャネルアクセストークンが Messaging API 用として有効か確認する
 * （Broadcast より軽い GET /v2/bot/info）
 *
 *   node scripts/verify-line-token.js
 *   LINE_NOTIFY_DRY_RUN=1 のときは何もせず成功終了
 */

require('./load-env');

const TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

async function main() {
  if (process.env.LINE_NOTIFY_DRY_RUN === '1') {
    console.log('[verify-line-token] dry-run のためスキップ');
    return;
  }

  if (!TOKEN) {
    console.error(
      'LINE_CHANNEL_ACCESS_TOKEN が空です。\n' +
        'GitHub の Repository secrets で名前が「LINE_CHANNEL_ACCESS_TOKEN」と完全一致か、\n' +
        'このリポジトリの Actions がその Secret を参照しているか確認してください。',
    );
    process.exit(1);
  }

  console.log('トークン文字数（中身は出しません）:', TOKEN.length);
  if (TOKEN.length < 20) {
    console.warn('短すぎます。Secret に全文が入っているか確認してください。');
  }

  const res = await fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    console.error(
      'このトークンは LINE に拒否されました（Messaging API のチャネルアクセストークン（長期）か確認）。',
    );
    console.error('HTTP status:', res.status);
    console.error('応答:', text);
    process.exit(1);
  }

  console.log('トークンは有効です。bot の userId:', json && json.userId);
  if (json && json.displayName) {
    console.log('表示名:', json.displayName);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

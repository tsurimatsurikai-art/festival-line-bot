/**
 * LINE Messaging API でメッセージを送信する
 * Broadcast API を使って友達全員に送信する
 */

const LINE_API_URL = 'https://api.line.me/v2/bot/message/broadcast';
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

/**
 * テキストメッセージを全友達に一斉送信する
 * @param {string} text 送信するテキスト
 */
async function broadcast(text) {
  if (!TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
  }

  const body = {
    messages: [
      {
        type: 'text',
        text,
      },
    ],
  };

  const res = await fetch(LINE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE送信に失敗しました: ${res.status} ${detail}`);
  }

  console.log('LINE送信成功');
}

module.exports = { broadcast };

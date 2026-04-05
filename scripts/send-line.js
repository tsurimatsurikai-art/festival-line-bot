/**
 * LINE Messaging API でメッセージを送信する
 * Broadcast API を使って友達全員に送信する
 */

const LINE_API_URL = 'https://api.line.me/v2/bot/message/broadcast';

/** 前後の空白・改行は無効扱いになることがあるため除去する */
const TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

/**
 * メッセージを全友達に一斉送信する
 * @param {string|object|object[]} payload テキスト文字列、または LINE メッセージオブジェクト、またはその配列（最大5件）
 */
async function broadcast(payload) {
  if (!TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
  }

  let messages;
  if (typeof payload === 'string') {
    messages = [{ type: 'text', text: payload }];
  } else if (Array.isArray(payload)) {
    messages = payload;
  } else {
    messages = [payload];
  }

  if (messages.length === 0) {
    throw new Error('送信するメッセージがありません');
  }
  if (messages.length > 5) {
    throw new Error('1リクエストあたり最大5件までです（LINE Messaging API の制限）');
  }

  const body = { messages };

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
    const looksLikeBadToken =
      res.status === 401 ||
      /Authentication failed/i.test(detail) ||
      /Invalid channel access token/i.test(detail);

    if (looksLikeBadToken) {
      throw new Error(
        [
          'LINE の認証に失敗しました（チャネルアクセストークンが無効です）。',
          '',
          '【スプレッドシートを編集したから壊れたわけではありません】',
          '該当する祭りの行がないときは LINE API を呼ばないためジョブは成功します。',
          'シートに「今日」の行を入れると送信処理が走り、トークンが無効だとここで初めてエラーになります。',
          '',
          '対処:',
          '1) LINE Developers → 該当チャネル → Messaging API 設定',
          '2) 「チャネルアクセストークン（長期）」を再発行',
          '3) GitHub → Settings → Secrets → LINE_CHANNEL_ACCESS_TOKEN を更新（先頭末尾の改行なし・引用符なし）',
          '4) Messaging API のトークンであること（LINE Notify 用・チャネルシークレットは不可）',
          '',
          `API応答: ${detail}`,
        ].join('\n'),
      );
    }

    throw new Error(
      `LINE送信に失敗しました (HTTP status=${res.status}) ${detail}`,
    );
  }

  console.log('LINE送信成功');
}

module.exports = { broadcast };

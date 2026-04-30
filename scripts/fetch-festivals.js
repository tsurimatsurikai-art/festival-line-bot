/**
 * Google スプレッドシートから祭り情報を取得する
 *
 * スプレッドシートの形式（1行目はヘッダー）:
 * | 祭り名 | 日付(YYYY-MM-DD) | 時間 | 場所 | 詳細 |
 * （countdown: 「日付」＝前夜祭の日）
 * （notify の当日・翌日テンプレでは「時間」列→「時　間」行、「詳細」→連絡事項の行に表示します）
 *
 * シートを「リンクを知っている全員が閲覧可能」に公開しておく必要があります。
 *
 * スプレッドシートの中身を変えていなくても、環境変数の誤り・Google 側の挙動などで
 * /export が 400 になることがあるため、失敗時は gviz の CSV 取得にフォールバックします。
 */

/**
 * .env に ID だけでも、ブラウザの URL 全体を貼ってもよいように正規化する
 */
function normalizeSheetId(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  return s.replace(/\s+/g, '');
}

/**
 * gid は数字。URL や「gid=123」をそのまま貼られた場合も解釈する
 */
function normalizeGid(raw) {
  if (raw == null || String(raw).trim() === '') return '0';
  const s = String(raw).trim();
  const fromQuery = s.match(/gid=(\d+)/i);
  if (fromQuery) return fromQuery[1];
  if (/^\d+$/.test(s)) return s;
  throw new Error(
    `GOOGLE_SHEET_GID は半角数字（例: 0）か、URL の gid=数字 です。現在: ${JSON.stringify(s.slice(0, 60))}`,
  );
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; festival-line-bot/1.0)',
  Accept: 'text/csv,text/plain,*/*',
};

/**
 * @returns {Promise<{ csv: string, via: string }>}
 */
async function fetchCsvWithFallback(sheetId, gid) {
  const q = encodeURIComponent(gid);
  const attempts = [
    {
      name: 'export',
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${q}`,
    },
    {
      name: 'gviz',
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${q}`,
    },
  ];

  const errors = [];

  for (const { name, url } of attempts) {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });

    const body = await res.text();
    if (!res.ok) {
      errors.push(
        `${name}: ${res.status} ${res.statusText} … ${body.replace(/\s+/g, ' ').slice(0, 200)}`,
      );
      continue;
    }

    const trimmed = body.trim();
    const head = trimmed.slice(0, 24).toLowerCase();
    if (head.startsWith('<!') || head.startsWith('<html')) {
      errors.push(
        `${name}: 応答が HTML のため CSV ではありません（共有設定・ID を確認）`,
      );
      continue;
    }

    if (name === 'gviz') {
      console.log('[fetch-festivals] export が使えなかったため gviz で取得しました');
    }
    return { csv: body, via: name };
  }

  const hints = [
    '',
    'スプレッドシートの内容を変えていなくても、次で失敗することがあります:',
    '· GitHub Secret / .env の GOOGLE_SHEET_ID が別の値に変わった、先頭末尾に改行が入った',
    '· 共有が「リンクを知っている全員 → 閲覧者」から外れた',
    '· GOOGLE_SHEET_GID が別シートの数字とずれている',
    '',
    '試行ログ:',
    ...errors.map(e => `· ${e}`),
  ].join('\n');

  throw new Error(`スプレッドシートの取得に失敗しました（export / gviz とも失敗）${hints}`);
}

async function fetchFestivals() {
  const sheetId = normalizeSheetId(process.env.GOOGLE_SHEET_ID);
  const gid = normalizeGid(process.env.GOOGLE_SHEET_GID);

  if (!sheetId) {
    throw new Error(
      'GOOGLE_SHEET_ID が空です。スプレッドシート URL の /d/【ここ】/edit の部分、または URL 全体を設定してください',
    );
  }

  const { csv } = await fetchCsvWithFallback(sheetId, gid);
  return parseCsv(csv);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * スプレッドシートの日付セルは CSV で 2026/4/4 や M/D/YYYY になることがある。
 * 比較用に YYYY-MM-DD に寄せる。
 */
function normalizeSheetDate(raw) {
  const s = (raw || '').trim();
  if (!s) return '';

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const ymdSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) return `${ymdSlash[1]}-${pad2(ymdSlash[2])}-${pad2(ymdSlash[3])}`;

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${pad2(mdy[1])}-${pad2(mdy[2])}`;

  return s;
}

/**
 * CSV テキストを祭りオブジェクトの配列に変換する
 */
function parseCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // 1行目はヘッダーなのでスキップ
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    return {
      name:    (cols[0] || '').trim(),
      date:    normalizeSheetDate((cols[1] || '').trim()),
      time:    (cols[2] || '').trim(),   // 例: 10:00〜17:00
      place:   (cols[3] || '').trim(),
      detail:  (cols[4] || '').trim(),
    };
  }).filter(f => f.name && f.date);
}

/**
 * カンマ区切りの1行をパースする（ダブルクォート内のカンマを無視）
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = { fetchFestivals };

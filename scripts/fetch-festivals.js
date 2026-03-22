/**
 * Google スプレッドシートから祭り情報を取得する
 *
 * スプレッドシートの形式（1行目はヘッダー）:
 * | 祭り名 | 日付(YYYY-MM-DD) | 時間 | 場所 | 詳細 |
 *
 * シートを「リンクを知っている全員が閲覧可能」に公開しておく必要があります。
 */

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '0';

async function fetchFestivals() {
  if (!SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID が設定されていません');
  }

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`スプレッドシートの取得に失敗しました: ${res.status} ${res.statusText}`);
  }

  const csv = await res.text();
  return parseCsv(csv);
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
      date:    (cols[1] || '').trim(),   // YYYY-MM-DD
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

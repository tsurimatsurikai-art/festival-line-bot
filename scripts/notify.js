/**
 * 祭り告知メインスクリプト
 *
 * 使い方:
 *   node scripts/notify.js today     → 今日の祭りを送信
 *   node scripts/notify.js tomorrow  → 明日の祭りを送信
 *   node scripts/notify.js weekly    → 今週の祭りをまとめて送信
 *
 * 環境変数（.env または GitHub Secrets）:
 *   LINE_CHANNEL_ACCESS_TOKEN  LINE チャネルアクセストークン
 *   GOOGLE_SHEET_ID            Google スプレッドシートの ID
 *   GOOGLE_SHEET_GID           シートの GID（省略可、デフォルト: 0）
 *   TZ                         タイムゾーン（例: Asia/Tokyo）
 */

require('./load-env');

const { fetchFestivals } = require('./fetch-festivals');
const { broadcast } = require('./send-line');

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatFestival(f) {
  const parts = [`📍 場所: ${f.place}`];
  if (f.time)   parts.push(`🕐 時間: ${f.time}`);
  if (f.detail) parts.push(`📝 ${f.detail}`);
  return parts.join('\n');
}

async function notifyToday(festivals, today) {
  const todayStr = toDateStr(today);
  const targets = festivals.filter(f => f.date === todayStr);

  if (targets.length === 0) {
    console.log('今日の祭りはありません');
    return;
  }

  const lines = [
    `🎉 本日の祭り情報 (${todayStr}) 🎉`,
    '',
  ];
  targets.forEach(f => {
    lines.push(`【${f.name}】`);
    lines.push(formatFestival(f));
    lines.push('');
  });
  lines.push('楽しいお祭りをお楽しみください！');

  await broadcast(lines.join('\n'));
}

async function notifyTomorrow(festivals, today) {
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const targets = festivals.filter(f => f.date === tomorrowStr);

  if (targets.length === 0) {
    console.log('明日の祭りはありません');
    return;
  }

  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const dow = WEEKDAY_JA[tomorrow.getDay()];

  const lines = [
    `🎊 明日のお祭り情報 (${mm}/${dd}・${dow}) 🎊`,
    '',
  ];
  targets.forEach(f => {
    lines.push(`【${f.name}】`);
    lines.push(formatFestival(f));
    lines.push('');
  });
  lines.push('ぜひ遊びに来てください！');

  await broadcast(lines.join('\n'));
}

async function notifyWeekly(festivals, today) {
  // 今日から7日間
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const thisWeek = days
    .map(d => {
      const dateStr = toDateStr(d);
      const items = festivals.filter(f => f.date === dateStr);
      return { date: d, dateStr, items };
    })
    .filter(entry => entry.items.length > 0);

  if (thisWeek.length === 0) {
    console.log('今週の祭りはありません');
    return;
  }

  const lines = [
    '🗓️ 今週のお祭り情報 🗓️',
    '',
  ];

  thisWeek.forEach(entry => {
    const mm = String(entry.date.getMonth() + 1).padStart(2, '0');
    const dd = String(entry.date.getDate()).padStart(2, '0');
    const dow = WEEKDAY_JA[entry.date.getDay()];
    lines.push(`▼ ${mm}/${dd}（${dow}）`);
    entry.items.forEach(f => {
      lines.push(`  ・${f.name}`);
      if (f.time) lines.push(`    🕐 ${f.time}`);
      if (f.place) lines.push(`    📍 ${f.place}`);
    });
    lines.push('');
  });

  lines.push('詳細はお気軽にお問い合わせください 🎆');

  await broadcast(lines.join('\n'));
}

async function main() {
  const mode = process.argv[2] || 'today';
  const now = new Date();

  console.log(`実行モード: ${mode}  現在時刻: ${now.toISOString()}`);

  const festivals = await fetchFestivals();
  console.log(`祭り情報を ${festivals.length} 件取得しました`);

  if (mode === 'today') {
    await notifyToday(festivals, now);
  } else if (mode === 'tomorrow') {
    await notifyTomorrow(festivals, now);
  } else if (mode === 'weekly') {
    await notifyWeekly(festivals, now);
  } else {
    console.error(`不明なモード: ${mode}  (today / tomorrow / weekly)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

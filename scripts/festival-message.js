/**
 * 祭り告知用のテキスト・Flex メッセージを組み立てる
 *
 * スプレッドシート列の扱い（当日・翌日モード）:
 * - 時間 → 🌙 「時　間」行に表示（空なら省略）
 * - 詳細 → ⚠️ 連絡事項の行に表示（空なら省略）
 *
 * countdown: 「日付」列は前夜祭の日（残り日数は前夜祭当日までの暦日数）
 * 先頭のポスター画像は notify 側（既定では送らない）
 */

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** カード先頭の見出し（「祭り情報のお知らせ」ではなく「お知らせ」）。当日・翌日バブルと countdown で使用 */
const FLEX_HEADER_TITLE = '🎉　お知らせ';

function formatDateJa(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** @param {string} ymd YYYY-MM-DD */
function dateFromYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** @returns {number} today から event までの暦日数（同日なら 0） */
function calendarDaysUntil(today, eventDate) {
  const a = startOfLocalDay(today);
  const b = startOfLocalDay(eventDate);
  return Math.round((b - a) / 86400000);
}

/**
 * カウントダウン先頭の画像メッセージ用 URL（その画像を送るときのみ必須）
 * @returns {string}
 */
function getCountdownImageOriginalUrl() {
  const o = process.env.LINE_COUNTDOWN_IMAGE_ORIGINAL_URL;
  if (!o || String(o).trim() === '') {
    throw new Error(
      'LINE_COUNTDOWN_IMAGE_ORIGINAL_URL を設定してください（先頭の画像を送るときのみ必要）',
    );
  }
  return String(o).trim();
}

/**
 * プレビュー用。未指定時は original と同じ
 * @returns {string}
 */
function getCountdownImagePreviewUrl() {
  const p = process.env.LINE_COUNTDOWN_IMAGE_PREVIEW_URL;
  if (p && String(p).trim() !== '') {
    return String(p).trim();
  }
  return getCountdownImageOriginalUrl();
}

/**
 * 1 通目: 画像メッセージ（Vercel 等。環境変数の URL をそのまま使う）
 * @returns {{ type: 'image', originalContentUrl: string, previewImageUrl: string }}
 */
function getCountdownLeaderImageMessage() {
  return {
    type: 'image',
    originalContentUrl: getCountdownImageOriginalUrl(),
    previewImageUrl: getCountdownImagePreviewUrl(),
  };
}

/**
 * 今日から前夜祭日（スプレッドシートの日付列）までの暦日数
 * @param {string} eveYmd YYYY-MM-DD
 * @param {Date} today
 */
function daysUntilEveFestival(eveYmd, today) {
  return calendarDaysUntil(today, dateFromYmd(eveYmd));
}

function countdownLabel(days) {
  if (days <= 0) return '前夜祭は本日';
  if (days === 1) return '前夜祭は明日';
  return `前夜祭まで あと${days}日`;
}

function sep() {
  return { type: 'separator', margin: 'md' };
}

function centerText(text, size = 'md', extra = {}) {
  return {
    type: 'text',
    text,
    align: 'center',
    wrap: true,
    size,
    ...extra,
  };
}

function labeledBlock(iconLabel, value) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      {
        type: 'text',
        text: iconLabel,
        size: 'sm',
        weight: 'bold',
        wrap: true,
      },
      {
        type: 'text',
        text: `\u3000\u3000${value}`,
        size: 'sm',
        wrap: true,
        color: '#333333',
      },
    ],
  };
}

/**
 * 1件分の Flex バブル（祭り情報カード）
 * @param {object} f fetch-festivals の行
 * @param {Date} eventDate 表示する日付（当日・翌日）
 * @param {'today'|'tomorrow'} mode
 */
function buildFestivalBubble(f, eventDate, mode) {
  const dateStr = formatDateJa(eventDate);
  const headline =
    mode === 'today' ? '🎊　本　日　開　催　！' : '🎊　明　日　開　催　！';

  const bodyContents = [
    sep(),
    centerText(FLEX_HEADER_TITLE, 'lg', { weight: 'bold' }),
    centerText(`　　${dateStr}`, 'sm', { color: '#555555' }),
    sep(),
    centerText(headline, 'md', { weight: 'bold', margin: 'sm' }),
    sep(),
    centerText(`【 ${f.name} 】`, 'xl', { weight: 'bold' }),
    labeledBlock('📍　場　所', f.place || '未定'),
  ];

  if (f.time) {
    bodyContents.push(labeledBlock('🌙　時　間', f.time));
  }
  if (f.detail) {
    bodyContents.push(labeledBlock('⚠️　連　絡　事　項', f.detail));
  }

  bodyContents.push(sep());
  bodyContents.push(
    centerText('楽しいお祭りをお楽しみください！', 'sm', { color: '#444444' }),
  );

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      contents: bodyContents,
    },
  };
}

/**
 * 当日・翌日: テキスト1件分
 */
function buildFestivalTextBlock(f, eventDate, mode) {
  const dateStr = formatDateJa(eventDate);
  const headline =
    mode === 'today' ? '🎊　本　日　開　催　！' : '🎊　明　日　開　催　！';

  const lines = [
    '━━━━━━━━━━━━━━',
    FLEX_HEADER_TITLE,
    `　　${dateStr}`,
    '━━━━━━━━━━━━━━',
    '',
    headline,
    '',
    '━━━━━━━━━━━━━━',
    '',
    `【 ${f.name} 】`,
    '',
    '📍　場　所',
    `　　${f.place || '未定'}`,
  ];

  if (f.time) {
    lines.push('', '🌙　時　間', `　　${f.time}`);
  }
  if (f.detail) {
    lines.push('', '⚠️　連　絡　事　項', `　　${f.detail}`);
  }

  lines.push('', '━━━━━━━━━━━━━━', '楽しいお祭りをお楽しみください！');
  return lines.join('\n');
}

function buildDayFlexMessage(targets, eventDate, mode) {
  const bubbles = targets.map(f => buildFestivalBubble(f, eventDate, mode));
  const dateStr = formatDateJa(eventDate);
  const altBase =
    mode === 'today' ? '本日のお祭り' : '明日のお祭り';
  const altText =
    targets.length === 1
      ? `${altBase}: ${targets[0].name}（${dateStr}）`
      : `${altBase}（${targets.length}件・${dateStr}）`;

  if (bubbles.length === 1) {
    return {
      type: 'flex',
      altText: altText.slice(0, 400),
      contents: bubbles[0],
    };
  }

  return {
    type: 'flex',
    altText: altText.slice(0, 400),
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

function buildDayTextMessage(targets, eventDate, mode) {
  return targets.map(f => buildFestivalTextBlock(f, eventDate, mode)).join('\n\n');
}

/**
 * 開催日の約6ヶ月前〜当日までを対象とした一覧（既にフィルタ・日付昇順）
 * @param {Array<{name:string,date:string,time?:string,place?:string,detail?:string}>} sortedFestivals
 */
function buildCountdownText(sortedFestivals, today) {
  const lines = [
    '━━━━━━━━━━━━━━',
    '📣　お知らせ',
    '　　前夜祭まで',
    `　　${formatDateJa(today)} 現在`,
    '━━━━━━━━━━━━━━',
    '',
  ];

  sortedFestivals.forEach(f => {
    const eventDate = dateFromYmd(f.date);
    const dow = WEEKDAY_JA[eventDate.getDay()];
    const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
    const dd = String(eventDate.getDate()).padStart(2, '0');
    const days =
      typeof f.daysUntilEve === 'number'
        ? f.daysUntilEve
        : daysUntilEveFestival(f.date, today);
    const head = `${countdownLabel(days)} · ${mm}/${dd}（${dow}） 前夜祭`;
    lines.push(`▼ ${head}`);
    lines.push(`  ・【 ${f.name} 】`);
    lines.push(`　　📍 ${f.place || '未定'}`);
    if (f.time) lines.push(`　　🌙 時間 ${f.time}`);
    if (f.detail) lines.push(`　　⚠ 連絡事項 ${f.detail}`);
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━', '詳細は祭り会にお問い合わせください');
  return lines.join('\n');
}

/**
 * 1件分の Flex バブル（本文のみ）
 * @param {object} f
 * @param {Date} today
 */
function buildCountdownEveCardBubble(f, today) {
  const days =
    typeof f.daysUntilEve === 'number'
      ? f.daysUntilEve
      : daysUntilEveFestival(f.date, today);
  const d = Math.max(0, days);
  const numberText = String(d);
  const eventDate = dateFromYmd(f.date);
  const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
  const dd = String(eventDate.getDate()).padStart(2, '0');
  const dow = WEEKDAY_JA[eventDate.getDay()];

  const bodyContents = [
    centerText(FLEX_HEADER_TITLE, 'lg', { weight: 'bold' }),
    centerText('前夜祭まで', 'sm', { color: '#555555', margin: 'xs' }),
    centerText(`${formatDateJa(today)} 現在`, 'sm', {
      color: '#555555',
      margin: 'sm',
    }),
    sep(),
    centerText(numberText, '5xl', {
      weight: 'bold',
      color: '#E91E63',
      margin: 'md',
    }),
    sep(),
    centerText(`前夜祭  ${mm}/${dd}（${dow}）`, 'sm', { color: '#555555' }),
    sep(),
    centerText(`【 ${f.name} 】`, 'xl', { weight: 'bold' }),
    labeledBlock('📍　場　所', f.place || '未定'),
  ];

  if (f.time) {
    bodyContents.push(labeledBlock('🌙　時　間', f.time));
  }
  if (f.detail) {
    bodyContents.push(labeledBlock('⚠️　連　絡　事　項', f.detail));
  }
  bodyContents.push(
    sep(),
    centerText('詳細は祭り会にお問い合わせください', 'sm', {
      color: '#444444',
    }),
  );

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: '#ffffff',
      contents: bodyContents,
    },
  };
}

/**
 * 前夜祭カウントダウン: 1件は単一バブル、複数はカルーセル
 * @param {Array<{name:string,date:string,time?:string,place?:string,detail?:string,daysUntilEve?:number}>} sortedFestivals
 */
function buildCountdownFlex(sortedFestivals, today) {
  if (sortedFestivals.length === 0) {
    throw new Error('buildCountdownFlex: 対象がありません');
  }
  const bubbles = sortedFestivals.map(f => buildCountdownEveCardBubble(f, today));
  const altText =
    sortedFestivals.length === 1
      ? `前夜祭のお知らせ: ${sortedFestivals[0].name}（${formatDateJa(today)} 現在）`
      : `前夜祭のお知らせ（${sortedFestivals.length}件・${formatDateJa(today)} 現在）`.slice(0, 400);

  if (bubbles.length === 1) {
    return {
      type: 'flex',
      altText: altText.slice(0, 400),
      contents: bubbles[0],
    };
  }
  return {
    type: 'flex',
    altText: altText.slice(0, 400),
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

module.exports = {
  formatDateJa,
  buildDayFlexMessage,
  buildDayTextMessage,
  buildCountdownText,
  buildCountdownFlex,
  getCountdownImageOriginalUrl,
  getCountdownImagePreviewUrl,
  getCountdownLeaderImageMessage,
  daysUntilEveFestival,
};

/**
 * 祭り告知用のテキスト・Flex メッセージを組み立てる
 *
 * スプレッドシート列の扱い（当日・翌日モード）:
 * - 時間 → 🌙 「時　間」行に表示（空なら省略）
 * - 詳細 → ⚠️ 連絡事項の行に表示（空なら省略）
 */

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** カード先頭の見出し（「祭り情報のお知らせ」ではなく「お知らせ」）。当日・翌日バブルとカウントダウン一覧で使用 */
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

function countdownLabel(days) {
  if (days <= 0) return '本日開催';
  if (days === 1) return '明日開催';
  return `あと${days}日`;
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
    bodyContents.push(labeledBlock('⚠️　連 絡 事 項', f.detail));
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
    lines.push('', '⚠️　連 絡 事 項', `　　${f.detail}`);
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
    '　　開催まで毎日お届け',
    `　　${formatDateJa(today)} 現在`,
    '━━━━━━━━━━━━━━',
    '',
  ];

  sortedFestivals.forEach(f => {
    const eventDate = dateFromYmd(f.date);
    const dow = WEEKDAY_JA[eventDate.getDay()];
    const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
    const dd = String(eventDate.getDate()).padStart(2, '0');
    const days = calendarDaysUntil(today, eventDate);
    const head = `${countdownLabel(days)} · ${mm}/${dd}（${dow}）`;
    lines.push(`▼ ${head}`);
    lines.push(`  ・【 ${f.name} 】`);
    lines.push(`　　📍 ${f.place || '未定'}`);
    if (f.time) lines.push(`　　🌙 時間 ${f.time}`);
    if (f.detail) lines.push(`　　⚠ ${f.detail}`);
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━', '詳細は祭り会にお問い合わせください');
  return lines.join('\n');
}

/** カウントダウン行の見出し（当日・翌日モードと同じ字間の「本　日　開　催　！」系） */
function countdownFlexHeadline(days) {
  if (days <= 0) return '🎊　本　日　開　催　！';
  if (days === 1) return '🎊　明　日　開　催　！';
  return `📅　あと${days}日`;
}

/**
 * @param {Array<{name:string,date:string,time?:string,place?:string,detail?:string}>} sortedFestivals
 */
function buildCountdownFlex(sortedFestivals, today) {
  const rowContents = [];

  sortedFestivals.forEach((f, index) => {
    const eventDate = dateFromYmd(f.date);
    const mm = String(eventDate.getMonth() + 1).padStart(2, '0');
    const dd = String(eventDate.getDate()).padStart(2, '0');
    const dow = WEEKDAY_JA[eventDate.getDay()];
    const days = calendarDaysUntil(today, eventDate);

    const block = {
      type: 'box',
      layout: 'vertical',
      spacing: 'none',
      margin: index === 0 ? 'none' : 'lg',
      contents: [
        centerText(countdownFlexHeadline(days), 'md', {
          weight: 'bold',
          margin: index === 0 ? 'sm' : 'md',
        }),
        centerText(`${mm}/${dd}（${dow}）`, 'sm', { color: '#555555', margin: 'xs' }),
        sep(),
        centerText(`【 ${f.name} 】`, 'xl', { weight: 'bold' }),
        labeledBlock('📍　場　所', f.place || '未定'),
      ],
    };

    if (f.time) {
      block.contents.push(labeledBlock('🌙　時　間', f.time));
    }
    if (f.detail) {
      block.contents.push(labeledBlock('⚠️　特　記　事　項', f.detail));
    }

    rowContents.push(block);
  });

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      contents: [
        sep(),
        centerText(FLEX_HEADER_TITLE, 'lg', { weight: 'bold' }),
        centerText('　　開催まで毎日お届け', 'sm', {
          color: '#555555',
          margin: 'xs',
        }),
        centerText(`　　${formatDateJa(today)} 現在`, 'sm', {
          color: '#555555',
          margin: 'sm',
        }),
        sep(),
        ...rowContents,
        sep(),
        centerText('詳細は祭り会にお問い合わせください', 'sm', {
          color: '#444444',
          margin: 'md',
        }),
      ],
    },
  };

  return {
    type: 'flex',
    altText: `お知らせ（${sortedFestivals.length}件）`.slice(0, 400),
    contents: bubble,
  };
}

module.exports = {
  formatDateJa,
  buildDayFlexMessage,
  buildDayTextMessage,
  buildCountdownText,
  buildCountdownFlex,
};

/**
 * 祭り告知用のテキスト・Flex メッセージを組み立てる
 *
 * スプレッドシート列の扱い（当日・翌日モード）:
 * - 時間 → 🌙 前夜祭の行に表示（空なら省略）
 * - 詳細 → ⚠️ 特記事項の行に表示（空なら省略）
 */

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJa(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
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
    centerText('🎉　祭り情報のお知らせ', 'lg', { weight: 'bold' }),
    centerText(`　　${dateStr}`, 'sm', { color: '#555555' }),
    sep(),
    centerText(headline, 'md', { weight: 'bold', margin: 'sm' }),
    sep(),
    centerText(`【 ${f.name} 】`, 'xl', { weight: 'bold' }),
    labeledBlock('📍　場　所', f.place || '未定'),
  ];

  if (f.time) {
    bodyContents.push(labeledBlock('🌙　前　夜　祭', f.time));
  }
  if (f.detail) {
    bodyContents.push(labeledBlock('⚠️　特 記 事 項', f.detail));
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
    '🎉　祭り情報のお知らせ',
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
    lines.push('', '🌙　前　夜　祭', `　　${f.time}`);
  }
  if (f.detail) {
    lines.push('', '⚠️　特 記 事 項', `　　${f.detail}`);
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

function buildWeeklyText(festivals, today) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const thisWeek = days
    .map(d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const items = festivals.filter(f => f.date === dateStr);
      return { date: d, dateStr, items };
    })
    .filter(entry => entry.items.length > 0);

  const lines = [
    '━━━━━━━━━━━━━━',
    '🗓️　今週の祭り情報',
    `　　${formatDateJa(today)} 〜`,
    '━━━━━━━━━━━━━━',
    '',
  ];

  thisWeek.forEach(entry => {
    const mm = String(entry.date.getMonth() + 1).padStart(2, '0');
    const dd = String(entry.date.getDate()).padStart(2, '0');
    const dow = WEEKDAY_JA[entry.date.getDay()];
    lines.push(`▼ ${mm}/${dd}（${dow}）`);
    entry.items.forEach(f => {
      lines.push(`  ・【 ${f.name} 】`);
      lines.push(`　　📍 ${f.place || '未定'}`);
      if (f.time) lines.push(`　　🌙 前夜祭 ${f.time}`);
      if (f.detail) lines.push(`　　⚠ ${f.detail}`);
    });
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━', '詳細はお気軽にお問い合わせください 🎆');
  return lines.join('\n');
}

function buildWeeklyFlex(festivals, today) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const thisWeek = days
    .map(d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const items = festivals.filter(f => f.date === dateStr);
      return { date: d, items };
    })
    .filter(entry => entry.items.length > 0);

  const rowContents = [];

  thisWeek.forEach(entry => {
    const mm = String(entry.date.getMonth() + 1).padStart(2, '0');
    const dd = String(entry.date.getDate()).padStart(2, '0');
    const dow = WEEKDAY_JA[entry.date.getDay()];
    rowContents.push({
      type: 'text',
      text: `▼ ${mm}/${dd}（${dow}）`,
      weight: 'bold',
      size: 'md',
      wrap: true,
      margin: 'lg',
    });
    entry.items.forEach(f => {
      rowContents.push({
        type: 'text',
        text: `・【 ${f.name} 】\n　📍 ${f.place || '未定'}${f.time ? `\n　🌙 ${f.time}` : ''}${f.detail ? `\n　⚠ ${f.detail}` : ''}`,
        size: 'sm',
        wrap: true,
        margin: 'sm',
      });
    });
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
        centerText('🗓️　今週の祭り情報', 'lg', { weight: 'bold' }),
        centerText(`　　${formatDateJa(today)} 〜`, 'sm', { color: '#555555' }),
        sep(),
        ...rowContents,
        sep(),
        centerText('詳細はお気軽にお問い合わせください 🎆', 'sm', {
          color: '#444444',
        }),
      ],
    },
  };

  return {
    type: 'flex',
    altText: `今週のお祭り（${thisWeek.length}日分）`.slice(0, 400),
    contents: bubble,
  };
}

module.exports = {
  formatDateJa,
  buildDayFlexMessage,
  buildDayTextMessage,
  buildWeeklyText,
  buildWeeklyFlex,
};

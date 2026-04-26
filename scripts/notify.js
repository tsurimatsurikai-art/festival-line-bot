/**
 * 祭り告知メインスクリプト
 *
 * 使い方:
 *   node scripts/notify.js today     → 今日の祭りを送信
 *   node scripts/notify.js tomorrow  → 明日の祭りを送信
 *   node scripts/notify.js countdown → 開催約6ヶ月前〜当日までの祭りを一覧送信（毎朝ジョブ用）
 *
 * 環境変数（.env または GitHub Secrets）:
 *   LINE_CHANNEL_ACCESS_TOKEN  LINE チャネルアクセストークン
 *   GOOGLE_SHEET_ID            Google スプレッドシートの ID
 *   GOOGLE_SHEET_GID           シートの GID（省略可、デフォルト: 0）
 *   TZ                         タイムゾーン（例: Asia/Tokyo）
 *
 *   LINE_NOTIFY_DELIVERY       送信形式: flex（既定）| text | image
 *   LINE_NOTIFY_IMAGE_ORIGINAL_URL  画像メッセージ用の HTTPS URL（オプション）
 *   LINE_NOTIFY_IMAGE_PREVIEW_URL   プレビュー用 URL（省略時は ORIGINAL と同じ）
 *   LINE_NOTIFY_COUNTDOWN_IMAGE_ORIGINAL_URL_TEMPLATE
 *                                   countdown 専用画像 URL テンプレート（{days}, {sendDate}, {sendDateEncoded} を展開）
 *   LINE_NOTIFY_COUNTDOWN_IMAGE_PREVIEW_URL_TEMPLATE
 *                                   countdown 専用プレビュー URL テンプレート（省略時は ORIGINAL_TEMPLATE を使用）
 *   LINE_NOTIFY_NO_FLEX_FALLBACK    1 で Flex 失敗時のテキスト再送を止める
 *   LINE_NOTIFY_DRY_RUN             1 ならスプレッドシート取得・件数確認のみ（LINE API は呼ばない）
 */

require('./load-env');

const fs = require('fs');
const { fetchFestivals } = require('./fetch-festivals');
const { broadcast } = require('./send-line');
const {
  buildDayFlexMessage,
  buildDayTextMessage,
  buildCountdownText,
  buildCountdownFlex,
} = require('./festival-message');

const CAROUSEL_MAX = 12;

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** @param {string} ymd */
function dateFromYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDaysUntil(today, eventDate) {
  const a = startOfLocalDay(today);
  const b = startOfLocalDay(eventDate);
  return Math.round((b - a) / 86400000);
}

function addCalendarMonths(date, deltaMonths) {
  const x = new Date(date.getTime());
  x.setMonth(x.getMonth() + deltaMonths);
  return x;
}

/**
 * 開催日の約6ヶ月前（同日ベース）〜開催当日まで、今日がその範囲に入る祭り
 */
function filterFestivalsInCountdownWindow(festivals, today) {
  const today0 = startOfLocalDay(today);
  return festivals.filter(f => {
    const event = dateFromYmd(f.date);
    const event0 = startOfLocalDay(event);
    const windowStart0 = startOfLocalDay(addCalendarMonths(event, -6));
    return today0 >= windowStart0 && today0 <= event0;
  });
}

function sortFestivalsByDateAsc(list) {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function getDeliveryMode() {
  return (process.env.LINE_NOTIFY_DELIVERY || 'flex').toLowerCase();
}

function isDryRun() {
  return process.env.LINE_NOTIFY_DRY_RUN === '1';
}

function formatDateJaShortWithDow(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}

function resolveCountdownTargetDate(today) {
  const thisYear = today.getFullYear();
  const candidate = new Date(thisYear, 9, 17); // 10月17日（0-based month）
  if (startOfLocalDay(today) <= startOfLocalDay(candidate)) {
    return candidate;
  }
  return new Date(thisYear + 1, 9, 17);
}

function countdownImageTemplateVars(today) {
  const target = resolveCountdownTargetDate(today);
  const daysRaw = calendarDaysUntil(today, target);
  const days = Math.min(99, Math.max(0, daysRaw));
  const sendDate = formatDateJaShortWithDow(today);
  return {
    days: String(days),
    sendDate,
    sendDateEncoded: encodeURIComponent(sendDate),
  };
}

function expandImageUrlTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(days|sendDate|sendDateEncoded)\}/g, (_, key) => {
    return vars[key] || '';
  });
}

/** @returns {boolean} true なら呼び出し元は return する */
function finishDryRunIfNeeded(targetCount, outcome, label) {
  if (!isDryRun()) return false;
  outcome.sent = false;
  outcome.detail = `[dry-run] ${label} の送信対象は ${targetCount} 件。LINE API は呼んでいません（LINE_NOTIFY_DRY_RUN=1）。`;
  console.log(outcome.detail);
  return true;
}

function optionalImageMessages(mode, today) {
  let orig = process.env.LINE_NOTIFY_IMAGE_ORIGINAL_URL || '';
  let prev = process.env.LINE_NOTIFY_IMAGE_PREVIEW_URL || orig;

  if (mode === 'countdown' && today) {
    const origTemplate = process.env.LINE_NOTIFY_COUNTDOWN_IMAGE_ORIGINAL_URL_TEMPLATE;
    if (origTemplate) {
      const vars = countdownImageTemplateVars(today);
      const prevTemplate =
        process.env.LINE_NOTIFY_COUNTDOWN_IMAGE_PREVIEW_URL_TEMPLATE ||
        origTemplate;
      orig = expandImageUrlTemplate(origTemplate, vars);
      prev = expandImageUrlTemplate(prevTemplate, vars);
    }
  }

  if (!orig) return [];
  if (!prev) prev = orig;
  return [
    {
      type: 'image',
      originalContentUrl: orig,
      previewImageUrl: prev,
    },
  ];
}

/**
 * Flex が 400 で弾かれたときだけテキストに切り替え（LINE 側仕様・検証エラー対策）
 * LINE_NOTIFY_NO_FLEX_FALLBACK=1 で無効化
 */
async function broadcastFlexWithTextFallback(imgs, flexMsg, text) {
  const noFallback = process.env.LINE_NOTIFY_NO_FLEX_FALLBACK === '1';
  try {
    await broadcast([...imgs, flexMsg]);
  } catch (err) {
    const detail = String(err && err.message ? err.message : err);
    if (!noFallback && /\b400\b/.test(detail)) {
      console.warn(
        '[notify] Flex が拒否されたためテキストで再送します（詳細は次の行）',
      );
      console.warn(detail);
      await broadcast([...imgs, { type: 'text', text }]);
      return;
    }
    throw err;
  }
}

function resolveDayDelivery(targetCount) {
  let mode = getDeliveryMode();
  if (mode === 'flex' && targetCount > CAROUSEL_MAX) {
    console.warn(
      `祭りが ${targetCount} 件ありカルーセル上限（${CAROUSEL_MAX}件）を超えるため、テキストで送信します`,
    );
    mode = 'text';
  }
  return mode;
}

function uniqueSampleDates(festivals, limit = 12) {
  return [...new Set(festivals.map(f => f.date))].slice(0, limit);
}

function appendJobSummary(outcome, mode, now) {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (!p) return;
  const lines = ['## 祭り告知 LINE 通知', ''];
  lines.push(
    `- モード: \`${mode}\` ・ 照合に使った「今日」の日付: \`${toDateStr(now)}\``,
  );
  lines.push(`- TZ: \`${process.env.TZ || '(未設定・UTCのまま)'}\``);
  lines.push('');
  if (outcome.sent) {
    lines.push('✅ **LINE Broadcast で送信 API は成功しています。**');
    lines.push('');
    lines.push(
      '届かないときは、受信したいユーザーがこの**公式アカウントを友だち追加**しているか、ブロックしていないかを確認してください。',
    );
  } else {
    lines.push(
      '⚪ **LINE は送っていません**（該当データがないため。ジョブは緑の成功のままです）。',
    );
    lines.push('');
    lines.push(outcome.detail || '詳細はログを確認してください。');
    if (outcome.sampleDates && outcome.sampleDates.length) {
      lines.push('');
      lines.push(
        'スプレッドシート上の日付（例）: ' +
          outcome.sampleDates.map(d => `\`${d}\``).join(', '),
      );
    }
  }
  lines.push('');
  fs.appendFileSync(p, lines.join('\n') + '\n');
}

function printFinalBanner(outcome) {
  console.log('');
  console.log('========================================');
  if (outcome.sent) {
    console.log('結果: LINE に送信しました（Broadcast 成功）');
    console.log(
      '※ 友だち追加していないアカウントには届きません。',
    );
  } else {
    console.log('結果: LINE は送信しませんでした（該当なしなど）');
    if (outcome.detail) console.log(outcome.detail);
    if (outcome.sampleDates && outcome.sampleDates.length) {
      console.log('スプレッドシートの日付例:', outcome.sampleDates.join(', '));
    }
  }
  console.log('========================================');
}

async function notifyToday(festivals, today, outcome) {
  const todayStr = toDateStr(today);
  const targets = festivals.filter(f => f.date === todayStr);

  if (targets.length === 0) {
    outcome.sent = false;
    if (festivals.length === 0) {
      outcome.detail =
        'スプレッドシートに有効な行がありません（祭り名と日付の両方がある行だけ使います）。';
    } else {
      outcome.detail = `「今日(${todayStr})」に一致する祭りがありません。モード（today / tomorrow / countdown）と日付列を確認してください。`;
      outcome.sampleDates = uniqueSampleDates(festivals);
    }
    console.log(`今日の祭りはありません（照合日: ${todayStr}）`);
    if (outcome.sampleDates && outcome.sampleDates.length) {
      console.log('スプレッドシート内の日付例:', outcome.sampleDates.join(', '));
    }
    return;
  }

  if (finishDryRunIfNeeded(targets.length, outcome, 'today')) return;

  const imgs = optionalImageMessages('today', today);
  const mode = resolveDayDelivery(targets.length);

  if (mode === 'image') {
    if (imgs.length === 0) {
      throw new Error(
        'LINE_NOTIFY_DELIVERY=image のときは LINE_NOTIFY_IMAGE_ORIGINAL_URL（HTTPS）が必要です',
      );
    }
    await broadcast(imgs);
    outcome.sent = true;
    return;
  }

  if (mode === 'text') {
    const text = buildDayTextMessage(targets, today, 'today');
    const messages = [...imgs, { type: 'text', text }];
    await broadcast(messages);
    outcome.sent = true;
    return;
  }

  const flex = buildDayFlexMessage(targets, today, 'today');
  const text = buildDayTextMessage(targets, today, 'today');
  await broadcastFlexWithTextFallback(imgs, flex, text);
  outcome.sent = true;
}

async function notifyTomorrow(festivals, today, outcome) {
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const targets = festivals.filter(f => f.date === tomorrowStr);

  if (targets.length === 0) {
    outcome.sent = false;
    if (festivals.length === 0) {
      outcome.detail =
        'スプレッドシートに有効な行がありません（祭り名と日付の両方がある行だけ使います）。';
    } else {
      outcome.detail = `「明日(${tomorrowStr})」に一致する祭りがありません。`;
      outcome.sampleDates = uniqueSampleDates(festivals);
    }
    console.log(`明日の祭りはありません（照合日: ${tomorrowStr}）`);
    if (outcome.sampleDates && outcome.sampleDates.length) {
      console.log('スプレッドシート内の日付例:', outcome.sampleDates.join(', '));
    }
    return;
  }

  if (finishDryRunIfNeeded(targets.length, outcome, 'tomorrow')) return;

  const imgs = optionalImageMessages('tomorrow', today);
  const mode = resolveDayDelivery(targets.length);

  if (mode === 'image') {
    if (imgs.length === 0) {
      throw new Error(
        'LINE_NOTIFY_DELIVERY=image のときは LINE_NOTIFY_IMAGE_ORIGINAL_URL（HTTPS）または LINE_NOTIFY_COUNTDOWN_IMAGE_ORIGINAL_URL_TEMPLATE が必要です',
      );
    }
    await broadcast(imgs);
    outcome.sent = true;
    return;
  }

  if (mode === 'text') {
    const text = buildDayTextMessage(targets, tomorrow, 'tomorrow');
    await broadcast([...imgs, { type: 'text', text }]);
    outcome.sent = true;
    return;
  }

  const flex = buildDayFlexMessage(targets, tomorrow, 'tomorrow');
  const text = buildDayTextMessage(targets, tomorrow, 'tomorrow');
  await broadcastFlexWithTextFallback(imgs, flex, text);
  outcome.sent = true;
}

async function notifyCountdown(festivals, today, outcome) {
  const mode = getDeliveryMode();
  const targets = sortFestivalsByDateAsc(
    filterFestivalsInCountdownWindow(festivals, today),
  );

  if (targets.length === 0) {
    outcome.sent = false;
    if (festivals.length === 0) {
      outcome.detail =
        'スプレッドシートに有効な行がありません（祭り名と日付の両方がある行だけ使います）。';
    } else {
      outcome.detail =
        '「開催の約半年前〜当日」の告知ウィンドウに入る祭りがありません（countdown モード）。';
      outcome.sampleDates = uniqueSampleDates(festivals);
    }
    console.log('カウントダウン告知の対象となる祭りはありません');
    if (outcome.sampleDates && outcome.sampleDates.length) {
      console.log('スプレッドシート内の日付例:', outcome.sampleDates.join(', '));
    }
    return;
  }

  if (finishDryRunIfNeeded(targets.length, outcome, 'countdown')) return;

  const imgs = optionalImageMessages('countdown', today);

  if (mode === 'image') {
    if (imgs.length === 0) {
      throw new Error(
        'LINE_NOTIFY_DELIVERY=image のときは LINE_NOTIFY_IMAGE_ORIGINAL_URL（HTTPS）が必要です',
      );
    }
    await broadcast(imgs);
    outcome.sent = true;
    return;
  }

  if (mode === 'text') {
    const text = buildCountdownText(targets, today);
    await broadcast([...imgs, { type: 'text', text }]);
    outcome.sent = true;
    return;
  }

  const flex = buildCountdownFlex(targets, today);
  const text = buildCountdownText(targets, today);
  if (mode === 'flex' && imgs.length === 0) {
    console.log(
      '[countdown] 画像は付きません（LINE_NOTIFY_IMAGE_ORIGINAL_URL 系が空です）。flex のみ送ります。',
    );
  } else if (imgs.length) {
    console.log(`[countdown] 画像メッセージ ${imgs.length} 件のあと、flex を送ります。`);
  }
  await broadcastFlexWithTextFallback(imgs, flex, text);
  outcome.sent = true;
}

async function main() {
  const mode = process.argv[2] || 'today';
  const now = new Date();

  console.log(`実行モード: ${mode}  現在時刻: ${now.toISOString()}`);
  console.log(`通知形式: ${getDeliveryMode()}`);
  if (isDryRun()) {
    console.log('LINE_NOTIFY_DRY_RUN=1 … LINE API は呼びません（スプレッドシート検証用）');
  }

  const festivals = await fetchFestivals();
  console.log(`祭り情報を ${festivals.length} 件取得しました`);

  const outcome = { sent: false, detail: '', sampleDates: [] };

  if (mode === 'today') {
    await notifyToday(festivals, now, outcome);
  } else if (mode === 'tomorrow') {
    await notifyTomorrow(festivals, now, outcome);
  } else if (mode === 'countdown') {
    await notifyCountdown(festivals, now, outcome);
  } else {
    console.error(`不明なモード: ${mode}  (today / tomorrow / countdown)`);
    process.exit(1);
  }

  appendJobSummary(outcome, mode, now);
  printFinalBanner(outcome);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

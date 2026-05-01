/**
 * 祭り告知メインスクリプト
 *
 * 使い方:
 *   node scripts/notify.js today     → 今日の祭りを送信
 *   node scripts/notify.js tomorrow  → 明日の祭りを送信
 *   node scripts/notify.js countdown → 前夜祭の約6ヶ月前〜前夜祭当日までの祭りを一覧送信（毎朝ジョブ用）
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
 *   LINE_NOTIFY_NO_FLEX_FALLBACK    1 で Flex 失敗時のテキスト再送を止める
 *   LINE_NOTIFY_DRY_RUN             1 ならスプレッドシート取得・件数確認のみ（LINE API は呼ばない）
 *   LINE_COUNTDOWN_IMAGE_ORIGINAL_URL  countdown 先頭画像を付けるときのみ必須（例: Vercel 配信 URL）
 *   LINE_COUNTDOWN_IMAGE_PREVIEW_URL   先頭画像のプレビュー（省略時は ORIGINAL と同じ）
 *   LINE_COUNTDOWN_SKIP_LEADER_IMAGE   0 のときだけ先頭画像を付ける（省略・1 などは Flex のみ）
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
  getCountdownLeaderImageMessage,
  daysUntilEveFestival,
} = require('./festival-message');

const CAROUSEL_MAX = 12;
/** LINE カルーセル 1 メッセージあたりの最大バブル数（前夜祭 countdown の Flex 用） */
const COUNTDOWN_FLEX_CAROUSEL_MAX = 10;

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

function addCalendarMonths(date, deltaMonths) {
  const x = new Date(date.getTime());
  x.setMonth(x.getMonth() + deltaMonths);
  return x;
}

/**
 * 前夜祭日（スプレッドシート「日付」列）の約6ヶ月前（同日ベース）〜前夜祭当日まで、
 * 今日がその範囲に入る祭り
 */
function filterFestivalsInCountdownWindow(festivals, today) {
  const today0 = startOfLocalDay(today);
  return festivals.filter(f => {
    const eve = dateFromYmd(f.date);
    const eve0 = startOfLocalDay(eve);
    const windowStart0 = startOfLocalDay(addCalendarMonths(eve, -6));
    return today0 >= windowStart0 && today0 <= eve0;
  });
}

function sortFestivalsByDateAsc(list) {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function getDeliveryMode() {
  return (process.env.LINE_NOTIFY_DELIVERY || 'flex').toLowerCase();
}

/** countdown: Flex カルーセル件数（LINE 上限 10 超）を避ける */
function resolveCountdownDelivery(targetCount) {
  let mode = getDeliveryMode();
  if (mode === 'flex' && targetCount > COUNTDOWN_FLEX_CAROUSEL_MAX) {
    console.warn(
      `祭りが ${targetCount} 件あり、カルーセル上限（${COUNTDOWN_FLEX_CAROUSEL_MAX}件）を超えるため、テキストで送信します（countdown）`,
    );
    mode = 'text';
  }
  return mode;
}

function isDryRun() {
  return process.env.LINE_NOTIFY_DRY_RUN === '1';
}

/** @returns {boolean} true なら呼び出し元は return する */
function finishDryRunIfNeeded(targetCount, outcome, label) {
  if (!isDryRun()) return false;
  outcome.sent = false;
  outcome.detail = `[dry-run] ${label} の送信対象は ${targetCount} 件。LINE API は呼んでいません（LINE_NOTIFY_DRY_RUN=1）。`;
  console.log(outcome.detail);
  return true;
}

function optionalImageMessages() {
  const orig = process.env.LINE_NOTIFY_IMAGE_ORIGINAL_URL;
  if (!orig) return [];
  const prev = process.env.LINE_NOTIFY_IMAGE_PREVIEW_URL || orig;
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

  const imgs = optionalImageMessages();
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

  const imgs = optionalImageMessages();
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
  const targets = sortFestivalsByDateAsc(
    filterFestivalsInCountdownWindow(festivals, today),
  ).map(f => ({
    ...f,
    daysUntilEve: daysUntilEveFestival(f.date, today),
  }));

  if (targets.length === 0) {
    outcome.sent = false;
    if (festivals.length === 0) {
      outcome.detail =
        'スプレッドシートに有効な行がありません（祭り名と日付の両方がある行だけ使います）。';
    } else {
      outcome.detail =
        '「前夜祭の約半年前〜前夜祭当日」の告知ウィンドウに入る祭りがありません（countdown モード）。';
      outcome.sampleDates = uniqueSampleDates(festivals);
    }
    console.log('カウントダウン告知の対象となる祭りはありません');
    if (outcome.sampleDates && outcome.sampleDates.length) {
      console.log('スプレッドシート内の日付例:', outcome.sampleDates.join(', '));
    }
    return;
  }

  if (finishDryRunIfNeeded(targets.length, outcome, 'countdown')) return;

  const mode = resolveCountdownDelivery(targets.length);
  const imgs = optionalImageMessages();

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

  const text = buildCountdownText(targets, today);
  let flex;
  try {
    flex = buildCountdownFlex(targets, today);
  } catch (err) {
    console.warn(
      '[notify] カウントダウン Flex Message の生成に失敗。テキストで送信します。',
      err,
    );
    await broadcast([...imgs, { type: 'text', text }]);
    outcome.sent = true;
    return;
  }

  // 付加画像 + （任意）先頭のポスター画像 + Flex を 1 リクエストにまとめる（最大 5 件）
  const firstBatch = [...imgs];
  const includeLeaderImage =
    String(process.env.LINE_COUNTDOWN_SKIP_LEADER_IMAGE || '').trim() === '0';
  console.log(
    `[notify] countdown: 先頭ポスター画像を付ける(INCLUDE_LEADER)=${includeLeaderImage} 付加画像メッセージ数=${imgs.length}`,
  );
  if (includeLeaderImage) {
    if (firstBatch.length < 4) {
      firstBatch.push(getCountdownLeaderImageMessage());
    } else {
      throw new Error(
        '1 回の送信は最大 5 メッセージのため。LINE_NOTIFY 付加画像を減らすか先頭画像をやめる（LINE_COUNTDOWN_SKIP_LEADER_IMAGE を省略または 1）',
      );
    }
  }
  const totalInRequest = firstBatch.length + 1; // + flex
  if (totalInRequest > 5) {
    throw new Error(
      '1 回の送信は最大 5 メッセージのため。LINE_NOTIFY 付加画像を減らすか先頭画像をやめる（LINE_COUNTDOWN_SKIP_LEADER_IMAGE を省略または 1）',
    );
  }
  console.log(
    `[notify] countdown: 送信メッセージ数=${totalInRequest}（画像側=${firstBatch.length} + Flex×1）`,
  );
  await broadcastFlexWithTextFallback(firstBatch, flex, text);
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

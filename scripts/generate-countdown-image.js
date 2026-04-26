/**
 * カウントダウン画像を生成する
 *
 * - 基準日: 毎年 10/17
 * - 残り日数: 0〜99 に丸める（100日以上は 99）
 * - 日付表示: 4月26日(日) 形式
 *
 * 環境変数（任意）:
 * - COUNTDOWN_TEMPLATE_IMAGE_URL: ベース画像 URL
 * - COUNTDOWN_IMAGE_OUTPUT_PATH: 出力先（既定: assets/generated/countdown.png）
 * - COUNTDOWN_TEST_DATE: テスト用日付（YYYY-MM-DD）
 */

require('./load-env');

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DEFAULT_TEMPLATE_URL = 'https://i.ibb.co/VYYZKCRM/1.png';
const DEFAULT_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'assets',
  'generated',
  'countdown.png',
);

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((startOfLocalDay(b) - startOfLocalDay(a)) / 86400000);
}

function resolveOct17Target(today) {
  const y = today.getFullYear();
  const thisYear = new Date(y, 9, 17);
  if (startOfLocalDay(today) <= startOfLocalDay(thisYear)) {
    return thisYear;
  }
  return new Date(y + 1, 9, 17);
}

function countdownDays(today) {
  const target = resolveOct17Target(today);
  const raw = daysBetween(today, target);
  return Math.min(99, Math.max(0, raw));
}

function formatSendDateJa(today) {
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return `${today.getMonth() + 1}月${today.getDate()}日(${w[today.getDay()]})`;
}

function parseTestDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    throw new Error('COUNTDOWN_TEST_DATE は YYYY-MM-DD 形式で指定してください');
  }
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mm - 1, d);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildOverlaySvg(width, height, days, sendDate) {
  // 「日」はテンプレ上では白矩形で隠されるため、ここで同じスタイルで描く（"99日" 幅に合わせてやや小さめ）
  const label = `${days}日`;
  const digitsY = Math.round(height * 0.57);
  const dateY = Math.round(height * 0.79);
  const digitsFont = Math.round(width * 0.4);
  const dateFont = Math.round(width * 0.11);

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" overflow="visible">
  <rect x="0" y="${Math.round(height * 0.21)}" width="${width}" height="${Math.round(height * 0.47)}" fill="#ffffff"/>
  <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.63)}" width="${Math.round(width * 0.8)}" height="${Math.round(height * 0.22)}" fill="#ffffff"/>
  <rect x="${Math.round(width * 0.82)}" y="${Math.round(height * 0.52)}" width="${Math.round(width * 0.16)}" height="${Math.round(height * 0.22)}" fill="#ffffff"/>

  <text
    x="${Math.round(width * 0.5)}"
    y="${digitsY}"
    text-anchor="middle"
    fill="#ff69b4"
    stroke="#ffd966"
    stroke-width="${Math.max(1, Math.round(width * 0.004))}"
    paint-order="stroke"
    font-family="'Arial Black', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif"
    font-size="${digitsFont}"
    font-weight="900"
  >${escapeXml(label)}</text>

  <text
    x="${Math.round(width * 0.5)}"
    y="${dateY}"
    text-anchor="middle"
    fill="#111111"
    font-family="'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif"
    font-size="${dateFont}"
    font-weight="700"
  >${escapeXml(sendDate)}</text>
</svg>`.trim();
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`テンプレート画像の取得に失敗しました: ${res.status} ${res.statusText}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function main() {
  const templateUrl = process.env.COUNTDOWN_TEMPLATE_IMAGE_URL || DEFAULT_TEMPLATE_URL;
  const outputPath = process.env.COUNTDOWN_IMAGE_OUTPUT_PATH || DEFAULT_OUTPUT_PATH;
  const today = parseTestDate(process.env.COUNTDOWN_TEST_DATE) || new Date();
  const days = countdownDays(today);
  const sendDate = formatSendDateJa(today);

  const template = await fetchImageBuffer(templateUrl);
  const image = sharp(template);
  const meta = await image.metadata();
  const width = meta.width || 438;
  const height = meta.height || 606;

  const overlaySvg = buildOverlaySvg(width, height, days, sendDate);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await image
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  console.log(`生成完了: ${outputPath}`);
  console.log(`残り日数: ${days}`);
  console.log(`送信日: ${sendDate}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

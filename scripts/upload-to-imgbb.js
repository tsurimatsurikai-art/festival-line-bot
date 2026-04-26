/**
 * 画像を ImgBB にアップロードし、直リンクURLを標準出力する
 *
 * 必要な環境変数:
 *   IMGBB_API_KEY  https://api.imgbb.com/ で取得した API key
 *
 * 使い方:
 *   node scripts/upload-to-imgbb.js path/to/file.png
 */

require('./load-env');

const fs = require('fs/promises');
const path = require('path');

const IMGBB_URL = 'https://api.imgbb.com/1/upload';

function mustGetApiKey() {
  const k = (process.env.IMGBB_API_KEY || '').trim();
  if (!k) {
    throw new Error(
      'IMGBB_API_KEY が空です。ImgBBのAPI keyを .env または GitHub Secret に設定してください',
    );
  }
  return k;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>} direct link URL
 */
async function uploadPngToImgbb(filePath) {
  const key = mustGetApiKey();
  const abs = path.resolve(filePath);
  const buf = await fs.readFile(abs);
  const image = buf.toString('base64');
  const name = path.basename(abs);

  const body = new URLSearchParams();
  body.set('key', key);
  body.set('name', name);
  body.set('image', image);

  const res = await fetch(IMGBB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `ImgBB アップロード失敗: HTTP ${res.status} ${res.statusText} … ${text.slice(0, 500)}`,
    );
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`ImgBB の応答がJSONではありません: ${text.slice(0, 200)}`);
  }
  if (!json.success) {
    throw new Error(
      `ImgBB が success=false: ${(json && json.error && json.error.message) || text.slice(0, 200)}`,
    );
  }
  const url =
    (json.data && (json.data.url || json.data.display_url)) || '';
  if (!url) {
    throw new Error('ImgBB 応答に url がありません');
  }
  return String(url);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error('使い方: node scripts/upload-to-imgbb.js path/to/file.png');
  }
  const url = await uploadPngToImgbb(file);
  console.log(url);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

module.exports = { uploadPngToImgbb };

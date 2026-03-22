/**
 * ローカル実行時のみ .env ファイルを読み込む
 * GitHub Actions 上では不要（Secrets が自動で環境変数に設定される）
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
  console.log('.env を読み込みました');
}

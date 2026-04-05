/**
 * このフォルダ（モノレポ内 festival-line-bot）の内容を、
 * GitHub の「単体 festival-line-bot リポジトリ」の clone 先へコピーする。
 *
 * 使い方（Cursor のターミナルで festival-line-bot をカレントに）:
 *
 *   npm run sync-standalone -- "C:\path\to\festival-line-bot"
 *
 * 毎回パスを省略したい場合は、同じフォルダに .sync-target を作り、
 * 1 行だけ clone 先の絶対パスを書く（.sync-target は git 管理外推奨）:
 *
 *   npm run sync-standalone
 *
 * 環境変数 FESTIVAL_LINE_BOT_TARGET でも指定可。
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..');

function readTargetPath() {
  const fromArg = process.argv[2];
  if (fromArg && !fromArg.startsWith('-')) {
    return path.resolve(fromArg.trim());
  }
  const fromEnv = process.env.FESTIVAL_LINE_BOT_TARGET;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  const marker = path.join(SOURCE, '.sync-target');
  if (fs.existsSync(marker)) {
    const line = fs.readFileSync(marker, 'utf8').split('\n')[0].trim();
    if (line && !line.startsWith('#')) {
      return path.resolve(line);
    }
  }
  return null;
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('スキップ（存在しません）:', src);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  const target = readTargetPath();
  if (!target) {
    console.error(`
単体リポジトリのフォルダが指定されていません。

  npm run sync-standalone -- "C:\\\\Users\\\\あなた\\\\Documents\\\\festival-line-bot"

または festival-line-bot フォルダに .sync-target を作成し、1 行で絶対パスを書いてください。
または環境変数 FESTIVAL_LINE_BOT_TARGET を設定してください。
`);
    process.exit(1);
  }

  if (!fs.existsSync(target)) {
    console.error('コピー先がありません:', target);
    console.error('先に git clone で単体リポジトリを取得してください。');
    process.exit(1);
  }

  const monorepoRoot = path.resolve(SOURCE, '..');
  const workflowSrc = path.join(monorepoRoot, '.github', 'workflows', 'festival-notify.yml');

  console.log('同期元:', SOURCE);
  console.log('同期先:', target);

  const scriptsSrc = path.join(SOURCE, 'scripts');
  const scriptsDest = path.join(target, 'scripts');
  if (!fs.existsSync(scriptsSrc)) {
    console.error('scripts フォルダがありません:', scriptsSrc);
    process.exit(1);
  }
  rmrf(scriptsDest);
  copyDir(scriptsSrc, scriptsDest);
  console.log('  scripts/ をコピーしました');

  for (const f of ['package.json', '.env.example', 'README.md']) {
    copyFile(path.join(SOURCE, f), path.join(target, f));
    console.log(`  ${f} をコピーしました`);
  }

  if (fs.existsSync(workflowSrc)) {
    const wfDest = path.join(target, '.github', 'workflows', 'festival-notify.yml');
    copyFile(workflowSrc, wfDest);
    console.log('  .github/workflows/festival-notify.yml をコピーしました');
  } else {
    console.warn(
      '  警告: モノレポの workflow が見つかりません:',
      workflowSrc,
      '\n  手動で festival-notify.yml をコピーしてください。',
    );
  }

  console.log('');
  console.log('完了。次を実行して GitHub に push してください:');
  console.log(`  cd "${target}"`);
  console.log('  git add -A && git status');
  console.log('  git commit -m "Sync festival-line-bot from monorepo" && git push');
}

main();

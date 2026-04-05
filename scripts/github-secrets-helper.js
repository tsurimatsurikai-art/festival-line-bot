/**
 * CI 用シークレット設定ページを開く補助（GitHub Actions / GitLab CI など）
 *
 * 使い方（festival-line-bot フォルダで）:
 *   npm run github-secrets
 *
 * ブラウザを開きたくない場合:
 *   NO_OPEN=1 npm run github-secrets
 *   （PowerShell: $env:NO_OPEN='1'; npm run github-secrets）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @returns {{ host: string, projectPath: string } | null}
 * projectPath は owner/repo や group/sub/repo（スラッシュ区切り）
 */
function parseGitRemote(remoteUrl) {
  const raw = (remoteUrl || '').trim().replace(/\.git$/i, '');

  const ssh = raw.match(/^git@([^:]+):(.+)$/i);
  if (ssh) {
    const host = ssh[1].trim();
    const projectPath = ssh[2].replace(/\.git$/i, '').replace(/^\/+/, '');
    if (!projectPath.includes('/')) return null;
    return { host, projectPath };
  }

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const projectPath = parts.join('/');
    return { host, projectPath };
  } catch {
    return null;
  }
}

function isLikelyGithubHost(host) {
  const h = (host || '').toLowerCase();
  return h === 'github.com' || h.endsWith('.github.com');
}

function buildSettingsUrl(host, projectPath) {
  const enc = projectPath
    .split('/')
    .map(s => encodeURIComponent(s))
    .join('/');
  if (isLikelyGithubHost(host)) {
    return `https://${host}/${enc}/settings/secrets/actions`;
  }
  // GitLab および多くの互換ホスト
  return `https://${host}/${enc}/-/settings/ci_cd`;
}

function openUrl(url) {
  if (process.env.NO_OPEN === '1') return;
  const { platform } = process;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: true, stdio: 'ignore' });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    console.log('（ブラウザを自動で開けませんでした。表示された URL を手動で開いてください）');
  }
}

function main() {
  const gitRoot = findGitRoot(path.join(__dirname, '..'));
  if (!gitRoot) {
    console.error('.git が見つかりません。Git リポジトリの中で実行してください。');
    process.exit(1);
  }

  let remote;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: gitRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    console.error('git remote origin が設定されていません。');
    process.exit(1);
  }

  const parsed = parseGitRemote(remote);
  if (!parsed) {
    console.error(`リモート URL を解釈できません: ${remote}`);
    process.exit(1);
  }

  const { host, projectPath } = parsed;
  const settingsUrl = buildSettingsUrl(host, projectPath);
  const github = isLikelyGithubHost(host);

  console.log('');
  console.log('【重要】シークレットの登録は、あなたの Git ホスト上で権限がある人が行います。');
  console.log('　　ここから代わりに書き込むことはできません。');
  console.log('');
  console.log('設定を開く URL:', settingsUrl);
  if (!github) {
    console.log('');
    console.log('（GitHub 以外のホストのため、GitLab 互換の CI/CD 設定 URL を開きます。');
    console.log('　構成が違う場合は、プロジェクトの「CI / Variables / Secrets」案内に従ってください。）');
  }
  console.log('');

  openUrl(settingsUrl);

  if (github) {
    const fullName = projectPath;

    console.log('GitHub Actions の Repository secrets に次の名前で登録:');
    console.log('  LINE_CHANNEL_ACCESS_TOKEN');
    console.log('  GOOGLE_SHEET_ID');
    console.log('  GOOGLE_SHEET_GID');
    console.log('');
    console.log('GitHub CLI (gh) の例（各コマンド後に値を貼り付け）:');
    console.log(`  gh secret set LINE_CHANNEL_ACCESS_TOKEN --repo ${fullName}`);
    console.log(`  gh secret set GOOGLE_SHEET_ID --repo ${fullName}`);
    console.log(`  gh secret set GOOGLE_SHEET_GID --repo ${fullName}`);
    console.log('');
    console.log('※ gh が未ログインなら先に: gh auth login');
  } else {
    console.log('GitLab の場合は「CI/CD」→「Variables」などで、上記と同等の値を登録し、');
    console.log('パイプラインから環境変数として渡す設定にしてください。');
  }
  console.log('');
}

main();

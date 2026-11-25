// tsuriboon.com の仮のサイトを作る（AdSense の審査用。審査が通ったらメインのリポジトリを tsuriboon.com に切り替える）
//   node tools/build.js
// - 元のサイト（../tsuriboon）の公開ファイルを、すべて同じパスでコピーする（git で管理しているファイルだけ）。
//   HTML・CSS・JS・画像・data/・sitemap.xml・sitemap.txt など。
// - 文字のファイル（.html .xml .txt .json .js .css）の https://tsuri-boon.github.io/ は https://tsuriboon.com/ に置き換える。
//   canonical・og:url・構造化データ・サイトマップも tsuriboon.com になる。
// - ファビコンは favicon.ico・image/favicon-192.png・image/apple-touch-icon.png（このリポジトリに置いてあるもの）を使う。
// - robots.txt・ads.txt はこのスクリプトが作る。CNAME はそのまま残す。
// - 元のサイトから消えたファイルは、こちらからも消す。
// 注意：GA4・AdSense のタグは元のサイトと同じ（どちらのドメインのアクセスも同じプロパティに入る）。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'tsuriboon');
const NEW = 'https://tsuriboon.com/';
const OLD = 'https://tsuri-boon.github.io/';

// コピーしないもの（元のサイトの作業用ファイル・テスト用ページ・IndexNow のキー）
const SKIP = [/^tools\//, /^\.github\//, /^\.claude\//, /^CLAUDE\.md$/, /^README\.md$/, /^copyindex$/, /^sitemap-test\.xml$/,
  /^testindnx\.html$/, /^top-test\.html$/, /^robots\.txt$/, /^[0-9a-f]{32}\.txt$/, /^\.gitignore$/, /^\.gitattributes$/];
// このリポジトリにだけあるもの（消さない）
const OWN = new Set(['CNAME', '.nojekyll', 'favicon.ico', 'image/favicon-192.png', 'image/apple-touch-icon.png', 'robots.txt', 'ads.txt']);
const OWN_DIR = [/^tools\//, /^\.git\//, /^\.github\//];

const TEXT = /\.(html|xml|txt|json|js|css)$/i;
const ICON_TAGS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48">',
  '<link rel="icon" href="/image/favicon-192.png" type="image/png" sizes="192x192">',
  '<link rel="apple-touch-icon" href="/image/apple-touch-icon.png">',
].join('\n  ');

const convert = (rel, s) => {
  s = s.split(OLD).join(NEW);
  if (/\.html$/i.test(rel)) s = s.replace(/<link rel="icon"[^>]*>/, ICON_TAGS);
  return s;
};

// 元のサイトの公開ファイル（git で管理しているもの）
const files = execSync('git -c core.quotepath=false ls-files', { cwd: SRC, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').map(s => s.trim()).filter(Boolean).filter(f => !SKIP.some(re => re.test(f)));
const want = new Set(files);

let copied = 0, same = 0;
for (const rel of files) {
  const from = path.join(SRC, rel), to = path.join(ROOT, rel);
  if (!fs.existsSync(from)) continue; // 消したがコミット前のもの
  fs.mkdirSync(path.dirname(to), { recursive: true });
  let data;
  if (TEXT.test(rel)) data = Buffer.from(convert(rel, fs.readFileSync(from, 'utf8')), 'utf8');
  else data = fs.readFileSync(from);
  if (fs.existsSync(to) && fs.readFileSync(to).equals(data)) { same++; continue; }
  fs.writeFileSync(to, data);
  copied++;
}

// 元のサイトから消えたファイルを消す
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
let removed = 0;
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (OWN.has(rel) || OWN_DIR.some(re => re.test(rel + (rel.endsWith('/') ? '' : '')) || re.test(rel))) continue;
  if (!want.has(rel)) { fs.rmSync(f); removed++; }
}
// 空になったフォルダを消す
const prune = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory() && e.name !== '.git') prune(path.join(d, e.name));
  if (d !== ROOT && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
};
prune(ROOT);

// robots.txt・ads.txt
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${NEW}sitemap.xml\n`);
fs.writeFileSync(path.join(ROOT, 'ads.txt'), 'google.com, pub-9034047517729390, DIRECT, f08c47fec0942fa0\n');

console.log(`元のサイトのファイル ${files.length} 件（書き込み ${copied}・変更なし ${same}・削除 ${removed}）`);

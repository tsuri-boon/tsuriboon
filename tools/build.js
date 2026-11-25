// tsuriboon.com テスト用サイトを作る
//   node tools/build.js
// - 元のサイト（../tsuriboon）から、Search Console で未登録の記事だけを article/ にコピーする。
//   対象の一覧は tools/pages.txt（1行に1ファイル。例：article/xxx.html）。
// - パスは元と同じ。canonical・og:url・構造化データの URL は https://tsuriboon.com/ にする。
// - CSS・JS は元のサイト（https://tsuri-boon.github.io/）のものを読む（コピーしない）。
// - 画像（ファビコン・ロゴ・記事の画像）は Google 検索のアイコン・サムネイル用に image/ にコピーして使う。
// - コピーしていない記事・ページへのリンクは https://tsuri-boon.github.io/ のページへ向ける。
// - 「新着記事」の枠は、元のサイトの JSON を読めないので外す。
// - サイトマップ（sitemap.xml）はコピーした記事だけ。lastmod は元のサイトの sitemap.xml と同じ。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'tsuriboon');
const NEW = 'https://tsuriboon.com/';
const OLD = 'https://tsuri-boon.github.io/';

const pages = fs.readFileSync(path.join(__dirname, 'pages.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const moved = new Set(pages.map(f => path.basename(f)));

// 元のサイトの lastmod
const lastmod = {};
for (const m of fs.readFileSync(path.join(SRC, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) lastmod[m[1]] = m[2];

// ファビコン（favicon.ico・image/favicon-192.png・image/apple-touch-icon.png はリポジトリに置いてある。
// image/tsuriboon_favicon.png は元のサイトから毎回コピーする）
const ICON_TAGS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48">',
  '<link rel="icon" href="/image/favicon-192.png" type="image/png" sizes="192x192">',
  '<link rel="apple-touch-icon" href="/image/apple-touch-icon.png">',
].join('\n  ');
fs.mkdirSync(path.join(ROOT, 'image'), { recursive: true });
// ページで使っている画像（convert の中で集める）。ファビコン類はリポジトリに置いたまま消さない
const usedImages = new Set(['tsuriboon_favicon.png']);
const KEEP_IMAGES = new Set(['favicon-192.png', 'apple-touch-icon.png', 'tsuriboon_logo7.png']); // logo7 はトップページ（index.html）用

const convert = html => {
  let s = html;
  // 新着記事の枠を外す
  s = s.replace(/[ \t]*<!-- 新着記事 start -->[\s\S]*?<!-- 新着記事 end -->\r?\n?/, '');
  // コピーした記事の URL（canonical・og:url・構造化データ・本文の絶対リンク）
  s = s.replace(/https:\/\/tsuri-boon\.github\.io\/article\/([\w.-]+\.html)/g, (all, f) => moved.has(f) ? NEW + 'article/' + f : all);
  // ../ で始まる画像・CSS・JS・ページ
  s = s.replace(/((?:src|href|content)=")\.\.\//g, '$1' + OLD);
  // / で始まるリンク
  s = s.replace(/((?:src|href)=")\/(?!\/)/g, '$1' + OLD);
  // 同じフォルダの記事へのリンク
  s = s.replace(/href="([\w.-]+\.html)([?#][^"]*)?"/g, (all, f, rest = '') => moved.has(f) ? all : `href="${OLD}article/${f}${rest}"`);
  // ファビコン・ロゴは tsuriboon.com に置いたものを使う（Google 検索のサイトアイコン用）
  s = s.replace(/<link rel="icon"[^>]*>/, ICON_TAGS);
  // 画像は tsuriboon.com にコピーしたものを使う（Google 検索のサムネイル用。CSS・JS は元のサイトのまま）
  s = s.replace(/https:\/\/tsuri-boon\.github\.io\/image\/([^"'\s()?#<>]+\.(?:jpe?g|png|webp|gif|svg))/gi, (all, p) => {
    if (!fs.existsSync(path.join(SRC, 'image', p))) return all;
    usedImages.add(p);
    return NEW + 'image/' + p;
  });
  return s;
};

fs.rmSync(path.join(ROOT, 'article'), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'article'));
const missing = [];
for (const f of pages) {
  const from = path.join(SRC, f);
  if (!fs.existsSync(from)) { missing.push(f); continue; }
  fs.writeFileSync(path.join(ROOT, f), convert(fs.readFileSync(from, 'utf8')));
}

// 画像をコピーする（使わなくなった画像は消す）
let copied = 0, removed = 0;
for (const p of usedImages) {
  const from = path.join(SRC, 'image', p), to = path.join(ROOT, 'image', p);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const st = fs.statSync(from);
  if (!fs.existsSync(to) || fs.statSync(to).size !== st.size || fs.statSync(to).mtimeMs < st.mtimeMs) { fs.copyFileSync(from, to); copied++; }
}
const walkImg = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkImg(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walkImg(path.join(ROOT, 'image'))) {
  const rel = path.relative(path.join(ROOT, 'image'), f).split(path.sep).join('/');
  if (!usedImages.has(rel) && !KEEP_IMAGES.has(rel)) { fs.rmSync(f); removed++; }
}
console.log(`画像 ${usedImages.size} 枚（コピー ${copied}・削除 ${removed}）`);

// サイトマップ
const urls = pages.filter(f => !missing.includes(f)).map(f => {
  const lm = lastmod[OLD + f];
  return `  <url>\n    <loc>${NEW}${f}</loc>\n${lm ? `    <lastmod>${lm}</lastmod>\n` : ''}  </url>`;
});
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

console.log(`コピー ${pages.length - missing.length} 件／サイトマップ ${urls.length} 件`);
if (missing.length) console.log('元のサイトに無いファイル:', missing.join(' '));

// tsuriboon.com テスト用サイトを作る
//   node tools/build.js
// - 元のサイト（../tsuriboon）から、Search Console で未登録の記事だけを article/ にコピーする。
//   対象の一覧は tools/pages.txt（1行に1ファイル。例：article/xxx.html）。
// - パスは元と同じ。canonical・og:url・構造化データの URL は https://tsuriboon.com/ にする。
// - 画像・CSS・JS は元のサイト（https://tsuri-boon.github.io/）のものを読む（コピーしない）。
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

// サイトマップ
const urls = pages.filter(f => !missing.includes(f)).map(f => {
  const lm = lastmod[OLD + f];
  return `  <url>\n    <loc>${NEW}${f}</loc>\n${lm ? `    <lastmod>${lm}</lastmod>\n` : ''}  </url>`;
});
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

console.log(`コピー ${pages.length - missing.length} 件／サイトマップ ${urls.length} 件`);
if (missing.length) console.log('元のサイトに無いファイル:', missing.join(' '));

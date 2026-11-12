import { type Entry, join, readText, renamePath, sep, writeText } from './fs';

/** `book.json` に保存する本全体の設定。 */
export interface BookConfig {
  title: string;
  author: string;
  size: keyof typeof pageSizes;
  fontSize: number; // pt
  lineHeight: number;
  margin: number; // mm（天地左右共通）
}

/** 判型。幅 x 高さ（mm）。 */
export const pageSizes = {
  A4: [210, 297],
  B5: [182, 257],
  A5: [148, 210],
  B6: [128, 182],
  文庫: [105, 148],
  新書: [103, 182],
} as const;

export const defaultConfig: BookConfig = {
  title: '無題の本',
  author: '',
  size: 'A5',
  fontSize: 10,
  lineHeight: 1.8,
  margin: 18,
};

const configPath = (root: string) => join(root, 'book.json');

export async function loadConfig(root: string): Promise<BookConfig> {
  const text = await readText(configPath(root));
  if (!text) return { ...defaultConfig };
  try {
    return { ...defaultConfig, ...JSON.parse(text) };
  } catch (e) {
    throw new Error(`book.json を読み込めません: ${e}`);
  }
}

export const saveConfig = (root: string, config: BookConfig) =>
  writeText(configPath(root), JSON.stringify(config, null, 2) + '\n');

// ファイル名は「番号-表示名(.md)」の形式。番号は並び順にのみ使う。
const prefixRe = /^(\d+)[-_ ]?/;

/** ファイル名から番号と拡張子を除いた表示名。 */
export const label = (entry: Entry) =>
  entry.name.replace(/\.md$/, '').replace(prefixRe, '') || entry.name;

/** エントリの本文ファイル。章（ディレクトリ）の本文は `index.md`。 */
export const fileOf = (entry: Entry) => (entry.dir ? join(entry.path, 'index.md') : entry.path);

const safe = (title: string) => title.replace(/[\\/:*?"<>|]/g, '_').trim() || '無題';

const fileName = (num: number, title: string, dir: boolean) =>
  `${String(num).padStart(2, '0')}-${safe(title)}${dir ? '' : '.md'}`;

/** `parent` ディレクトリの末尾にページ（または章）を追加し、その本文ファイルのパスを返す。 */
export async function addEntry(parent: string, siblings: Entry[], title: string, dir: boolean, depth: number) {
  const last = Math.max(0, ...siblings.map((s) => Number(s.name.match(prefixRe)?.[1] ?? 0)));
  const path = join(parent, fileName(last + 1, title, dir));
  const file = dir ? join(path, 'index.md') : path;
  await writeText(file, `${'#'.repeat(Math.min(depth + 1, 6))} ${title}\n`);
  return file;
}

/** パスの付け替え [旧, 新]。開いているファイルの追従に使う。 */
export type Moved = [string, string][];

/** 番号を保ったまま表示名を変える。 */
export async function renameEntry(parent: string, entry: Entry, title: string): Promise<Moved> {
  const num = entry.name.match(prefixRe)?.[1];
  const to = join(parent, `${num ? num + '-' : ''}${safe(title)}${entry.dir ? '' : '.md'}`);
  if (to === entry.path) return [];
  await renamePath(entry.path, to);
  return [[entry.path, to]];
}

/** `index` 番目の要素を `delta` だけ動かし、兄弟全体を 01, 02, ... と振り直す。 */
export async function moveEntry(parent: string, siblings: Entry[], index: number, delta: number): Promise<Moved> {
  const to = index + delta;
  if (to < 0 || to >= siblings.length) return [];
  const order = [...siblings];
  [order[index], order[to]] = [order[to], order[index]];
  // 名前の衝突を避けるため、一度仮の名前を経由する。
  const temps = await Promise.all(
    order.map(async (e, i) => {
      const temp = join(parent, `.tmp-${i}-${e.name}`);
      await renamePath(e.path, temp);
      return temp;
    }),
  );
  const moved: Moved = [];
  for (const [i, e] of order.entries()) {
    const final = join(parent, fileName(i + 1, label(e), e.dir));
    await renamePath(temps[i], final);
    moved.push([e.path, final]);
  }
  return moved;
}

/** 付け替え後のパス。`path` が付け替え対象（またはその配下）でなければそのまま返す。 */
export function follow(path: string, moved: Moved) {
  for (const [from, to] of moved) {
    if (path === from || path.startsWith(from + sep)) return to + path.slice(from.length);
  }
  return path;
}

/** 本の読み順に並べた本文ファイル。`chapter` は最上位の要素の先頭（改ページ位置）を示す。 */
export function readingOrder(tree: Entry[]) {
  const files: { file: string; chapter: boolean }[] = [];
  const walk = (entries: Entry[], top: boolean) => {
    for (const e of entries) {
      files.push({ file: fileOf(e), chapter: top });
      if (e.dir) walk(e.children, false);
    }
  };
  walk(tree, true);
  return files;
}

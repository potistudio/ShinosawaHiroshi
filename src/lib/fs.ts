import { convertFileSrc, invoke } from '@tauri-apps/api/core';

/** ディレクトリは章、`.md` ファイルはページ。 */
export interface Entry {
  name: string;
  path: string;
  dir: boolean;
  children: Entry[];
}

export const listTree = (root: string) => invoke<Entry[]>('list_tree', { root });
export const readText = (path: string) => invoke<string>('read_text', { path });
export const writeText = (path: string, content: string) =>
  invoke<void>('write_text', { path, content });
export const writeBytes = (path: string, bytes: Uint8Array) =>
  invoke<void>('write_bytes', { path, bytes: Array.from(bytes) });
export const renamePath = (from: string, to: string) => invoke<void>('rename_path', { from, to });
export const trashPath = (path: string) => invoke<void>('trash_path', { path });

export const sep = navigator.userAgent.includes('Windows') ? '\\' : '/';
export const join = (...parts: string[]) => parts.join(sep);
export const dirname = (path: string) => path.slice(0, path.lastIndexOf(sep));

const external = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Markdown 内の相対 URL を `baseDir` 基準で解決し、WebView で読める URL にする。 */
export function assetUrl(baseDir: string, url: string) {
  if (!url || external.test(url)) return url;
  const parts = baseDir.split(sep);
  for (const p of decodeURI(url).split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return convertFileSrc(parts.join(sep));
}

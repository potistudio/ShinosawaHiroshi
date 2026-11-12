import { type Entry, join, readText, renamePath, sep, writeText } from "./fs";

/** Whole-book settings persisted in `book.json`. */
export interface BookConfig {
	title: string;
	author: string;
	size: keyof typeof pageSizes;
	fontSize: number; // pt
	lineHeight: number;
	margin: number; // mm, applied to all sides
}

/** Trim sizes. Width x height in mm. */
export const pageSizes = {
	A4: [210, 297],
	B5: [182, 257],
	A5: [148, 210],
	B6: [128, 182],
	Bunko: [105, 148],
	Shinsho: [103, 182],
} as const;

export const defaultConfig: BookConfig = {
	title: "Untitled Book",
	author: "",
	size: "A5",
	fontSize: 10,
	lineHeight: 1.8,
	margin: 18,
};

const configPath = (root: string) => join(root, "book.json");

export async function loadConfig(root: string): Promise<BookConfig> {
	const text = await readText(configPath(root));
	if (!text) return { ...defaultConfig };
	try {
		return { ...defaultConfig, ...(JSON.parse(text) as Partial<BookConfig>) };
	} catch (e) {
		throw new Error(`Cannot load book.json: ${e}`);
	}
}

export const saveConfig = (root: string, config: BookConfig) =>
	writeText(configPath(root), `${JSON.stringify(config, null, 2)}\n`);

// File names use `NN-DisplayName(.md)`. Numbers define order only.
const prefixRe = /^(\d+)[-_ ]?/;

/** Display name stripped of ordering number and extension. */
export const label = (entry: Entry) => entry.name.replace(/\.md$/, "").replace(prefixRe, "") || entry.name;

/** Body file for an entry. Chapters resolve to their `index.md`. */
export const fileOf = (entry: Entry) => (entry.dir ? join(entry.path, "index.md") : entry.path);

const safe = (title: string) => title.replace(/[\\/:*?"<>|]/g, "_").trim() || "Untitled";

const fileName = (num: number, title: string, dir: boolean) =>
	`${String(num).padStart(2, "0")}-${safe(title)}${dir ? "" : ".md"}`;

/** Append a page or chapter under `parent` and return its body file path. */
export async function addEntry(parent: string, siblings: Entry[], title: string, dir: boolean, depth: number) {
	const last = Math.max(0, ...siblings.map((s) => Number(s.name.match(prefixRe)?.[1] ?? 0)));
	const path = join(parent, fileName(last + 1, title, dir));
	const file = dir ? join(path, "index.md") : path;
	await writeText(file, `${"#".repeat(Math.min(depth + 1, 6))} ${title}\n`);
	return file;
}

/** Path remapping as [from, to]. Lets the open file follow renames. */
export type Moved = [string, string][];

/** Rename the display name while preserving the ordering number. */
export async function renameEntry(parent: string, entry: Entry, title: string): Promise<Moved> {
	const num = entry.name.match(prefixRe)?.[1];
	const to = join(parent, `${num ? `${num}-` : ""}${safe(title)}${entry.dir ? "" : ".md"}`);
	if (to === entry.path) return [];
	await renamePath(entry.path, to);
	return [[entry.path, to]];
}

/** Move element `index` by `delta` and renumber siblings as 01, 02, ... */
export async function moveEntry(parent: string, siblings: Entry[], index: number, delta: number): Promise<Moved> {
	const to = index + delta;
	if (to < 0 || to >= siblings.length) return [];
	const order = [...siblings];
	[order[index], order[to]] = [order[to], order[index]];
	// Rename via temporary names to avoid collisions.
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

/** Resolve `path` through the remapping. Return unchanged when outside moved subtrees. */
export function follow(path: string, moved: Moved) {
	for (const [from, to] of moved) {
		if (path === from || path.startsWith(from + sep)) return to + path.slice(from.length);
	}
	return path;
}

/** Body files in reading order. `chapter` marks top-level breaks. */
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

<script lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { onMount } from "svelte";
import { type BookConfig, follow, loadConfig, type Moved, readingOrder, saveConfig } from "./lib/book";
import Editor from "./lib/Editor.svelte";
import { type Entry, listTree, readText, sep, writeText } from "./lib/fs";
import Preview from "./lib/Preview.svelte";
import Sidebar from "./lib/Sidebar.svelte";

const LAST = "shiori:last-book";

let root = $state("");
let tree = $state<Entry[]>([]);
let config = $state<BookConfig | null>(null);
let page = $state<{ file: string; text: string } | null>(null);
let mode = $state<"edit" | "layout">("edit");

// Coalesce rapid edits into a single write. Flush 500ms after the last change.
let pending: { file: string; text: string } | null = null;
let timer: ReturnType<typeof setTimeout>;

function change(file: string, text: string) {
	pending = { file, text };
	clearTimeout(timer);
	timer = setTimeout(flush, 500);
}

async function flush() {
	clearTimeout(timer);
	const p = pending;
	pending = null;
	if (p) await writeText(p.file, p.text);
}

// Book lifecycle: open, navigate, mutate, and persist the active book.
async function openBook(dir: string) {
	await flush();
	const [entries, cfg] = await Promise.all([listTree(dir), loadConfig(dir)]);
	if (cfg.title === "Untitled Book" || cfg.title === "無題の本") cfg.title = dir.split(sep).pop() ?? cfg.title;
	root = dir;
	tree = entries;
	config = cfg;
	localStorage.setItem(LAST, dir);
	const first = readingOrder(entries)[0];
	page = null;
	if (first) await openPage(first.file);
}

async function chooseBook() {
	const dir = await open({ directory: true, title: "Choose a book folder" });
	if (typeof dir !== "string") return;
	try {
		await openBook(dir);
	} catch (e) {
		alert(`Could not open the book folder.\n${dir}\n\n${e}`);
	}
}

async function openPage(file: string) {
	await flush();
	page = { file, text: await readText(file) };
	mode = "edit";
}

async function act(op: () => Promise<Moved | string | undefined>) {
	await flush();
	try {
		const result = await op();
		tree = await listTree(root);
		if (typeof result === "string") await openPage(result);
		else if (page && result) page = { ...page, file: follow(page.file, result) };
		if (page && !readingOrder(tree).some((f) => f.file === page?.file)) page = null;
	} catch (e) {
		alert(e);
		tree = await listTree(root);
	}
}

function updateConfig(next: BookConfig) {
	config = next;
	saveConfig(root, next);
}

function closeBook() {
	flush();
	localStorage.removeItem(LAST);
	root = "";
	page = null;
}

onMount(() => {
	const last = localStorage.getItem(LAST);
	if (last) openBook(last).catch(() => localStorage.removeItem(LAST));
	const unlisten = getCurrentWindow().onCloseRequested(flush);
	return () => unlisten.then((f) => f());
});
</script>

{#if !root || !config}
	<main class="welcome">
		<h1>Shiori</h1>
		<p>Turn a folder of Markdown into a book.</p>
		<button type="button" onclick={chooseBook}>Open a book folder</button>
	</main>
{:else}
	<div class="app">
		<div class="side">
			<Sidebar {root} {tree} current={page?.file ?? ""} onopen={openPage} {act} onclose={closeBook} />
		</div>
		<main class="main">
			<button
				type="button"
				class="mode"
				onclick={() => flush().then(() => (mode = mode === "edit" ? "layout" : "edit"))}
			>
				{mode === "edit" ? "Layout" : "Edit"}
			</button>
			{#if mode === "layout"}
				<Preview {tree} {config} onconfig={updateConfig} />
			{:else if page}
				{#key page.file}
					{@const file = page.file}
					<Editor {root} {file} value={page.text} onchange={(md) => change(file, md)} />
				{/key}
			{:else}
				<p class="empty">Start writing with "+ Page" on the left</p>
			{/if}
		</main>
	</div>
{/if}

<style>
.welcome {
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
}
.welcome h1 {
	font-family: var(--serif);
	font-weight: 500;
	font-size: 2.6rem;
	letter-spacing: 0.15em;
	margin: 0;
}
.welcome p {
	color: var(--muted);
	margin: 0 0 2rem;
}
.welcome button,
.mode {
	font: inherit;
	border: none;
	cursor: pointer;
	transition: background 0.15s;
}
.welcome button {
	background: var(--soft);
	color: var(--ink);
	padding: 0.7rem 1.6rem;
	border-radius: 999px;
}
.welcome button:hover {
	background: var(--line);
}
.app {
	display: grid;
	grid-template-columns: 15rem 1fr;
	height: 100%;
}
.side {
	background: var(--side);
	min-width: 0;
}
.main {
	position: relative;
	overflow-y: auto;
}
.mode {
	position: fixed;
	right: 1.25rem;
	bottom: 1.25rem;
	z-index: 5;
	background: var(--side);
	color: var(--muted);
	padding: 0.55rem 1.2rem;
	border-radius: 999px;
	font-size: 0.85rem;
	box-shadow: 0 4px 16px rgb(60 40 20 / 0.08);
}
.mode:hover {
	background: var(--soft);
	color: var(--ink);
}
.empty {
	color: var(--muted);
	text-align: center;
	margin-top: 30vh;
}
@media print {
	.app {
		display: block;
		height: auto;
	}
	.side,
	.mode {
		display: none;
	}
	.main {
		overflow: visible;
	}
}
</style>

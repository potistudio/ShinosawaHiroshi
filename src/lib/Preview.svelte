<script lang="ts">
import { Previewer } from "pagedjs";
import { onDestroy } from "svelte";
import { type BookConfig, pageSizes } from "./book";
import type { Entry } from "./fs";
import { bookCss, bookHtml } from "./layout";

interface Props {
	tree: Entry[];
	config: BookConfig;
	onconfig: (config: BookConfig) => void;
}
let { tree, config, onconfig }: Props = $props();

let pages: HTMLDivElement;
let busy = $state(true);
let previewer: Previewer | undefined;
let run = 0;

async function render(tree: Entry[], config: BookConfig) {
	const id = ++run;
	busy = true;
	try {
		const html = await bookHtml(tree, config);
		if (id !== run) return;
		previewer?.polisher.destroy();
		pages.replaceChildren();
		previewer = new Previewer();
		await previewer.preview(html, [{ "book.css": bookCss(config) }], pages);
	} finally {
		if (id === run) busy = false;
	}
}

// 設定の変更は少し待ってからまとめて組み直す。
let timer: ReturnType<typeof setTimeout>;
$effect(() => {
	const snapshot = $state.snapshot(config) as BookConfig;
	const entries = tree;
	clearTimeout(timer);
	timer = setTimeout(() => render(entries, snapshot), 300);
});

onDestroy(() => {
	clearTimeout(timer);
	run++;
	previewer?.polisher.destroy();
});

const set = <K extends keyof BookConfig>(key: K, value: BookConfig[K]) => onconfig({ ...config, [key]: value });
</script>

<div class="preview">
	<div class="settings">
		<input
			class="title"
			value={config.title}
			placeholder="書名"
			onchange={(e) => set("title", e.currentTarget.value)}
		>
		<input value={config.author} placeholder="著者" onchange={(e) => set("author", e.currentTarget.value)}>
		<select value={config.size} onchange={(e) => set("size", e.currentTarget.value as BookConfig["size"])}>
			{#each Object.keys(pageSizes) as size}
				<option>{size}</option>
			{/each}
		</select>
		<label
			>文字
			<input
				type="number"
				min="6"
				max="20"
				step="0.5"
				value={config.fontSize}
				onchange={(e) => set("fontSize", +e.currentTarget.value)}
			>pt</label
		>
		<label
			>行間
			<input
				type="number"
				min="1"
				max="3"
				step="0.1"
				value={config.lineHeight}
				onchange={(e) => set("lineHeight", +e.currentTarget.value)}
			></label
		>
		<label
			>余白
			<input
				type="number"
				min="5"
				max="40"
				value={config.margin}
				onchange={(e) => set("margin", +e.currentTarget.value)}
			>mm</label
		>
		<span class="spacer"></span>
		<button type="button" onclick={() => window.print()} disabled={busy}>印刷 / PDF</button>
	</div>
	<div class="pages" class:busy bind:this={pages}></div>
</div>

<style>
.preview {
	min-height: 100%;
}
.settings {
	position: sticky;
	top: 0;
	z-index: 1;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem 1rem;
	padding: 0.75rem 1.5rem;
	background: color-mix(in srgb, var(--bg) 85%, transparent);
	backdrop-filter: blur(8px);
	font-size: 0.85rem;
	color: var(--muted);
}
.settings input,
.settings select,
.settings button {
	font: inherit;
	color: var(--ink);
	background: var(--soft);
	border: none;
	border-radius: 8px;
	padding: 0.3rem 0.6rem;
	width: 7rem;
	outline: none;
}
.settings input.title {
	width: 10rem;
}
.settings input[type="number"] {
	width: 2.6rem;
	margin-right: 0.2rem;
}
.settings select,
.settings button {
	width: auto;
	cursor: pointer;
}
.settings button {
	border-radius: 999px;
	padding: 0.3rem 1rem;
}
.settings button:hover {
	background: var(--line);
}
.spacer {
	flex: 1;
}
.pages {
	padding: 1.5rem 0 4rem;
	transition: opacity 0.3s;
}
.pages.busy {
	opacity: 0.4;
}
.pages :global(.pagedjs_pages) {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 1.5rem;
}
.pages :global(.pagedjs_page) {
	background: #fff;
	border-radius: 2px;
	box-shadow:
		0 1px 2px rgb(60 40 20 / 0.06),
		0 8px 24px rgb(60 40 20 / 0.08);
}
@media print {
	.settings {
		display: none;
	}
	.pages {
		padding: 0;
	}
	.pages :global(.pagedjs_page) {
		box-shadow: none;
		border-radius: 0;
	}
}
</style>

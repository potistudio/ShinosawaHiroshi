<script lang="ts">
import { ask } from "@tauri-apps/plugin-dialog";
import { addEntry, fileOf, label, type Moved, moveEntry, renameEntry } from "./book";
import { type Entry, trashPath } from "./fs";

interface Props {
	root: string;
	tree: Entry[];
	current: string;
	onopen: (file: string) => void;
	/** Structural mutation. The caller flushes pending writes, reloads the tree, and follows moved files. */
	act: (op: () => Promise<Moved | string | undefined>) => void;
	onclose: () => void;
}
let { root, tree, current, onopen, act, onclose }: Props = $props();

type Editing =
	| { kind: "rename"; entry: Entry; parent: string }
	| { kind: "new"; parent: string; siblings: Entry[]; dir: boolean; depth: number };
let editing = $state<Editing | null>(null);
type Menu = { x: number; y: number; entry: Entry; parent: string; siblings: Entry[]; index: number; depth: number };
let menu = $state<Menu | null>(null);

/** Snapshot the menu target before closing, so the action runs against a stable reference. */
const pick = (op: (m: Menu) => void) => () => {
	const m = $state.snapshot(menu) as Menu;
	menu = null;
	op(m);
};

function commit(title: string) {
	const e = editing;
	editing = null;
	title = title.trim();
	if (!e || !title) return;
	if (e.kind === "rename") act(() => renameEntry(e.parent, e.entry, title));
	else act(() => addEntry(e.parent, e.siblings, title, e.dir, e.depth));
}

async function remove(entry: Entry) {
	const ok = await ask(`Move "${label(entry)}" to trash?`, { kind: "warning" });
	if (ok) act(() => trashPath(entry.path).then(() => undefined));
}

const focus = (el: HTMLInputElement) => {
	el.focus();
	el.select();
};

const keys = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
	if (e.key === "Enter") commit(e.currentTarget.value);
	if (e.key === "Escape") editing = null;
};
</script>

<svelte:window onclick={() => (menu = null)} />

{#snippet field(value: string)}
	<input class="field" {value} use:focus onkeydown={keys} onblur={(e) => commit(e.currentTarget.value)}>
{/snippet}

{#snippet list(entries: Entry[], parent: string, depth: number)}
	<ul>
		{#each entries as entry, index (entry.path)}
			<li>
				{#if editing?.kind === "rename" && editing.entry.path === entry.path}
					{@render field(label(entry))}
				{:else}
					<button
						type="button"
						class="item"
						class:chapter={entry.dir}
						class:active={fileOf(entry) === current}
						onclick={() => onopen(fileOf(entry))}
						oncontextmenu={(e) => {
							e.preventDefault();
							e.stopPropagation();
							menu = { x: e.clientX, y: e.clientY, entry, parent, siblings: entries, index, depth };
						}}
					>
						{label(entry)}
					</button>
				{/if}
				{#if entry.dir}
					{@render list(entry.children, entry.path, depth + 1)}
				{/if}
			</li>
		{/each}
		{#if editing?.kind === "new" && editing.parent === parent}
			<li>{@render field("")}</li>
		{/if}
	</ul>
{/snippet}

<aside>
	<nav>{@render list(tree, root, 0)}</nav>
	<div class="add">
		<button
			type="button"
			onclick={() => (editing = { kind: "new", parent: root, siblings: tree, dir: false, depth: 0 })}
		>
			+ Page
		</button>
		<button
			type="button"
			onclick={() => (editing = { kind: "new", parent: root, siblings: tree, dir: true, depth: 0 })}
		>
			+ Chapter
		</button>
		<button type="button" class="close" onclick={onclose} title="Open another book">⌂</button>
	</div>
</aside>

{#if menu}
	<div class="menu" style:left="{menu.x}px" style:top="{menu.y}px">
		{#if menu.entry.dir}
			<button
				type="button"
				onclick={pick(
					(m) =>
						(editing = {
							kind: "new",
							parent: m.entry.path,
							siblings: m.entry.children,
							dir: false,
							depth: m.depth + 1,
						}),
				)}
			>
				Add page
			</button>
		{/if}
		<button type="button" onclick={pick((m) => (editing = { kind: "rename", entry: m.entry, parent: m.parent }))}>
			Rename
		</button>
		<button
			type="button"
			disabled={menu.index === 0}
			onclick={pick((m) => act(() => moveEntry(m.parent, m.siblings, m.index, -1)))}
		>
			Move up
		</button>
		<button
			type="button"
			disabled={menu.index === menu.siblings.length - 1}
			onclick={pick((m) => act(() => moveEntry(m.parent, m.siblings, m.index, 1)))}
		>
			Move down
		</button>
		<button type="button" class="danger" onclick={pick((m) => remove(m.entry))}>Delete</button>
	</div>
{/if}

<style>
aside {
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 1.25rem 0.75rem 0.75rem;
	box-sizing: border-box;
}
nav {
	flex: 1;
	overflow-y: auto;
}
ul {
	list-style: none;
	margin: 0;
	padding: 0;
}
ul ul {
	padding-left: 0.9rem;
}
.item,
.field {
	display: block;
	width: 100%;
	box-sizing: border-box;
	padding: 0.35rem 0.7rem;
	margin: 1px 0;
	border-radius: 8px;
	font: inherit;
	font-size: 0.9rem;
	text-align: left;
	color: var(--muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.item {
	background: none;
	border: none;
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s;
}
.item:hover {
	background: var(--soft);
}
.item.chapter {
	color: var(--ink);
	font-weight: 600;
}
.item.active {
	background: var(--soft);
	color: var(--accent);
}
.field {
	border: 1px solid var(--line);
	background: var(--bg);
	color: var(--ink);
	outline: none;
}
.add {
	display: flex;
	gap: 0.25rem;
	padding-top: 0.5rem;
}
.add button,
.menu button {
	background: none;
	border: none;
	border-radius: 8px;
	font: inherit;
	font-size: 0.8rem;
	color: var(--muted);
	padding: 0.35rem 0.6rem;
	cursor: pointer;
}
.add button:hover,
.menu button:hover:not(:disabled) {
	background: var(--soft);
	color: var(--ink);
}
.add .close {
	margin-left: auto;
}
.menu {
	position: fixed;
	z-index: 10;
	display: flex;
	flex-direction: column;
	min-width: 9rem;
	padding: 0.3rem;
	background: var(--bg);
	border-radius: 12px;
	box-shadow: 0 8px 28px rgb(60 40 20 / 0.14);
}
.menu button {
	text-align: left;
	font-size: 0.85rem;
}
.menu button:disabled {
	opacity: 0.35;
	cursor: default;
}
.menu .danger:hover {
	color: #b4533c;
}
</style>

<script lang="ts">
import { ask } from "@tauri-apps/plugin-dialog";
import { ContextMenu } from "bits-ui";
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
					<ContextMenu.Root>
						<ContextMenu.Trigger onclick={() => onopen(fileOf(entry))}>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class="item"
									class:chapter={entry.dir}
									class:active={fileOf(entry) === current}
								>
									{label(entry)}
								</button>
							{/snippet}
						</ContextMenu.Trigger>
						<ContextMenu.Portal>
							<ContextMenu.Content class="menu" sideOffset={6}>
								{#if entry.dir}
									<ContextMenu.Item
										class="menu-item"
										textValue="Add page"
										onSelect={() => {
											editing = {
												kind: "new",
												parent: entry.path,
												siblings: entry.children,
												dir: false,
												depth: depth + 1,
											};
										}}
									>
										Add page
									</ContextMenu.Item>
								{/if}
								<ContextMenu.Item
									class="menu-item"
									textValue="Rename"
									onSelect={() => {
										editing = { kind: "rename", entry, parent };
									}}
								>
									Rename
								</ContextMenu.Item>
								<ContextMenu.Item
									class="menu-item"
									textValue="Move up"
									disabled={index === 0}
									onSelect={() => {
										act(() => moveEntry(parent, entries, index, -1));
									}}
								>
									Move up
								</ContextMenu.Item>
								<ContextMenu.Item
									class="menu-item"
									textValue="Move down"
									disabled={index === entries.length - 1}
									onSelect={() => {
										act(() => moveEntry(parent, entries, index, 1));
									}}
								>
									Move down
								</ContextMenu.Item>
								<ContextMenu.Item
									class="menu-item danger"
									textValue="Delete"
									onSelect={() => void remove(entry)}
								>
									Delete
								</ContextMenu.Item>
							</ContextMenu.Content>
						</ContextMenu.Portal>
					</ContextMenu.Root>
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

<style lang="scss">
@use "../styles/tokens" as t;

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

	ul {
		padding-left: 0.9rem;
	}
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

	&:hover {
		background: var(--soft);
	}

	&.chapter {
		color: var(--ink);
		font-weight: 600;
	}

	&.active {
		background: var(--soft);
		color: var(--accent);
	}
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

	.close {
		margin-left: auto;
	}
}

.add button {
	background: none;
	border: none;
	border-radius: 8px;
	font: inherit;
	font-size: 0.8rem;
	color: var(--muted);
	padding: 0.35rem 0.6rem;
	cursor: pointer;

	&:hover {
		background: var(--soft);
		color: var(--ink);
	}
}

// Bits UI ContextMenu.Content に適用する。配置は Floating UI が制御するため position は指定しない。
.menu {
	display: flex;
	flex-direction: column;
	min-width: 9rem;
	padding: 0.3rem;
	background: var(--bg);
	border-radius: 12px;
	box-shadow: t.$shadow-menu;
	outline: none;
	z-index: 10;
}

.menu-item {
	background: none;
	border: none;
	border-radius: 8px;
	font: inherit;
	font-size: 0.85rem;
	text-align: left;
	color: var(--muted);
	padding: 0.35rem 0.6rem;
	cursor: pointer;
	outline: none;
	user-select: none;

	&:hover,
	&[data-highlighted] {
		background: var(--soft);
		color: var(--ink);
	}

	&[data-disabled] {
		opacity: 0.35;
		cursor: default;
	}

	&.danger:hover,
	&.danger[data-highlighted] {
		background: var(--soft);
		color: #b4533c;
	}
}
</style>

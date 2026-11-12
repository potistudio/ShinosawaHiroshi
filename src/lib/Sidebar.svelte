<script lang="ts">
import { ask } from "@tauri-apps/plugin-dialog";
import { ContextMenu } from "bits-ui";
import { addEntry, fileOf, label, type Moved, moveEntry, renameEntry } from "./book";
import { type Entry, sep, trashPath } from "./fs";

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

// Collapsed chapter paths. Empty means all chapters stay expanded.
let collapsed = $state(new Set<string>());

const isCollapsed = (path: string) => collapsed.has(path);

function toggle(path: string) {
	const next = new Set(collapsed);
	if (next.has(path)) next.delete(path);
	else next.add(path);
	collapsed = next;
}

// Begin inline creation and keep the destination list visible.
function beginNew(parent: string, siblings: Entry[], dir: boolean, depth: number) {
	editing = { kind: "new", parent, siblings, dir, depth };
	if (parent !== root && collapsed.has(parent)) {
		collapsed = new Set([...collapsed].filter((p) => p !== parent));
	}
}

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

// Directory chain from the book root to the file open in the editor.
function ancestorDirs(entries: Entry[], target: string): string[] | null {
	for (const e of entries) {
		if (fileOf(e) === target) return e.dir ? [e.path] : [];
		if (e.dir) {
			const inner = ancestorDirs(e.children, target);
			if (inner) return [e.path, ...inner];
		}
	}
	return null;
}

// Reveal the file open in the editor when the tree reloads under a collapsed chapter.
$effect(() => {
	if (!current) return;
	const chain = ancestorDirs(tree, current);
	if (chain?.some((p) => collapsed.has(p))) {
		collapsed = new Set([...collapsed].filter((p) => !chain.includes(p)));
	}
});

// Reveal the destination list when inline creation starts inside a collapsed chapter.
$effect(() => {
	const parent = editing?.kind === "new" ? editing.parent : null;
	if (parent && parent !== root && collapsed.has(parent)) {
		collapsed = new Set([...collapsed].filter((p) => p !== parent));
	}
});

const isActive = (entry: Entry) => fileOf(entry) === current;
const isAncestorActive = (entry: Entry) => entry.dir && current.startsWith(entry.path + sep);

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

{#snippet rowButton(entry: Entry, parent: string, index: number, entries: Entry[], depth: number)}
	<ContextMenu.Root>
		<ContextMenu.Trigger onclick={() => onopen(fileOf(entry))}>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="item"
					class:chapter={entry.dir}
					class:active={isActive(entry)}
					class:ancestor={!isActive(entry) && isAncestorActive(entry)}
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
							beginNew(entry.path, entry.children, false, depth + 1);
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
				<ContextMenu.Item class="menu-item danger" textValue="Delete" onSelect={() => void remove(entry)}>
					Delete
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Portal>
	</ContextMenu.Root>
{/snippet}

{#snippet list(entries: Entry[], parent: string, depth: number)}
	<ul class="tree" class:children={depth > 0}>
		{#each entries as entry, index (entry.path)}
			<li>
				{#if editing?.kind === "rename" && editing.entry.path === entry.path}
					{@render field(label(entry))}
				{:else if entry.dir}
					<div class="row">
						<button
							type="button"
							class="toggle"
							disabled={entry.children.length === 0}
							aria-label={`${isCollapsed(entry.path) ? "Expand" : "Collapse"} ${label(entry)}`}
							aria-expanded={!isCollapsed(entry.path)}
							onclick={() => toggle(entry.path)}
						>
							<span class="glyph" aria-hidden="true">{isCollapsed(entry.path) ? "▸" : "▾"}</span>
						</button>
						{@render rowButton(entry, parent, index, entries, depth)}
					</div>
					{#if !isCollapsed(entry.path)}
						{#if entry.children.length > 0}
							{@render list(entry.children, entry.path, depth + 1)}
						{:else if !(editing?.kind === "new" && editing.parent === entry.path)}
							<p class="empty-note">No pages yet</p>
						{/if}
					{/if}
				{:else}
					<div class="row">
						<span class="spacer" aria-hidden="true"></span>
						{@render rowButton(entry, parent, index, entries, depth)}
					</div>
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
		<button type="button" onclick={() => beginNew(root, tree, false, 0)}>+ Page</button>
		<button type="button" onclick={() => beginNew(root, tree, true, 0)}>+ Chapter</button>
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
}

.children {
	margin-left: 0.65rem;
	padding-left: 0.45rem;
	border-left: 1px solid var(--line);
}

.row {
	display: flex;
	align-items: center;
	gap: 0.15rem;
}

.toggle {
	flex: none;
	width: 1.4rem;
	height: 1.4rem;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	background: none;
	border: none;
	border-radius: 6px;
	color: var(--muted);
	font: inherit;
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s;

	&:hover:not(:disabled) {
		background: var(--soft);
		color: var(--ink);
	}

	&:disabled {
		opacity: 0.25;
		cursor: default;
	}
}

.glyph {
	display: block;
	font-size: 0.7rem;
	line-height: 1;
}

.spacer {
	flex: none;
	width: 1.4rem;
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
	flex: 1;
	min-width: 0;
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

	&.ancestor {
		color: var(--ink);
	}
}

.field {
	border: 1px solid var(--line);
	background: var(--bg);
	color: var(--ink);
	outline: none;
}

.empty-note {
	margin: 0 0 0.25rem 1.55rem;
	font-size: 0.78rem;
	color: var(--muted);
}

.add {
	display: flex;
	gap: 0.25rem;
	padding-top: 0.5rem;
}

.add {
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

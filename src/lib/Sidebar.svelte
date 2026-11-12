<script lang="ts">
import { ask } from "@tauri-apps/plugin-dialog";
import { ContextMenu } from "bits-ui";
import { addEntry, fileOf, label, type Moved, moveEntry, moveEntryTo, renameEntry, reorderEntry } from "./book";
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

// Drag-and-drop reordering. HTML5 DnD only; keyboard and touch users keep Move up/down.
type DragSrc = { parent: string; index: number; path: string; dir: boolean };
let dragSrc = $state<DragSrc | null>(null);
let dropPos = $state<{ parent: string; index: number } | null>(null);
let dropInto = $state<string | null>(null);

function siblingsOf(parent: string): Entry[] {
	if (parent === root) return tree;
	const find = (entries: Entry[]): Entry[] | null => {
		for (const e of entries) {
			if (e.dir && e.path === parent) return e.children;
			if (e.dir) {
				const inner = find(e.children);
				if (inner) return inner;
			}
		}
		return null;
	};
	return find(tree) ?? [];
}

function isInvalidDest(destParent: string) {
	const src = dragSrc;
	if (!src) return true;
	if (!src.dir) return false;
	return destParent === src.path || destParent.startsWith(src.path + sep);
}

function clearDrag() {
	dragSrc = null;
	dropPos = null;
	dropInto = null;
}

function dragStart(e: DragEvent, parent: string, index: number, entry: Entry) {
	if (editing) {
		e.preventDefault();
		return;
	}
	const li = e.currentTarget as HTMLElement;
	// Ignore dragstart bubbled from a nested list item; only the drag source handles it.
	if ((e.target as HTMLElement | null)?.closest?.("li") !== li) return;
	e.stopPropagation();
	dragSrc = { parent, index, path: entry.path, dir: entry.dir };
	dropPos = null;
	dropInto = null;
	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = "move";
		try {
			e.dataTransfer.setData("text/plain", entry.path);
		} catch {
			// Clipboard access can throw in some browsers; drag state already covers the move.
		}
	}
}

function dragOverRow(e: DragEvent, parent: string, index: number, entry: Entry) {
	const src = dragSrc;
	if (!src) return;
	const li = e.currentTarget as HTMLElement;
	// Ignore dragover bubbled from a nested list item.
	if ((e.target as HTMLElement | null)?.closest?.("li") !== li) return;
	e.preventDefault();
	e.stopPropagation();
	if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	// The li of an expanded chapter contains its subtree; zones use the header row rect.
	const rowEl = li.querySelector(":scope > .row") as HTMLElement | null;
	const rect = (rowEl ?? li).getBoundingClientRect();
	if (entry.dir && e.clientY > rect.bottom + 1) {
		// Below the header row but inside the item (empty-chapter note): drop into the chapter.
		if (entry.path === src.path || isInvalidDest(entry.path) || isCollapsed(entry.path)) {
			dropPos = null;
			dropInto = null;
			return;
		}
		dropPos = null;
		dropInto = entry.path;
		return;
	}
	const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
	if (entry.dir) {
		if (ratio < 0.25) {
			if (isInvalidDest(parent)) {
				dropPos = null;
				dropInto = null;
				return;
			}
			dropInto = null;
			dropPos = { parent, index };
		} else if (ratio > 0.75) {
			if (isInvalidDest(parent)) {
				dropPos = null;
				dropInto = null;
				return;
			}
			dropInto = null;
			dropPos = { parent, index: index + 1 };
		} else {
			if (entry.path === src.path || isInvalidDest(entry.path)) {
				dropPos = null;
				dropInto = null;
				return;
			}
			dropPos = null;
			dropInto = entry.path;
			return;
		}
	} else {
		if (isInvalidDest(parent)) {
			dropPos = null;
			dropInto = null;
			return;
		}
		dropInto = null;
		dropPos = { parent, index: ratio < 0.5 ? index : index + 1 };
	}
	if (dropPos && src.parent === dropPos.parent) {
		const sibs = siblingsOf(dropPos.parent);
		const cur = sibs.findIndex((s) => s.path === src.path);
		const from = cur >= 0 ? cur : src.index;
		const to = dropPos.index > from ? dropPos.index - 1 : dropPos.index;
		if (to === from) dropPos = null;
	}
}

function dragOverEnd(e: DragEvent, parent: string, entries: Entry[]) {
	const src = dragSrc;
	if (!src) return;
	e.preventDefault();
	e.stopPropagation();
	if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	if (isInvalidDest(parent)) {
		dropPos = null;
		dropInto = null;
		return;
	}
	if (src.parent === parent) {
		const sibs = siblingsOf(parent);
		const cur = sibs.findIndex((s) => s.path === src.path);
		if (cur === sibs.length - 1 && entries.length === sibs.length) {
			dropPos = null;
			dropInto = null;
			return;
		}
	}
	dropInto = null;
	dropPos = { parent, index: entries.length };
}

function handleDrop(e: DragEvent) {
	e.preventDefault();
	e.stopPropagation();
	const src = dragSrc;
	const pos = dropPos;
	const into = dropInto;
	if (!src) {
		clearDrag();
		return;
	}
	if (into) {
		const srcSibs = [...siblingsOf(src.parent)];
		const srcIdx = srcSibs.findIndex((s) => s.path === src.path);
		const destSibs = [...siblingsOf(into)];
		if (srcIdx < 0) {
			clearDrag();
			return;
		}
		if (src.parent === into && srcIdx === destSibs.length - 1) {
			clearDrag();
			return;
		}
		const sParent = src.parent;
		const dParent = into;
		const dIdx = destSibs.length;
		clearDrag();
		if (collapsed.has(dParent)) collapsed = new Set([...collapsed].filter((p) => p !== dParent));
		act(() => moveEntryTo(sParent, srcSibs, srcIdx, dParent, destSibs, dIdx));
		return;
	}
	if (pos) {
		const srcSibs = [...siblingsOf(src.parent)];
		const srcIdx = srcSibs.findIndex((s) => s.path === src.path);
		const destSibs = [...siblingsOf(pos.parent)];
		if (srcIdx < 0) {
			clearDrag();
			return;
		}
		if (src.parent === pos.parent) {
			const to = pos.index > srcIdx ? pos.index - 1 : pos.index;
			if (to === srcIdx) {
				clearDrag();
				return;
			}
			const sParent = src.parent;
			clearDrag();
			act(() => reorderEntry(sParent, srcSibs, srcIdx, to));
		} else {
			const sParent = src.parent;
			const dParent = pos.parent;
			const dIdx = pos.index;
			clearDrag();
			if (collapsed.has(dParent)) collapsed = new Set([...collapsed].filter((p) => p !== dParent));
			act(() => moveEntryTo(sParent, srcSibs, srcIdx, dParent, destSibs, dIdx));
		}
		return;
	}
	clearDrag();
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
			<li
				draggable={editing ? "false" : "true"}
				class:dragging={dragSrc?.path === entry.path}
				class:drop-before={dropPos?.parent === parent && dropPos.index === index}
				class:drop-after={dropPos?.parent === parent && dropPos.index === index + 1}
				ondragstart={(e) => dragStart(e, parent, index, entry)}
				ondragover={(e) => dragOverRow(e, parent, index, entry)}
				ondrop={handleDrop}
				ondragend={clearDrag}
			>
				{#if editing?.kind === "rename" && editing.entry.path === entry.path}
					{@render field(label(entry))}
				{:else if entry.dir}
					<div class="row" class:drop-into={dropInto === entry.path}>
						<span class="grip" aria-hidden="true" title="Drag to reorder">⠿</span>
						<button
							type="button"
							class="toggle"
							disabled={entry.children.length === 0}
							aria-label={`${isCollapsed(entry.path) ? "Expand" : "Collapse"} ${label(entry)}`}
							aria-expanded={!isCollapsed(entry.path)}
							onclick={() => toggle(entry.path)}
							draggable="false"
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
						<span class="grip" aria-hidden="true" title="Drag to reorder">⠿</span>
						<span class="spacer" aria-hidden="true"></span>
						{@render rowButton(entry, parent, index, entries, depth)}
					</div>
				{/if}
			</li>
		{/each}
		{#if editing?.kind === "new" && editing.parent === parent}
			<li>{@render field("")}</li>
		{/if}
		{#if dragSrc && !editing}
			<li
				class="end-zone"
				class:active={dropPos?.parent === parent && dropPos.index === entries.length}
				ondragover={(e) => dragOverEnd(e, parent, entries)}
				ondrop={handleDrop}
				aria-hidden="true"
			></li>
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
	border-radius: 8px;
}

.grip {
	flex: none;
	color: var(--muted);
	opacity: 0;
	cursor: grab;
	font-size: 0.8rem;
	line-height: 1;
	padding: 0 0.1rem;
	user-select: none;
	-webkit-user-select: none;
}

li:hover > .row > .grip,
.row:focus-within > .grip,
li.dragging > .row > .grip {
	opacity: 0.6;
}

li.dragging > .row > .grip {
	cursor: grabbing;
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
	border-radius: 8px;
	padding: 0.35rem 0.6rem;
}

li {
	position: relative;
	border-radius: 8px;

	&.dragging {
		opacity: 0.45;
	}

	&.drop-before::before,
	&.drop-after::after {
		content: "";
		position: absolute;
		left: 0.4rem;
		right: 0.4rem;
		height: 2px;
		border-radius: 2px;
		background: var(--accent);
		pointer-events: none;
	}

	&.drop-before::before {
		top: -2px;
	}

	&.drop-after::after {
		bottom: -2px;
	}
}

.row.drop-into .item {
	background: var(--soft);
	color: var(--accent);
	outline: 1px dashed var(--accent);
}

.end-zone {
	list-style: none;
	height: 0.75rem;
	border-radius: 8px;

	&.active {
		background: var(--soft);
		outline: 1px dashed var(--accent);
	}
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

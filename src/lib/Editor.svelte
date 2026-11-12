<script lang="ts">
import { Crepe } from "@milkdown/crepe";
import { EditorStatus, editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import { onMount } from "svelte";
import { assetUrl, dirname, join, sep, writeBytes } from "./fs";

interface Props {
	root: string; // Base directory for image storage and path resolution
	file: string; // Active Markdown file; determines relative image paths
	value: string;
	onchange: (markdown: string) => void;
}
let { root, file, value, onchange }: Props = $props();

let host: HTMLDivElement;
let page: HTMLDivElement | null = null;
let crepe: Crepe | null = null;

// 余白クリックのフォーカス先を文書末尾に固定するため、末尾選択の送出後に ProseMirror へフォーカスする
function focusText(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (target.closest(".ProseMirror")) return;
	if (target.closest("a, button, input, select, textarea, img, video, audio")) return;
	const instance = crepe;
	if (instance && instance.editor.status === EditorStatus.Created) {
		instance.editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			const end = view.state.doc.content.size;
			view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1)));
			view.focus();
		});
		return;
	}
	host.querySelector<HTMLElement>(".ProseMirror")?.focus();
}

/** Store pasted images under `_images/` and return the path relative to the page. */
async function upload(image: File) {
	const name = `${Date.now()}-${image.name.replace(/[\\/:*?"<>|\s]/g, "_")}`;
	await writeBytes(join(root, "_images", name), new Uint8Array(await image.arrayBuffer()));
	const depth = dirname(file).slice(root.length).split(sep).filter(Boolean).length;
	return `${"../".repeat(depth)}_images/${name}`;
}

onMount(() => {
	const instance = new Crepe({
		root: host,
		defaultValue: value,
		features: { [Crepe.Feature.TopBar]: false, [Crepe.Feature.AI]: false },
		featureConfigs: {
			[Crepe.Feature.ImageBlock]: {
				onUpload: upload,
				proxyDomURL: (url) => assetUrl(dirname(file), url),
			},
			// Show rendered math output until focused, keeping the editing view readable.
			[Crepe.Feature.CodeMirror]: { previewOnlyByDefault: true },
			[Crepe.Feature.Placeholder]: { text: "Start writing…" },
		},
	});
	crepe = instance;
	instance.on((l) => l.markdownUpdated((_, md, prev) => md !== prev && onchange(md)));
	instance.create();
	// Tab による ProseMirror への到達は維持し、マウスクリックのみここで転送する
	const surface = page;
	surface?.addEventListener("click", focusText);
	return () => {
		surface?.removeEventListener("click", focusText);
		instance.destroy();
		crepe = null;
	};
});
</script>

<div class="page" bind:this={page}>
	<div class="editor" bind:this={host}></div>
</div>

<style lang="scss">
.page {
	min-height: 100%;
	box-sizing: border-box;
	cursor: text;
}

.editor {
	max-width: 46rem;
	margin: 0 auto;
	padding: 4rem 0 40vh;
}
</style>

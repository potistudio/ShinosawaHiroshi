<script lang="ts">
import { Crepe } from "@milkdown/crepe";
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

// 余白クリックを本文入力へ転送するため、ページ全体のクリックを ProseMirror に委譲する
function focusText(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (target.closest(".ProseMirror")) return;
	if (target.closest("a, button, input, select, textarea, img, video, audio")) return;
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
	const crepe = new Crepe({
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
	crepe.on((l) => l.markdownUpdated((_, md, prev) => md !== prev && onchange(md)));
	crepe.create();
	// Tab による ProseMirror への到達は維持し、マウスクリックのみここで転送する
	const surface = page;
	surface?.addEventListener("click", focusText);
	return () => {
		surface?.removeEventListener("click", focusText);
		crepe.destroy();
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

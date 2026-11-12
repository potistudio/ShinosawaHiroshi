<script lang="ts">
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import { onMount } from "svelte";
import { assetUrl, dirname, join, sep, writeBytes } from "./fs";

interface Props {
	root: string; // 本のルートディレクトリ
	file: string; // 編集中の Markdown ファイル
	value: string;
	onchange: (markdown: string) => void;
}
let { root, file, value, onchange }: Props = $props();

let host: HTMLDivElement;

/** 貼り付けた画像は `_images/` に保存し、ページからの相対パスを返す。 */
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
			// 数式ブロックは描画結果だけを見せ、クリックで編集に切り替える。
			[Crepe.Feature.CodeMirror]: { previewOnlyByDefault: true },
			[Crepe.Feature.Placeholder]: { text: "書きはじめる…" },
		},
	});
	crepe.on((l) => l.markdownUpdated((_, md, prev) => md !== prev && onchange(md)));
	crepe.create();
	return () => crepe.destroy();
});
</script>

<div class="editor" bind:this={host}></div>

<style>
.editor {
	max-width: 46rem;
	margin: 0 auto;
	padding: 4rem 0 40vh;
}
</style>

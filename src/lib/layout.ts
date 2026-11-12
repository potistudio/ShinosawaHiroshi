import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type BookConfig, pageSizes, readingOrder } from "./book";
import { assetUrl, dirname, type Entry, readText } from "./fs";

const markdown = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkMath)
	.use(remarkRehype)
	.use(rehypeKatex)
	.use(rehypeStringify);

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => entities[c] ?? c);

/** Combine the book into a single HTML document: cover, table of contents, then body. */
export async function bookHtml(tree: Entry[], config: BookConfig) {
	const body = document.createElement("div");
	for (const { file, chapter } of readingOrder(tree)) {
		const section = document.createElement("section");
		if (chapter) section.className = "chapter";
		section.innerHTML = String(await markdown.process(await readText(file)));
		for (const img of section.querySelectorAll("img")) {
			img.src = assetUrl(dirname(file), img.getAttribute("src") ?? "");
		}
		body.append(section);
	}

	const toc = [...body.querySelectorAll("h1, h2")].map((h, i) => {
		h.id = `h-${i}`;
		return `<li class="toc-${h.tagName.toLowerCase()}"><a href="#${h.id}">${escapeHtml(h.textContent ?? "")}</a></li>`;
	});

	return `
    <section class="cover">
      <h1 class="book-title">${escapeHtml(config.title)}</h1>
      <p class="book-author">${escapeHtml(config.author)}</p>
    </section>
    <nav class="toc"><h2 class="toc-title">Contents</h2><ol>${toc.join("")}</ol></nav>
    ${body.innerHTML}`;
}

/** Typesetting CSS passed to Paged.js. */
export function bookCss(config: BookConfig) {
	const [w, h] = pageSizes[config.size] ?? pageSizes.A5;
	return `
@page {
  size: ${w}mm ${h}mm;
  margin: ${config.margin}mm;
  @top-center { content: string(chapter); font-size: 0.75em; color: #9a9088; }
  @bottom-center { content: counter(page); font-size: 0.8em; color: #9a9088; }
}
@page front {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
.pagedjs_page {
  font-family: 'Noto Serif JP', 'Yu Mincho', 'YuMincho', 'Hiragino Mincho ProN', serif;
  font-size: ${config.fontSize}pt;
  line-height: ${config.lineHeight};
  color: #2b2622;
}
.cover, .toc { page: front; }
.cover { text-align: center; padding-top: 30%; }
.cover .book-title { font-size: 2.2em; font-weight: 600; letter-spacing: 0.1em; margin: 0 0 2em; }
.cover .book-author { font-size: 1.1em; letter-spacing: 0.2em; text-indent: 0; text-align: center; }
.toc { break-before: page; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0.25em 0; }
.toc .toc-h2 { padding-left: 1.5em; font-size: 0.95em; }
.toc a { display: flex; color: inherit; text-decoration: none; }
.toc a::after { content: target-counter(attr(href), page); margin-left: auto; padding-left: 1em; }
.chapter { break-before: page; }
.chapter h1 { string-set: chapter content(text); }
${scope(`
h1 { font-size: 1.6em; margin: 0 0 2em; font-weight: 600; letter-spacing: 0.05em; }
h2 { font-size: 1.25em; margin: 2em 0 1em; font-weight: 600; }
h3 { font-size: 1.05em; margin: 1.5em 0 0.5em; font-weight: 600; }
h1, h2, h3 { break-after: avoid; }
p { margin: 0; text-align: justify; text-indent: 1em; orphans: 2; widows: 2; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 2px solid #ddd3c8; color: #6b625a; }
pre { font-size: 0.85em; background: #f7f3ee; padding: 0.8em 1em; border-radius: 4px; white-space: pre-wrap; }
code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 0.9em; }
img { max-width: 100%; display: block; margin: 1em auto; }
table { border-collapse: collapse; margin: 1em auto; font-size: 0.9em; }
th, td { border-bottom: 1px solid #ddd3c8; padding: 0.3em 0.8em; }
ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
hr { border: none; text-align: center; margin: 1.5em 0; }
hr::after { content: '*'; color: #9a9088; }
.katex-display { margin: 1em 0; }
`)}`;
}

/** Scope body rules to paged output so they never leak into app UI. */
const scope = (css: string) =>
	css.replace(
		/([^{}]+)\{/g,
		(_, sel: string) =>
			`${sel
				.split(",")
				.map((s) => `.pagedjs_page ${s.trim()}`)
				.join(", ")} {`,
	);

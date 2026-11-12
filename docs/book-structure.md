## Book structure

```
my-book/
  book.json                 # Title, author, trim size, and other typesetting settings
  01-introduction.md        # Page
  02-first-chapter/         # Chapter (directory)
    index.md                # Body of the chapter itself
    01-small-discovery.md
  _images/                  # Storage for pasted images
```

- Ordering follows the leading number in each file name. Numbers are renumbered automatically via the sidebar's "Move up / Move down".
- The sidebar shows names without the number and `.md`.
- Files and folders starting with `.` or `_` are excluded from the book.
- Top-level elements (pages and chapters) start on a new page when typeset.

## Features

- **Edit**: WYSIWYG editing with Milkdown (Crepe). Input is saved automatically.
- **Math**: Inline `$...$` and block `$$ ... $$` expressions rendered with KaTeX.
- **Typeset**: Page splitting with Paged.js. Cover, table of contents (with page numbers), running heads, folios, and per-chapter page breaks.
  Trim size (A4 / B5 / A5 / B6 / Bunko / Shinsho), font size, line height, and margins can be changed on screen and are saved to `book.json`.
- **Output**: Print or save as PDF from the "Print / PDF" button on the layout screen.
- Deleted pages are moved to the OS trash.

## File map

| File                     | Role                                                      |
| ------------------------ | --------------------------------------------------------- |
| `src-tauri/src/lib.rs`   | File operation commands (list, read/write, rename, trash) |
| `src/lib/fs.ts`          | Rust command invocation and path handling                 |
| `src/lib/book.ts`        | Book settings, page addition, renaming, and reordering    |
| `src/lib/layout.ts`      | Markdown to book HTML and typesetting CSS                 |
| `src/lib/Editor.svelte`  | WYSIWYG editor                                            |
| `src/lib/Preview.svelte` | Typeset preview and settings                              |
| `src/lib/Sidebar.svelte` | Page tree                                                 |
| `src/App.svelte`         | Overall screen and save handling                          |

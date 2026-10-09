# Build with Claude Sonnet 5.5

# RTUI Editor

A browser-based visual editor for `.rtui` files: the recipe type UI layouts used by
**GregTech Modern (GTCEu)** and **LDLib**. Open it by serving the folder or opening `index.html`;
there is no build step and nothing is uploaded anywhere.

## What it does

- **Open or create** a `.rtui` (drag & drop, or file name -> recipe type -> editor). Gzipped files are accepted.
- **Edit visually** on an in-game-style preview rendered with the real GTCEu/LDLib textures in `textures/`:
  - click to select, shift/marquee to multi-select, drag to move, corner handle to resize, arrow keys to nudge
  - copy / paste / delete, undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y)
  - add widgets from a palette, or import widgets from other `.rtui` files
  - widget tree and property inspector (including texture pickers)
  - zoom, widget ID overlay, animated progress bars
- **Edit as text**: the left pane shows the file as SNBT (`1b` byte, `0.5f` float, `0.5d` double, `1` int, `1L` long).
  `root` is the widget tree, `resources` is the texture library. Invalid text is ignored until fixed, and the last valid version is kept.
- **Get warnings** for: file name not matching the recipe type, missing `progress` widget,
  duplicate or non-sequential slot IDs, and pre-7.0.0 widget types
  (the *Fix legacy names* button adds the `gtm_` prefix).
- **Download** a `.rtui` (uncompressed NBT). Before saving, the editor checks that the data survives a write/read
  round trip and asks for confirmation if it doesn't.

## Installing the result

Place the file at:

```
assets/<namespace>/ui/recipe_type/<name>.rtui
```

The file name must match the recipe type path (e.g. `gtceu:lathe` -> `lathe.rtui`).

## Custom textures

To preview textures from your own mod, put PNGs in `textures/<namespace>/...`,
mirroring `assets/<namespace>/textures/gui/...`.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page and styling |
| `app.js` | Loading, saving, SNBT text pane, warnings |
| `editor.js` | Visual editing: selection, drag/resize, inspector, undo/redo, palette |
| `nbt.js` | NBT binary and SNBT reader/writer |
| `textures.js`, `textures/` | Texture lookup and bundled GUI textures |
| `template.js` | Base template used for new files |

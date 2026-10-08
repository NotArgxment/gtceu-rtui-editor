# Yes this is entirely made by AI, dont expect this to work at all
**made because i dont want to use ceu editor**

RTUI Editor (personal use)
Open index.html in a browser (Chrome/Edge/Firefox). Works offline, nothing is uploaded.
- Drop an existing .rtui, or create a new one: file name -> recipe type -> editor.
- Left: readable text (SNBT: 1b = byte, 0.5f = float, 0.5d = double, 1 = int, 1L = long).
  "root" = widget tree, "resources" = texture library. Invalid text is ignored until fixed.
- Right: ingame-style preview using the real gtceu/ldlib textures in textures/. IDs toggle shows widget ids.
- Warnings: file name vs recipe type, missing "progress", duplicate/non-sequential slot ids, pre-7.0.0 widget types
  (button "Fix legacy names" adds the gtm_ prefix).
- Download .rtui writes uncompressed NBT. Place it at assets/<namespace>/ui/recipe_type/<name>.rtui
Add your own mod textures: put PNGs in textures/<namespace>/... mirroring assets/<namespace>/textures/gui/...

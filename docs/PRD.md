# Asset Showroom PRD

As of 9 Oct 2026 · Ahmad Fauzi · Status: draft for v1

Reference: *Set the Mood (sael.net/interior) Replication Knowledge Base*, 7 Oct 2026. "The reference" below means that site.

## 1. Summary

Asset Showroom is a single-page 3D room where you apply Poliigon textures to surfaces and see them under changing daylight. Poliigon sales reps use it in live demos and send prospects a link to the room they built.

It follows the mechanics of the reference (materials on surface slots, daylight, share link in the URL), with three changes:

- Textures are real Poliigon PBR assets, not code-generated ones.
- The look and copy are our own, neutral, with no Poliigon branding.
- It ships in versions. v1 is textures, light and sharing. Furniture editing, presets, the mood meter and the cinematic camera come later.

## 2. Users and use cases

| User | Use case |
| --- | --- |
| Sales rep | Opens the showroom on a laptop during a call or meeting and changes surfaces and light while talking |
| Sales rep | Copies the link after the demo and sends it to the prospect |
| Prospect | Opens the link, sees the same room, tries other textures, follows "View asset" to poliigon.com |

## 3. Goals and non-goals

**Goals**

- A rep can show how a Poliigon texture looks on a real surface, in different light, within seconds of opening the page.
- A prospect can reopen the exact room from a link, with no login.
- Switching between a free and a premium texture set is one setting and a redeploy.

**Non-goals (all versions unless changed)**

- Accounts, login, backend or database
- Texture downloads from the showroom
- Poliigon API or live catalogue search
- CMS
- Poliigon 3D models or HDRIs (textures only)
- Poliigon branding in the UI

## 4. Decisions

Settled in the grilling session on 9 Oct 2026.

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Purpose | Internal sales and demo tool |
| 2 | Poliigon assets | Textures only |
| 3 | Catalogue | 20 curated textures per set, bundled with the app |
| 4 | Scene | One cut-away flat (living room, dining corner, bedroom, study), improved each version |
| 5 | Usage | Live demos by reps, plus share links to prospects |
| 6 | Texture split | Wood 5, Stone and tiles 5, Fabric and leather 6, Wall finishes 4 |
| 7 | Asset picks | Ahmad or the content team fills in the asset IDs |
| 8 | Stack | Vite, TypeScript, plain three.js r183 |
| 9 | Branding | Neutral, no Poliigon branding |
| 10 | Versions | v1 textures and light, v2 furniture and presets, v3 mood meter and cinematic camera |
| 11 | Texture card | Name, category, real-world size, "View asset" link to poliigon.com |
| 12 | Texture quality | 2K colour, normal, packed AO/roughness/metalness; KTX2; 256 px thumbnails |
| 13 | Asset sets | Free and premium sets, switched at build time |
| 14 | Raw downloads | Local folder synced from a shared drive, gitignored; built locally |
| 15 | Hosting | Public but unlisted (noindex) on a static host such as Cloudflare Pages |
| 16 | Repo | Stays public |
| 17 | Analytics | Cookieless page views only |
| 18 | Devices | Desktop-first; phones get a reduced layout |
| 19 | Name | "Asset Showroom" is a working title |
| 20 | Builders | Ahmad with Claude Code; milestones without dates |

## 5. Scope by version

| Version | Contents |
| --- | --- |
| v1 | Textures on 9 slots (click and drag to apply), texture card, fixed furniture layout, daylight slider and 4 time presets, orbit, zoom, reset view, undo and redo, share link, save picture, help, free/premium build switch |
| v2 | Move, turn, add and remove furniture; 3 room presets (texture and time recipes); better scene detail |
| v3 | Mood meter with explanation sentence; cinematic camera |

The rest of this document specifies v1 in detail. v2 and v3 get their own PRD sections before work starts.

## 6. v1 functional requirements

### 6.1 Scene

- A cut-away flat on a plinth: living room, dining corner, bedroom, study.
- Furniture built from simple geometry (rounded boxes and similar), placed in a fixed layout. Pieces can't be moved in v1.
- No text or branding in the scene.
- Geometry UVs are in metres, so a texture's real-world size sets its repeat (`repeat = 100 / sizeCm`).

### 6.2 Surface slots

| Key | Name | Accepts | Covers |
| --- | --- | --- | --- |
| `floor` | Floor | Wood, Stone and tiles | All floors |
| `featureWall` | Feature wall | Stone and tiles, Wall finishes | Living room back wall |
| `walls` | Walls | Stone and tiles, Wall finishes | All other walls |
| `slatWall` | Slat wall | Wood | Slatted panel |
| `upholstery` | Upholstery | Fabric and leather | Sofa, armchair, chairs |
| `accents` | Accents | Fabric and leather | Cushions, pouf, throws |
| `bedding` | Bedding | Fabric and leather | Bed |
| `rugs` | Rugs | Fabric and leather | Rugs |
| `woodwork` | Woodwork | Wood, Stone and tiles | Tables, shelves, sideboard, doors |

### 6.3 Applying textures

1. Select a slot, from the slot panel or by clicking its surface in the scene.
   - The surface gets an outline.
   - Tray tabs that the slot doesn't accept dim to 30% and can't be clicked.
   - The tray jumps to the first accepted tab.
   - A "for the <slot> ×" chip shows above the tray. × clears the selection.
2. Click a swatch in the tray. The surface, the slot thumbnail and the texture card update. The change goes into undo history.
3. Or drag a swatch onto a surface. The texture spreads out from the drop point over about 0.6 s.
4. Dropping onto a surface that doesn't accept that category does nothing.
5. Hovering a surface shows a tooltip: slot name · current texture, and a hint line ("click to change").
6. Each swatch in use has a small dot.

### 6.4 Texture card

Shows the texture on the selected slot:

- Name
- Category
- Real-world size (for example "200 × 200 cm")
- "View asset" link to its poliigon.com page, opening in a new tab

### 6.5 Daylight

- A clock and a slider from 06:00 to 22:00.
- Four presets: Morning (08:00), Midday (12:00), Golden hour (18:30), Night (21:00).
- Presets tween the sun over about 2 s. The slider and `[` `]` keys set the time without a tween; `[` `]` step one hour.
- The sun moves along an arc. Light colour warms near sunrise and sunset. After sunset, lamps turn on and windows go dark.
- Time changes from presets and the slider go into undo history.

### 6.6 Camera

- Drag to orbit, scroll to zoom (eased), `R` to reset.
- Orbit and zoom have limits so the camera can't go inside walls or below the plinth.

### 6.7 Undo and redo

- Covers texture changes and time changes.
- Buttons in the toolbar, plus Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z.
- Buttons are disabled when there is nothing to undo or redo.

### 6.8 Share link and state

- Room state lives in the URL hash and is updated with `history.replaceState` on every change.
- Format is versioned and readable, keyed by slot and texture slug, for example `#v=1&floor=walnut-planks&walls=white-plaster&t=18.5`.
- "Copy link" copies the URL and shows a toast.
- Opening a link restores the room.
- If a slug isn't in the current set (for example a premium link opened on the free build), that slot uses its default and a toast says some textures weren't available.
- Malformed values are ignored and fall back to defaults. The hash is never inserted into the page as HTML.
- No local storage of room state. Reloading without a hash gives the default room.

### 6.9 Save picture

- Saves the current view as a PNG at canvas size, without the HUD.
- File name: `asset-showroom-YYYY-MM-DD.png`.

### 6.10 Help, toasts and keys

- Help modal: what the showroom is, how to apply textures, daylight, camera, keys. Opens with `?` or the toolbar button.
- Toasts appear top-centre for state changes, and say how to undo where relevant ("Interface hidden. Press / to show it.").
- Keys:

| Key | Action |
| --- | --- |
| Ctrl/Cmd+Z | Undo |
| Shift+Ctrl/Cmd+Z | Redo |
| `R` | Reset view |
| `[` `]` | Sun back / forward one hour |
| `/` | Hide or show the interface |
| `?` | Help |
| Esc | Close modal, clear selection |

### 6.11 Loading

1. Show a loader while three.js, the KTX2 transcoder, the default room's textures and all 20 thumbnails load.
2. Render the room.
3. Preload the remaining textures in the background.
4. If a texture is applied before it has loaded, its swatch shows a progress ring and the texture appears when ready.
5. If WebGL2 is not available, show a plain message instead of the room.

## 7. Texture library

### 7.1 Planned split

The same split for both sets. Suggested types are a starting point. The free set can have fewer textures in a category if the free library is short, as long as every slot has at least one texture it accepts.

| Category | Count | Suggested types |
| --- | --- | --- |
| Wood (`wood`) | 5 | Light oak planks, white oak planks, walnut, dark stained oak, herringbone parquet |
| Stone and tiles (`stone`) | 5 | Polished concrete, terrazzo, travertine, white marble, ceramic tiles |
| Fabric and leather (`fabric`) | 6 | Linen, bouclé, wool, velvet, leather, felt |
| Wall finishes (`wall`) | 4 | White plaster, lime plaster, concrete wall, wallpaper |

Slugs and Poliigon URLs: to be filled in by Ahmad or the content team.

### 7.2 Manifest

One file per set: `src/textures/free.json` and `src/textures/premium.json`.

```json
{
  "set": "premium",
  "defaults": {
    "floor": "walnut-planks",
    "featureWall": "lime-plaster",
    "walls": "white-plaster",
    "slatWall": "walnut-planks",
    "upholstery": "linen",
    "accents": "wool",
    "bedding": "linen",
    "rugs": "felt",
    "woodwork": "white-oak-planks"
  },
  "textures": [
    {
      "slug": "walnut-planks",
      "name": "Walnut Planks",
      "category": "wood",
      "poliigonUrl": "https://www.poliigon.com/texture/...",
      "sizeCm": [200, 200]
    }
  ]
}
```

### 7.3 Asset pipeline

Folder layout:

```
assets-src/              gitignored, synced from the shared drive
  free/<slug>/           raw Poliigon download
  premium/<slug>/
textures-built/          committed
  free/<slug>/color.ktx2, normal.ktx2, orm.ktx2, thumb.webp
  premium/<slug>/...
src/textures/free.json, premium.json
scripts/build-textures   reads assets-src/<set>, writes textures-built/<set>
```

Steps:

1. Download each asset at 2K, metalness workflow, into `assets-src/<set>/<slug>/`.
2. Add its entry to the set's manifest.
3. Run the build script for that set. It:
   - converts the colour map to KTX2 (ETC1S, sRGB);
   - converts the normal map to KTX2 (UASTC, linear), flipping green if the source is DirectX style;
   - packs AO (red), roughness (green) and metalness (blue) into one KTX2 map (ETC1S, linear), which matches how three.js reads these maps;
   - writes a 256 px WebP thumbnail from the colour map.
4. Commit the built files and the manifest.

The script fails with a clear message if a manifest slug has no folder, a required map is missing, or a slot has no texture it accepts.

Tooling: KTX-Software `toktx` (or `basisu`). Raw downloads never go into git.

### 7.4 Free and premium switch

- Build-time setting `VITE_ASSET_SET=free|premium`. Default is `free`, so a deploy without the setting can't publish premium files.
- Only the active set's built files are copied into `dist/textures/`.
- A post-build check fails the build if `dist/` contains files from the other set.

## 8. Technical design

| Area | Choice |
| --- | --- |
| Build | Vite, TypeScript, no UI framework |
| 3D | three.js 0.183.x |
| Post-processing | EffectComposer: GTAO, bloom, SMAA, OutputPass; ACES Filmic tone mapping |
| Lighting | Directional sun on an arc, hemisphere fill, point lights for lamps at night |
| Textures | KTX2Loader with the basis transcoder; colour maps in sRGB |
| State | URL hash (6.8), in-memory undo/redo stack |
| Hosting | Cloudflare Pages (or similar) from the GitHub repo |
| Indexing | `<meta name="robots" content="noindex">`, `X-Robots-Tag: noindex` header, `robots.txt` disallow all |
| Analytics | Cloudflare Web Analytics, page views only, no cookies |
| Fonts | One UI font and one mono font, self-hosted or from Google Fonts |

## 9. Look and layout

- Our own dark neutral HUD with one accent colour. Do not reuse the reference's colour values, fonts, wordmark or copy.
- Glass-style panels over the scene are fine as a pattern.

Desktop layout:

| Zone | Position | Contents |
| --- | --- | --- |
| Title | Top-left | "Asset Showroom" |
| Slot panel | Left | 9 slot thumbnails, then the texture card for the selected slot |
| Toolbar | Top-right | Undo, Redo, Save picture, Copy link, Help |
| Daylight | Right | Clock, 4 presets, slider |
| Tray | Bottom-centre | Tabs Wood, Stone and tiles, Fabric and leather, Wall finishes; swatch row |

Narrow screens (900 px and below): slot panel, texture card and daylight presets hide. The tray stays and scrolls sideways; the time slider moves into the tray. Orbit and zoom still work. Nothing overlaps the tray at 375 px (the reference has an overlap bug here).

Copy: plain, second person, short sentences, all our own words.

## 10. Non-functional requirements

**Performance targets** (check after the first build; change if they prove wrong)

- Usable within 5 s on office Wi-Fi
- First load under 15 MB, including three.js, the transcoder, default textures and thumbnails
- 60 fps on a recent MacBook; 30 fps on a Windows laptop with integrated graphics
- If the 30 fps target is missed, turn off GTAO first

**Browsers:** latest Chrome, Edge, Safari and Firefox on desktop. WebGL2 required.

**Accessibility**

- Every HUD control works with the keyboard and has a visible focus ring and an accessible name.
- A slot can be selected and a swatch applied with the keyboard alone.
- `prefers-reduced-motion` turns off tweens and the spread animation.

**Licensing:** premium maps on a public URL can be extracted by anyone with the link. KTX2 is not protection. The repo is public, so built premium files committed to `textures-built/premium/` can also be downloaded from GitHub in bulk. Poliigon licensing sign-off is needed before premium built files are committed or a premium build goes live.

## 11. Success measures

- Reps use it in real demos.
- Page views show prospects opening shared links.
- Short feedback chat with 2 or 3 reps after v1.

## 12. Testing

Playwright:

- Page loads and the canvas renders.
- Selecting a slot dims the right tabs; applying a swatch updates the hash.
- Opening a hash restores the room.
- An unknown slug falls back to the default and shows the toast.
- Undo and redo for texture and time changes.
- Every key in 6.10.
- Screenshot of the default room for each set.

Build:

- The texture script's validation (7.3).
- The set-isolation check (7.4).

Manual: frame rate on one MacBook and one Windows laptop with integrated graphics; a real phone.

## 13. v1 milestones

1. Repo setup: Vite + TypeScript + three.js, Cloudflare Pages deploy, noindex.
2. Texture pipeline: build script, manifests, one asset end to end. Measure its size against the 15 MB budget.
3. Scene shell: flat on plinth, fixed furniture, camera, post-processing, loader.
4. Slots: picking, outline, tooltip.
5. HUD: slot panel, tray, texture card, click and drag to apply.
6. Loading: default first, background preload, progress ring.
7. Daylight.
8. Undo and redo, URL state, share link, save picture, help, toasts, keys.
9. Narrow-screen layout, accessibility, performance pass, tests.
10. Fill in 20 assets per set; trial with reps.

## 14. Open questions

| Question | Owner |
| --- | --- |
| Licensing sign-off for premium maps on a public URL and in the public repo | Poliigon licensing |
| Final product name | Ahmad |
| The 20 asset picks per set | Ahmad or content team |
| Does the free library cover every category? | Ahmad |
| Should the repo move to a Poliigon GitHub org? | Ahmad |
| Event analytics (which textures prospects apply) for v2, after a privacy check | Ahmad |
| v3 mood meter needs per-texture lightness, warmth and softness. Compute from the colour map or enter in the manifest? | Decide before v3 |

# Asset Showroom PRD

As of 9 Oct 2026, v2 section added 17 Nov 2026 · Ahmad Fauzi · Status: v1 built, v2 draft

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
- Poliigon 3D models or HDRIs bundled with the app (v3 lets people upload their own; see 5)
- Poliigon branding in the UI

CC0 decor models from Poly Haven are allowed from v2 (decision 25).

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
| 12 | Texture quality | 2K colour and packed AO/roughness/metalness, 1K normal (changed 13 Nov 2026 to fit the 15 MB budget); KTX2; 256 px thumbnails |
| 13 | Asset sets | Free and premium sets, switched at build time |
| 14 | Raw downloads | Local folder synced from a shared drive, gitignored; built locally |
| 15 | Hosting | Public but unlisted (noindex) on a static host such as Cloudflare Pages |
| 16 | Repo | Stays public |
| 17 | Analytics | Cookieless page views only |
| 18 | Devices | Desktop-first; phones get a reduced layout |
| 19 | Name | "Asset Showroom" is a working title |
| 20 | Builders | Ahmad with Claude Code; milestones without dates |

Added on 17 Nov 2026. These change decisions 4 and 10 for v2 onwards. Section 15 has the detail.

| # | Topic | Decision |
| --- | --- | --- |
| 21 | Scene | Four separate rooms, shown one at a time, each a cut-away on its own plinth: Living room, Bedroom, Bathroom, Garden |
| 22 | Versions | v2 rooms and visual pass; v3 uploads (textures, models, HDRI); v4 furniture editing, room recipes, mood meter, cinematic camera |
| 23 | Garden | Ground category (grass, snow, soil, gravel), sky drawn by code, path lights and stars at night, snow switch with falling flakes |
| 24 | Old links | `v=1` links keep working and open in the Living room |
| 25 | Furniture | Code-built pieces for surfaces you retexture; Poly Haven CC0 models for decor (plants, rocks, shrubs, mirror, bench) |
| 26 | Look | The HUD's colours, fonts, panels and motion may change freely, as long as they stay neutral with no Poliigon branding |
| 27 | Model tooling | `@gltf-transform/cli` as a dev dependency to shrink and compress models at build time |

## 5. Scope by version

| Version | Contents |
| --- | --- |
| v1 | Textures on 9 slots (click and drag to apply), texture card, fixed furniture layout, daylight slider and 4 time presets, orbit, zoom, reset view, undo and redo, share link, save picture, help, free/premium build switch |
| v2 | Four rooms (Living room, Bedroom, Bathroom, Garden); better furniture; snow; new look for the HUD and scene |
| v3 | Uploads: textures, models (placed and moved by drag and drop) and HDRIs, saved in the browser |
| v4 | Move, turn, add and remove built-in furniture; 3 room recipes (texture and time combinations); mood meter with explanation sentence; cinematic camera |

Sections 6 to 14 specify v1. Section 15 specifies v2. v3 and v4 get their own sections before work starts.

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
   - scales the normal map to half size and converts it to KTX2 (UASTC with RDO 1.0, linear), flipping green if the source is DirectX style;
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
| v4 mood meter needs per-texture lightness, warmth and softness. Compute from the colour map or enter in the manifest? | Decide before v4 |

## 15. v2: Rooms and visual pass

Settled in the grilling session on 17 Nov 2026. Where this section differs from sections 6 to 13, this section wins for v2.

### 15.1 Why

The flat looks blocky, mostly because of the furniture. People also want to see textures in more kinds of space: a bathroom for tiles, and a garden for grass, snow and stone.

### 15.2 Goals and non-goals

**Goals**

- Four rooms you can switch between in one click.
- Furniture and scenes that look real at a glance, with no hard-edged boxes.
- A garden that shows ground textures in daylight, at night and in snow.
- First load and frame rate stay within section 10's targets for any room.

**Non-goals for v2**

- Uploads of any kind (v3).
- Moving furniture (v3 for uploaded models, v4 for built-in pieces).
- Local storage of room state. Section 6.8 still applies.
- Trees. The smallest CC0 tree found is 21 MB. Shrubs stand in for them.

### 15.3 Rooms

Each room is a cut-away on its own plinth. One room shows at a time. Each has its own home view and orbit limits, set so the camera stays outside walls and above the plinth.

| Key | Name | About | Contents |
| --- | --- | --- | --- |
| `living` | Living room | 7 × 5 m | Sofa, armchair, coffee table, sideboard, slat wall, rug, floor lamp, dining table and 4 chairs, plants |
| `bedroom` | Bedroom | 6 × 5 m | Bed with mattress, duvet and pillows, 2 nightstands with lamps, dresser, rug, desk and chair |
| `bathroom` | Bathroom | 4 × 3.5 m | Bathtub, walk-in shower with a glass screen, vanity with basin and countertop, toilet, mirror, towels on a rail, window |
| `garden` | Garden | 12 × 8 m | Lawn, stone path, wooden deck, low fence on two sides, house wall with a door and window on one side, rocks, shrubs, planter, bench or outdoor table set, path lights |

The v1 flat is retired. Its living room, dining corner, bedroom and study pieces move into the Living room and Bedroom.

### 15.4 Surfaces

| Room | Surfaces |
| --- | --- |
| Living room | Floor, Walls, Feature wall, Slat wall, Upholstery, Accents, Rugs, Woodwork |
| Bedroom | Floor, Walls, Feature wall, Bedding, Accents, Rugs, Woodwork |
| Bathroom | Floor, Walls, Shower wall, Vanity, Countertop, Towels |
| Garden | Ground, Path, Deck, Fence, Rocks, Cushions |

New surface keys and what they accept. The keys from section 6.2 keep their meaning and accept lists.

| Key | Name | Accepts |
| --- | --- | --- |
| `showerWall` | Shower wall | Stone and tiles, Wall finishes |
| `vanity` | Vanity | Wood, Stone and tiles |
| `countertop` | Countertop | Stone and tiles |
| `towels` | Towels | Fabric and leather |
| `ground` | Ground | Ground |
| `path` | Path | Stone and tiles |
| `deck` | Deck | Wood |
| `fence` | Fence | Wood, Stone and tiles |
| `rocks` | Rocks | Stone and tiles |
| `cushions` | Cushions | Fabric and leather |

### 15.5 Ground category

- New category `ground`, shown as "Ground": grass, snow, soil, gravel.
- The tray gets a fifth tab.
- The manifest gives a default texture per room and per surface. The set check (7.3) runs per room: every surface in every room needs a texture it accepts and a valid default.
- The free set has 3 textures today and none for fabric or ground. Ahmad adds free textures for fabric, grass, snow and tiles. Until then, building and testing use the fixture set, which gets plain-colour ground textures.

### 15.6 Switching rooms

- A room switcher lists the four rooms. Clicking one shows that room.
- Each room keeps its own textures while you switch, for as long as the page is open.
- Each room also keeps its own time of day and, in the Garden, its snow setting. Switching rooms shows that room's time (builder's call).
- Switching rooms is not in undo history. Each room has its own undo history, covering its textures, time and snow (builder's call).
- The share link holds the room you're in and its textures only.
- Switching takes 600 ms or less. With `prefers-reduced-motion`, it is instant.

### 15.7 Share link

- Version 2 format: `#v=2&room=garden&ground=grass-lawn&path=slate-paving&t=18.5&snow=1`.
- `room` is one of the keys in 15.3. A missing or unknown room opens the Living room.
- Surface keys that the room doesn't have are ignored.
- `snow=1` only counts in the Garden.
- A `v=1` link opens the Living room with its textures. Keys the Living room doesn't have, such as `bedding`, are ignored.
- The rest of 6.8 still applies: unknown slugs fall back with a toast, malformed values are ignored, the hash is never inserted as HTML.

### 15.8 Light, sky and snow

- The clock, slider, presets and keys from 6.5 work the same in every room.
- Indoor rooms: sunlight through the windows, lamps after sunset, windows go dark at night. Indoor reflections come from a generated room environment (three.js `RoomEnvironment`).
- Garden: a sky drawn by code (three.js `Sky`) that follows the sun and also lights the scene. Stars come out after sunset. Path lights come on at sunset. v3's HDRI upload will be able to replace the sky.
- Snow switch: shown in the daylight panel in the Garden only. It turns falling snowflakes on and off. It is in the share link and in undo. With `prefers-reduced-motion`, the flakes stay still. Snow on the ground comes from applying a snow texture to the Ground surface.

### 15.9 Furniture

- Code-built pieces for every surface you can retexture: sofa, armchair, chairs, cushions, bed, bedding, rugs, tables, shelves, sideboard, dresser, bathtub, basin, vanity, toilet, towels, deck, fence, path. They get rounded edges, separate cushions and mattresses, tapered legs and similar detail, so none of them reads as a plain box.
- Poly Haven CC0 models for decor that isn't a surface: plants, shrubs, the bathroom mirror, the garden bench or table set. Rocks are Poly Haven models too, but they are also the Rocks surface.
- The Garden's Cushions surface is code-built seat pads and cushions on the bench or table set.
- The Bedroom desk chair's seat and back are part of the Accents surface.
- Surfaces on models without metre UVs, such as rocks, use triplanar mapping, so any stone texture fits them at its real-world size.
- Candidate models, from the Poly Haven API on 17 Nov 2026 (size of the 1K glTF with textures): `potted_plant_04` 2.0 MB, `fern_02` 1.1 MB, `ornate_mirror_01` 0.7 MB, `rock_07` 2.1 MB, `rock_09` 1.9 MB, `shrub_02` 1.9 MB, `shrub_03` 1.6 MB, `planter_box_01` 2.2 MB, `painted_wooden_bench` 1.9 MB, `outdoor_table_chair_set_01` 1.2 MB. The builder picks the final set within the load budget.

### 15.10 Model pipeline

Same pattern as textures (7.3):

```
assets-src/models/<id>/      raw 1K glTF download from Poly Haven, gitignored
models-built/<id>.glb        committed
scripts/build-models         reads assets-src/models, writes models-built
```

The script uses `@gltf-transform/cli` to compress meshes (meshopt) and turn textures into KTX2. It fails with a clear message if a model listed in a room has no built file. Models are the same for the free and premium builds. Textures are scaled down to 512 px. At 1024 px `potted_plant_04` was 1.99 MB and at 512 px it is 0.63 MB, and the two look the same at the size it shows on screen. KTX2 worked, so the webp fallback is not used.

`vite.config.ts` serves `models-built/` at `/models/` in dev and copies it into `dist/models/`, the same way it handles textures.

### 15.11 Look and feel

- The HUD's colours, fonts, panels and motion can change. It stays neutral, with no Poliigon branding.
- The redesign uses the impeccable skill.
- Every v1 function keeps working, including every key in 6.10, keyboard access and visible focus rings.
- The scene gets soft shadows, environment reflections and a warmer, more natural light balance. The builder picks the techniques within the performance targets.
- On narrow screens (900 px and below) the room switcher stays visible and does not overlap the tray at 375 px.

### 15.12 Loading and performance

- The loader waits for the room in the link (or the Living room): its textures, its models and the thumbnails. It does not wait for other rooms.
- After that, the other rooms load in the background, the active room's remaining textures first.
- First load for any one room stays under 15 MB.
- The 60 and 30 fps targets in section 10 apply to every room. GTAO still turns off first if a device falls under 30 fps.

### 15.13 Testing

Playwright, with the fixture set:

- Switching rooms shows the right surfaces and updates the hash.
- A `v=1` link opens the Living room with its textures.
- A `v=2` link restores the room, its textures, the time and snow.
- Undo and redo stay within a room.
- The snow switch is in the Garden only, and is in the hash and in undo.
- One default screenshot per room (4).

Build: the per-room set check, and the model check in 15.10.

Manual: frame rate in each room on one MacBook and one Windows laptop with integrated graphics.

### 15.14 Milestones

1. Room system: room list, switcher, `v=2` link, undo per room, loading per room. The Living room rebuilt from the v1 flat.
2. Model pipeline: build one Poly Haven model end to end and measure it. The candidate garden models total about 12.7 MB before compression, so check the Garden's first load against 15 MB before picking the rest.
3. Bedroom and Bathroom.
4. Garden: ground category, sky, stars, path lights, snow.
5. Furniture detail pass.
6. HUD and motion redesign with the impeccable skill.
7. Performance pass, tests, screenshots.

### 15.15 Open questions

| Question | Owner |
| --- | --- |
| Free textures for fabric, grass, snow and tiles | Ahmad |
| Final Poly Haven picks within the 15 MB budget | Builder |

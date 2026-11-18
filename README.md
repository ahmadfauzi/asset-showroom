# Asset Showroom

A 3D showroom where you apply Poliigon textures and change the daylight. There are four rooms. See [docs/PRD.md](docs/PRD.md).

| Room | Key | Surfaces |
| --- | --- | --- |
| Living room | `living` | Floor, Walls, Feature wall, Slat wall, Upholstery, Accents, Rugs, Woodwork |
| Bedroom | `bedroom` | Floor, Walls, Feature wall, Bedding, Accents, Rugs, Woodwork |
| Bathroom | `bathroom` | Floor, Walls, Shower wall, Vanity, Countertop, Towels |
| Garden | `garden` | Ground, Path, Deck, Fence, Rocks, Cushions |

The rooms, their surfaces and their models are listed in `src/rooms.json`. Open one with `#v=2&room=<key>`.

## Commands

Needs Node 20.19 or newer.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run dev` starts the dev server at http://localhost:5173. `npm run build` checks types and writes the site to `dist/`.

## Textures

Needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.4 or newer. `toktx` must be on your PATH, or `TOKTX` must hold its full path. `npm run textures` and `npm run models` both need it. On Windows it installs to `C:\Program Files\KTX-Software\bin`, which is not added to PATH.

1. Put the raw 2K Poliigon download in `assets-src/<set>/<slug>/`. `<set>` is `free` or `premium`.
2. Add the texture to `src/textures/<set>.json`.
3. Build one texture, or the whole set:

```bash
npm run textures -- free walnut-planks
```

```bash
npm run textures -- free
```

The built files go to `textures-built/<set>/<slug>/`. Commit them with the manifest. A full set build also checks that every surface in every room has a texture it accepts and a valid default.

`npm run textures -- free` fails today with `garden/ground`. The free set has no ground texture yet. It waits for Ahmad's free grass and snow textures. Building one texture, as in the first command above, still works.

`VITE_ASSET_SET` picks the set for `npm run dev` and `npm run build`. It is `free` if not set. Only the built files of textures in that set's manifest are copied into `dist/textures/`. The build fails if one of them has no built files, or if `dist/textures/` holds anything else.

## Models

Decor models are CC0 glTF files from [Poly Haven](https://polyhaven.com/models). The ids a room uses are listed in `src/rooms.json`. The script needs KTX-Software (see Textures), because it turns the model textures into KTX2.

```
assets-src/models/<id>/<id>_1k.gltf   the raw 1K glTF download, with its .bin and textures/ folder. Gitignored.
models-built/<id>.glb                 the built model. Commit it.
```

Build one model, or every model listed in `src/rooms.json`:

```bash
npm run models -- potted_plant_04
```

```bash
npm run models
```

The script compresses the mesh with meshopt and the textures with KTX2, at 512 px. It takes a minute or two per model.

In dev, `/models/` is served from `models-built/`. `npm run build` copies the models listed in `src/rooms.json` to `dist/models/` and fails if one has no built file. A model that fails to load in the browser is skipped, and a toast says so.

## First load

The first load of a room is the sum of these files. The loader waits for the room you open and not for the other rooms. The other rooms load in the background afterwards.

- `dist/assets` and `dist/basis`
- The default textures of the room, each one counted once (`color.ktx2`, `normal.ktx2` and `orm.ktx2`)
- All thumbnails
- The room's `.glb` files

Measured on the free set, in bytes, from the files in `dist/`, `textures-built/free/` and `models-built/` (not compressed). The limit is 15 MB.

| Room | Assets and basis | Textures | Thumbnails | Models | First load |
| --- | --- | --- | --- | --- | --- |
| Living room | 1,692,504 | 5,575,049 | 17,570 | 629,320 | 7,914,443 (7.9 MB) |
| Bedroom | 1,692,504 | 5,575,049 | 17,570 | 0 | 7,285,123 (7.3 MB) |
| Bathroom | 1,692,504 | 6,407,838 | 17,570 | 377,172 | 8,495,084 (8.5 MB) |
| Garden | 1,692,504 | 4,141,149 | 17,570 | 4,066,176 | 9,917,399 (9.9 MB) |

The Garden has no ground default in the free set yet. One 2.2 MB ground texture would make it 12,117,399 bytes (12.1 MB).

In a real browser, the Bathroom link downloaded 7,665,661 bytes for these files. The 7 models of the other rooms, which load after the room is done, are not counted. That is 829,423 less than the table. The preview server sends the JavaScript, CSS and transcoder compressed, and the page loads 1 of the 7 font files. Real figures depend on the host's compression.

## Tests

The Playwright tests run the app with the `fixture` set: 10 plain-colour textures in `textures-built/fixture/`, made by `scripts/make-fixtures.mjs`. They also check the texture script and the set check.

```bash
npm test
```

The tests run on 2 workers and take about 12 minutes or more. Headless Chromium draws WebGL in software, so a busy machine can make a test time out. Run a test that timed out on its own again before you look for a bug. The tests start their own Vite server on port 5174, so keep that port free.

`tests/units.spec.ts` tests plain modules such as `src/history.ts` and `src/state.ts`. It loads them in the browser through the Vite dev server, so it needs no extra setup.

They need Chromium build 1228. If it isn't installed, run `npx playwright install chromium`. Each room has a picture, compared against `tests/showroom.spec.ts-snapshots/<room>-fixture-win32.png` for `living`, `bedroom`, `bathroom` and `garden`. The four pictures only exist for Windows. To make new ones after an intended change, run `npx playwright test --update-snapshots`.

`public/basis/` holds the KTX2 transcoder from `node_modules/three/examples/jsm/libs/basis/`. Copy it again when you update three.js.

## Credits

The decor models are CC0 (public domain) from [Poly Haven](https://polyhaven.com/). Thank you to the Poly Haven artists. The ids are in `src/rooms.json`: `potted_plant_04`, `ornate_mirror_01`, `rock_07`, `rock_09`, `shrub_02`, `shrub_03`, `planter_box_01` and `outdoor_table_chair_set_01`. Textures are from [Poliigon](https://www.poliigon.com/).

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_ASSET_SET` = `free` or `premium`

Turn on Cloudflare Web Analytics in the Cloudflare dashboard. No code change is needed.

## Search engines

The site is public but unlisted. It is blocked in three ways: a `noindex` meta tag in `index.html`, an `X-Robots-Tag: noindex` header in `public/_headers`, and `public/robots.txt`.

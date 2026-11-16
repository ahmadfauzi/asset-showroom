# Asset Showroom

A 3D room where you apply Poliigon textures and change the daylight. See [docs/PRD.md](docs/PRD.md).

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

Needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.4 or newer. If `toktx` is not on your PATH, set `TOKTX` to its full path.

1. Put the raw 2K Poliigon download in `assets-src/<set>/<slug>/`. `<set>` is `free` or `premium`.
2. Add the texture to `src/textures/<set>.json`.
3. Build one texture, or the whole set:

```bash
npm run textures -- free walnut-planks
```

```bash
npm run textures -- free
```

The built files go to `textures-built/<set>/<slug>/`. Commit them with the manifest. A full set build also checks that every slot has a texture it accepts and a valid default.

`VITE_ASSET_SET` picks the set for `npm run dev` and `npm run build`. It is `free` if not set. Only the built files of textures in that set's manifest are copied into `dist/textures/`. The build fails if one of them has no built files, or if `dist/textures/` holds anything else.

## Tests

The Playwright tests run the app with the `fixture` set: 8 plain-colour textures in `textures-built/fixture/`, made by `scripts/make-fixtures.mjs`. They also check the texture script and the set check.

```bash
npm test
```

They need Chromium build 1228. If it isn't installed, run `npx playwright install chromium`. The default room picture is compared against `tests/showroom.spec.ts-snapshots/default-room-fixture-win32.png`, which only exists for Windows. To make a new one after an intended change, run `npx playwright test --update-snapshots`.

`public/basis/` holds the KTX2 transcoder from `node_modules/three/examples/jsm/libs/basis/`. Copy it again when you update three.js.

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_ASSET_SET` = `free` or `premium`

Turn on Cloudflare Web Analytics in the Cloudflare dashboard. No code change is needed.

## Search engines

The site is public but unlisted. It is blocked in three ways: a `noindex` meta tag in `index.html`, an `X-Robots-Tag: noindex` header in `public/_headers`, and `public/robots.txt`.

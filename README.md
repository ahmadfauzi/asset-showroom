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

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`

Turn on Cloudflare Web Analytics in the Cloudflare dashboard. No code change is needed.

## Search engines

The site is public but unlisted. It is blocked in three ways: a `noindex` meta tag in `index.html`, an `X-Robots-Tag: noindex` header in `public/_headers`, and `public/robots.txt`.

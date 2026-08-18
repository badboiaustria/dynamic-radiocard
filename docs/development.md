# Development

## Workflow

The card is a single dependency-free file. There is no bundler, no
transpiling and no runtime `node_modules` — Node is only needed for the small
helper scripts.

```
src/dynamic-radiocard.js   ← development happens here (single source of truth)
        │  npm run build
        ▼
dist/dynamic-radiocard.js  ← build artifact, what users install
```

`dist/` differs from the source only by a comment banner with version, author
and license. The code itself is untouched — what runs in HA is
character-identical to `src/`.

## Commands

| Command | Effect |
|---|---|
| `npm run build` | regenerate `dist/dynamic-radiocard.js` |
| `npm run check` | syntax check, version match `package.json` ↔ `CARD_VERSION`, `dist/` up to date? |
| `npm run deploy` | build and copy to `$HA_WWW` |
| `npm run release -- 3.1.0` | set the version in both places and rebuild |
| `node scripts/build.mjs --out <path>` | build and copy to an arbitrary directory |

`npm run check` fails on purpose when `package.json` and `CARD_VERSION`
drift apart.

## Adding a language

All UI strings live in the `TRANSLATIONS` object near the top of
`src/dynamic-radiocard.js`. To add a language:

1. Copy the `en` block, rename it to the two-letter code (e.g. `fr`), and
   translate the values. `{media}`, `{d}`, `{m}` are placeholders and must
   stay.
2. `clock.days` is an array Sunday-first; `clock.date` is the date pattern.
3. That's it — `language: auto` picks the new language up automatically for
   users whose HA profile matches, and it becomes valid as an explicit
   `language:` value.

Pull requests with new languages are very welcome.

## Release

1. Make your changes in `src/dynamic-radiocard.js`.
2. `npm run release -- <new version>` — sets `package.json` and
   `CARD_VERSION`, rebuilds `dist/`.
3. Add the new version to `CHANGELOG.md`.
4. ```bash
   git add -A
   git commit -m "release: v3.1.0"
   git tag v3.1.0
   git push && git push --tags
   ```
5. The GitHub workflow validates the build and attaches
   `dist/dynamic-radiocard.js` to the release; HACS picks the release up
   automatically.

## Architecture

One file, essentially three building blocks:

**`STYLE`** — all CSS as a template string, injected into the shadow DOM.
Layout: header with clock and now-playing, below it three columns
(category · stage · player), plus the overlays for grid, filter panel and
player picker.

**`MAClient`** — WebSocket client for Music Assistant. `_discoverWSUrl()`
tries in order: known direct host → ingress URL from the HA panels → ingress
session via `supervisor/api` → ingress session via REST. Then
`_authenticate()` with the long-lived token. Requests use `send()` with a
`message_id` map of pending promises.

**`DynamicRadioCard`** — the custom element. Key areas:

| Area | Methods |
|---|---|
| Config & DOM | `setConfig`, `_buildDom`, `_applyStaticTexts` |
| i18n | `TRANSLATIONS`, `_lang`, `_t` |
| Categories | `CATEGORIES`, `_activeCategory`, `_switchCategory`, `_loadCategory` |
| Data loading | `_maWsLoadItems` (per provider, parallel), `_browseLibrary` (fallback) |
| Providers | `_loadProviderRegistry`, `_refreshProvidersForCategory`, `_extractProvidersFromItems` |
| Filter UI | `_openFilterPanel`, `_renderFilterRows`, `_applyClientFilter`, `_saveProviderState` |
| Carousel | `_renderCarousel`, `_slotTransform`, `_rotate`, `_onPointerDown/Move/End` |
| Grid | `_openGrid`, `_playFromGridIndex`, `_closeGrid` |
| Players | `_loadPlayers`, `_discoverMaPlayers`, `_openPicker`, `_volume`, `_playerSvc` |
| Playback | `_playOrPause`, `_playItem`, `_stopPlayback`, `_syncPlayerState` |

Constants at the top of the file: `CARD_VERSION`, the `STORAGE_KEY_*` keys
(with a one-time migration from the former `ha-radio-card-*` keys),
`MAX_ITEMS_PER_CATEGORY` (30 in the carousel), `MAX_ITEMS_FOR_COUNTS`
(500 per provider for counting) and `PROVIDER_META` with names and icons of
known providers.

## Conventions

- No framework, no dependencies — deliberately, so the card runs in any HA
  without a build chain.
- New config options get a default in the object in `setConfig()` and an
  entry in [configuration.md](configuration.md).
- Every user-visible string goes through `_t()` — no hard-coded UI text.
- New localStorage keys are declared as `STORAGE_KEY_*` constants and
  documented in [configuration.md](configuration.md).
- Changes to data loading always keep a fallback: MA WebSocket first,
  `browse_media` as the safety net.
- Indentation 2 spaces, LF line endings (see `.editorconfig`).

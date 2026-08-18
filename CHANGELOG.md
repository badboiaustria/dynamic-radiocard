# Changelog

All notable changes to this card. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/).

## [3.0.0] — 2026-08-18

First public release under the new name **Dynamic RadioCard**.

### Breaking changes

- Card type renamed: `custom:ha-radio-card` → `custom:dynamic-radiocard`;
  file renamed to `dynamic-radiocard.js`. Update your dashboard resource and
  card configs (see the
  [upgrade notes](README.md#upgrading-from-ha-radio-card-2x)).
- Default title is now `Dynamic RadioCard` (was `Simple Best Media Card`).
- `hide_players` no longer defaults to `"_|unnamed"` — by default no players
  are hidden. Configure the regex explicitly if you need it.

### Added

- **Internationalization**: English (default) and German built in, new
  `language` option (`auto` | `en` | `de`); `auto` follows the HA user
  profile. All UI strings, tooltips, empty states and the header clock/date
  are localized. Adding further languages only requires a new block in
  `TRANSLATIONS`.
- Automatic one-time migration of saved browser settings (player, category,
  provider filters) from the former `ha-radio-card-*` storage keys.

### Changed

- All user-facing defaults are now installation-neutral; nothing specific to
  the author's setup remains in the code.
- Console log prefix is now `[dynamic-radiocard]`.

## [2.2.5] — 2026-07-18

Last release under the former name `ha-radio-card` (not published).

- Direct WebSocket connection to Music Assistant (ingress/direct host) with
  long-lived token auth (`ma_token`, `ma_port`).
- Provider registry and per-category provider filter with filter panel,
  badge and localStorage persistence.
- Per-provider parallel library queries; grid view (`grid_mode`,
  `grid_max`); options `image_scale`, `album_sort`, `hide_players`,
  `provider_names`, `playback_controls`, `smooth_animation`,
  `favorites_only`, `debug`; transport bar with stop, track skip and volume.

## [1.x] — 2026-04/05

Initial versions: 3D cover-flow carousel for Music Assistant radio
favorites, five categories, swipe/keyboard control, player picker, clock.

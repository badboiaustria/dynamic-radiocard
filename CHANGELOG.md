# Changelog

All notable changes to this card. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/).

## [3.0.1] — 2026-08-18

Documentation release — no functional changes.

- Real screenshots in the README (cover flow and grid view).
- Three inline example configurations (minimal, living room, wall
  display/kiosk).
- Explicit note that the card runs without problems on Shelly Wall
  Displays, even the smallest models.

## [3.0.0] — 2026-08-18

First public release.

- 3D cover-flow carousel for the Music Assistant library: **Radio, Podcasts,
  Tracks, Albums, Artists**, controlled by click, swipe or keyboard.
- **Provider filter** per category with filter panel, badge and localStorage
  persistence; per-provider parallel library queries so no provider is lost
  behind a global result limit.
- **Grid view** (`grid_mode`, `grid_max`), album sorting (`album_sort`),
  cover scaling (`image_scale`), transport bar with stop, track skip and
  volume.
- Automatic **player discovery** (entity registry, state-attribute scan and
  MA WebSocket combined), player picker with `hide_players` regex.
- Direct **WebSocket connection** to Music Assistant with long-lived token
  auth (`ma_token`, `ma_port`), ingress support for HTTPS/Nabu Casa/remote
  access, and a `browse_media` fallback without a token.
- **Internationalization**: English (default) and German built in, new
  `language` option (`auto` | `en` | `de`); `auto` follows the HA user
  profile. All UI strings, tooltips, empty states and the header clock/date
  are localized. Adding further languages only requires a new block in
  `TRANSLATIONS`.
- Runs without problems on Shelly Wall Displays — even the smallest models;
  `smooth_animation: false` for the weakest hardware.

Versions 1.x–2.x were private, unpublished predecessors of this card.

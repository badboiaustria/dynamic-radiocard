# Configuration

All options are optional — the card even runs with just
`type: custom:dynamic-radiocard`, though without a token it can only use the
slower `browse_media` fallback.

## General

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"Dynamic RadioCard"` | Heading in the card header |
| `show_title` | bool | `true` | Show the header with title and now-playing line |
| `show_labels` | bool | `true` | Show the item name under the center cover |
| `language` | `auto` \| `en` \| `de` | `auto` | UI language. `auto` follows the HA user profile |
| `debug` | bool | `false` | Verbose logging in the browser console |

The clock and date in the header follow the selected language as well.

## Music Assistant connection

| Option | Type | Default | Description |
|---|---|---|---|
| `ma_token` | string | `null` | Long-lived token from the MA web UI |
| `ma_port` | number | `8095` | MA server port (add-on default) |

The card discovers the Music Assistant server on its own, in this order:

1. **Direct WebSocket** (`ws://<host>:<ma_port>/ws`) — the host is read from
   the MA integration's config entry in HA, or sniffed from the library's
   cover image URLs once known.
2. **Hassio ingress** via the registered HA panels — this is why the card
   also works over HTTPS, Nabu Casa and remote access, where a plain
   `ws://host:8095` would be blocked as mixed content.
3. An ingress session via `supervisor/api` or the REST API.
4. Fallback: `media_player/browse_media` on the first MA entity found — the
   card stays usable, but without provider filters and library counts.

Paths 1–3 need the `ma_token`; without a token only the fallback works.
`ma_port` only matters for the direct connection (path 1) and stays at the
add-on default `8095` for almost everyone.

### Security note on the token

Storage-mode dashboards (the HA default) do **not** support `!secret`, so the
token is stored in plain text in the dashboard configuration and visible to
anyone who may edit the dashboard. The token is valid for Music Assistant
only, not for Home Assistant — nevertheless:

- Create a **dedicated** token for this card instead of reusing your main
  one.
- If you suspect it leaked, revoke it in the MA web UI and create a new one.
- Check dashboard exports and screenshots before sharing them.

## Library and filters

| Option | Type | Default | Description |
|---|---|---|---|
| `favorites_only` | map | all `true` | Per category: favorites only (`true`) or whole library (`false`) |
| `album_sort` | `newest` \| `alpha` | `newest` | Album ordering in carousel and grid |
| `provider_names` | map | `{}` | Custom display names per provider instance id |

```yaml
favorites_only:
  radio: true
  podcast: true
  track: false      # whole track library instead of favorites
  album: false
  artist: false

provider_names:
  plex--36fRmfSE: Plex Audiobooks
  filesystem_local--xy12: Music NAS
```

Provider ids are shown in the card's filter panel, or in the browser console
with `debug: true`.

The carousel shows up to **30** items per category; for the counts in the
filter panel the card queries up to **500** items per provider.

## Appearance

| Option | Type | Default | Description |
|---|---|---|---|
| `image_scale` | number | `1.0` | Cover scaling. Values outside 0.4 – 3.0 are clamped to that range |
| `grid_mode` | bool | `false` | Center click opens the grid view instead of play |
| `grid_max` | number | `70` | Maximum number of tiles in the grid (minimum 1) |
| `smooth_animation` | bool | `true` | `false` disables transitions — noticeably smoother on old tablets |

## Players

| Option | Type | Default | Description |
|---|---|---|---|
| `hide_players` | regex | `null` | Players whose **display name** matches are hidden from the picker |
| `playback_controls` | bool | `true` | Show prev/next buttons; hidden automatically for radio |

### Where the players come from

The card builds its player list itself — there is no `entities:` option to
maintain. On every load it merges three sources:

1. **HA entity registry** — all `media_player.*` entities whose integration
   (platform) is `music_assistant`. This is the normal case and finds every
   player that the Music Assistant integration created in Home Assistant.
2. **State attribute scan** — every `media_player.*` entity whose attributes
   point at Music Assistant (`mass_player_id`, `app_id: music_assistant`,
   `app_name: Music Assistant`, or a `source` containing "music assistant").
   This catches players controlled by MA but registered through another
   platform, e.g. cast groups.
3. **Music Assistant WebSocket** — `players/all` from the MA server itself,
   when the direct connection is available (needs `ma_token`).

The union of the three is deduplicated, keeping the order above. Display name
and availability always come from the HA state of the entity
(`friendly_name`). If the list ends up empty — typical right after a host
reboot while MA is still starting — the card retries automatically with
increasing delays (3 s → 5 s → 8 s → 12 s → 16 s).

Only after this merge is `hide_players` applied, so a hidden player is never
"missing" for any other reason than the regex.

### `hide_players` in detail

The value is a JavaScript regular expression (not a glob), matched
**case-insensitively** against the player's display name — the
`friendly_name` of the `media_player` entity, not its entity id. An invalid
pattern logs a warning to the console and hides nothing; an empty string is
treated like `null` (nothing hidden).

```yaml
hide_players: "unnamed"          # anything containing "unnamed" (any case)
hide_players: "^(Kitchen|Bath)$" # exactly these two
hide_players: "Group"            # anything containing "Group"
hide_players: "_|unnamed"        # the old 2.x default: underscore or "unnamed"
```

## Controls

| Action | Effect |
|---|---|
| Click a side cover | rotates it to the center |
| Click the center cover | play/pause or switch — or grid view with `grid_mode: true` |
| Swipe left/right | browse; a long fast swipe skips several items |
| ← / → | browse |
| Space / Enter | play / pause |
| ▲ / ▼ (left) | switch category |
| Funnel (bottom left) | open the provider filter |
| Player chip (right) | open the player picker |
| + / − (right) | volume of the selected player |

## What is stored in the browser

The card stores in `localStorage`:

| Key | Content |
|---|---|
| `dynamic-radiocard-selected-player` | last selected player |
| `dynamic-radiocard-category` | last selected category |
| `dynamic-radiocard-providers-by-cat` | active provider filters per category |
| `dynamic-radiocard-provider-registry` | cached provider registry |

Values saved by the former card name (`ha-radio-card-*`) are migrated
automatically. Clearing browser data resets these settings to the defaults.

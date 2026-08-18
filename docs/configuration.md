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

The card discovers the server on its own: direct host first, then Hassio
ingress via the HA panels, then an ingress session via `supervisor/api` or
REST — and as a last resort `media_player/browse_media`.

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
| `image_scale` | number | `1.0` | Cover scaling, valid range 0.4 – 3.0 |
| `grid_mode` | bool | `false` | Center click opens the grid view instead of play |
| `grid_max` | number | `70` | Maximum number of tiles in the grid |
| `smooth_animation` | bool | `true` | `false` disables transitions — noticeably smoother on old tablets |

## Players

| Option | Type | Default | Description |
|---|---|---|---|
| `hide_players` | regex | `null` | Players whose **display name** matches are hidden from the picker |
| `playback_controls` | bool | `true` | Show prev/next buttons; hidden automatically for radio |

`hide_players` is a regular expression, not a glob:

```yaml
hide_players: "unnamed"          # anything containing "unnamed"
hide_players: "^(Kitchen|Bath)$" # exactly these two
hide_players: "Group"            # anything containing "Group"
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

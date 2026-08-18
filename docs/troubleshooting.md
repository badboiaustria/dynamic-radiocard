# Troubleshooting

First move for every problem: open the **browser console** (F12) and set
`debug: true` in the card config. On load the card announces itself with

```
DYNAMIC-RADIOCARD v3.0.0
```

Service-call errors show up with the prefix `[dynamic-radiocard]`.

## The card does not appear at all

- Check the resource URL: exactly `/local/dynamic-radiocard.js`, type
  **JavaScript module** (not "JavaScript file").
- Is the file really in `/config/www/`? `/local/` maps to `www/`.
- Hard-refresh the browser (Ctrl + F5); in the HA app, fully restart the app.
- Still stuck: append a cache buster, e.g.
  `/local/dynamic-radiocard.js?v=3.0.0`.

## An old version keeps loading

The version number in the console is what counts, not the file date. If
Ctrl + F5 does not help, a proxy or the app's cache is in the way — a cache
buster on the resource URL forces the reload.

## "No … found" / empty carousel

- With the default `favorites_only: true` the card shows **favorites only**.
  Mark items in the MA web UI (*Library* → ⋮ → *Add to favorites*) — or set
  `favorites_only` to `false` for that category.
- Check the provider filter: if the funnel badge shows a number, the
  selection is restricted. Open the panel and re-enable providers.
- The filter is stored per category in localStorage and survives restarts —
  even the ones you forgot about long ago.

## Music Assistant connection fails

Console message: `MA auth: no ma_token configured`.

- `ma_token` is missing or expired. Create a new one in the MA web UI under
  profile → *Long-Lived Tokens*.
- If MA runs standalone (not as add-on), adjust `ma_port` (default 8095).
- Without a working WebSocket connection the card uses the `browse_media`
  fallback: the library appears, the provider filter does not.

## No player in the picker

- Check the Music Assistant integration in HA; at least one player must be
  available (`available` ≠ `false`).
- Check `hide_players` — if you configured a pattern that matches more names
  than intended (e.g. `_` matches `Living_Room`), players silently disappear
  from the picker.

## Playback does not start

- Console shows `[dynamic-radiocard] play_media failed`: the card tries
  `music_assistant.play_media` first, then `media_player.play_media`. If both
  fail, test the player directly in the MA web UI — then the issue is not in
  the card.
- With Sonos groups the actual target may differ from the displayed player;
  select the group master in the picker.

## Rendering is choppy

- `smooth_animation: false` switches to hard transitions — much smoother on
  older wall tablets.
- Reducing `image_scale` and `grid_max` helps as well.

## Covers are missing

Cover images are served through the MA host's image proxy. Gray tiles mean
the MA host is not reachable from the browser (different VLAN, reverse proxy
without a route). Test `http://<ma-host>:8095` in the same browser.

## Nothing helps

Set `debug: true`, reload the card and capture the console output starting at
`DYNAMIC-RADIOCARD` — it shows which connection path was tried, which
providers were found and where loading fails. Please attach it to a
[GitHub issue](https://github.com/badboiaustria/dynamic-radiocard/issues).

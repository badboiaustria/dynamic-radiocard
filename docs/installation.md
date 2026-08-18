# Installation

## Requirements

- Home Assistant 2024.4 or newer.
- **Music Assistant** (add-on or standalone server) with at least one
  configured player, e.g. Sonos.
- For the direct WebSocket connection: a **long-lived token** from Music
  Assistant (web UI → profile → *Long-Lived Tokens* → create).
- At least one item in your MA library; with `favorites_only: true` (the
  default) at least one item marked as **favorite** per category.

## Option A: HACS (recommended)

1. Open HACS → three-dot menu (top right) → **Custom repositories**.
2. Repository: `https://github.com/badboiaustria/dynamic-radiocard`,
   type: **Dashboard**. Add.
3. Search for **Dynamic RadioCard** in HACS and install it.
4. Reload your browser (Ctrl+F5). HACS registers the dashboard resource for
   you.

Updates then appear in HACS like for any other card.

## Option B: Manual

### 1. Copy the file

Download `dynamic-radiocard.js` from the
[latest release](https://github.com/badboiaustria/dynamic-radiocard/releases/latest)
and place it in your HA config directory under `www/`:

```
/config/
└─ www/
   └─ dynamic-radiocard.js
```

Create the `www` folder if it does not exist yet.

### 2. Register the resource

*Settings → Dashboards → ⋮ (top right) → Resources → Add resource*

| Field | Value |
|---|---|
| URL | `/local/dynamic-radiocard.js` |
| Resource type | **JavaScript module** |

`/local/` maps to the `/config/www/` folder.

Then hard-refresh the browser (**Ctrl + F5**) or fully restart the HA app.
The browser console confirms the load:

```
DYNAMIC-RADIOCARD v3.0.0
```

When updating manually, append a cache buster to the resource URL, e.g.
`/local/dynamic-radiocard.js?v=3.0.0`.

## Create the token

1. Open the Music Assistant web UI.
2. Profile → **Long-Lived Tokens** → create a token and copy it.
3. Put it into the card configuration as `ma_token` (see
   [configuration.md](configuration.md)).

Without a token the card falls back to `media_player/browse_media`: the
library still shows up, but without the provider filter and noticeably slower.

## Add the card

In the dashboard editor choose *Add card → Manual* and paste:

```yaml
type: custom:dynamic-radiocard
title: Music
ma_token: "eyJhbGciOi..."
```

More examples: [examples/lovelace-basic.yaml](examples/lovelace-basic.yaml)
and [examples/lovelace-advanced.yaml](examples/lovelace-advanced.yaml).

## Upgrading from `ha-radio-card` 2.x

1. Install Dynamic RadioCard (HACS or manual, see above).
2. In every dashboard using the old card, replace
   `type: custom:ha-radio-card` with `type: custom:dynamic-radiocard`.
3. Remove the old resource entry `/local/ha-radio-card.js` and the old file.
4. Saved browser settings (player, category, provider filters) are migrated
   automatically on first load.

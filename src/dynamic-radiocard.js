/**
 * Dynamic RadioCard - a 3D cover-flow media browser for Music Assistant
 * Author: Michael Boehm
 * License: MIT
 */

const CARD_VERSION = "3.0.1";
const STORAGE_PREFIX = "dynamic-radiocard-";
const STORAGE_KEY_PLAYER = STORAGE_PREFIX + "selected-player";
const STORAGE_KEY_CATEGORY = STORAGE_PREFIX + "category";
const STORAGE_KEY_PROVIDERS = STORAGE_PREFIX + "providers-by-cat";  // schema v2: {catKey: [activeIds]}
const STORAGE_KEY_REGISTRY = STORAGE_PREFIX + "provider-registry"; // cached MA provider registry

// One-time migration of saved settings from the former card name ("ha-radio-card")
try {
  ["selected-player", "category", "providers-by-cat", "provider-registry"].forEach((sfx) => {
    const oldVal = localStorage.getItem("ha-radio-card-" + sfx);
    if (oldVal !== null && localStorage.getItem(STORAGE_PREFIX + sfx) === null) {
      localStorage.setItem(STORAGE_PREFIX + sfx, oldVal);
    }
  });
} catch (e) { /* storage unavailable */ }
const MAX_ITEMS_PER_CATEGORY = 30;     // display limit (carousel)
const MAX_ITEMS_FOR_COUNTS = 500;      // server limit for unfiltered loads, used only for counting

// Recognized provider domains and their icons / names
const PROVIDER_META = {
  spotify:       { name: "Spotify",       icon: "mdi:spotify" },
  tunein:        { name: "TuneIn",        icon: "mdi:radio-tower" },
  radiobrowser:  { name: "RadioBrowser",  icon: "mdi:radio" },
  apple_music:   { name: "Apple Music",   icon: "mdi:apple" },
  applemusic:    { name: "Apple Music",   icon: "mdi:apple" },
  youtube:       { name: "YouTube Music", icon: "mdi:youtube" },
  ytmusic:       { name: "YT Music",      icon: "mdi:youtube" },
  soundcloud:    { name: "SoundCloud",    icon: "mdi:soundcloud" },
  deezer:        { name: "Deezer",        icon: "mdi:music-circle" },
  tidal:         { name: "Tidal",         icon: "mdi:waves" },
  qobuz:         { name: "Qobuz",         icon: "mdi:music-clef-treble" },
  filesystem:    { name: "Local",         icon: "mdi:folder-music" },
  local:         { name: "Local",         icon: "mdi:folder-music" },
  plex:          { name: "Plex",          icon: "mdi:plex" },
  subsonic:      { name: "Subsonic",      icon: "mdi:music" },
  jellyfin:      { name: "Jellyfin",      icon: "mdi:jellyfish" },
  opensubsonic:  { name: "OpenSubsonic",  icon: "mdi:music" },
  podcastfeed:   { name: "Podcasts",      icon: "mdi:rss" },
  rss:           { name: "RSS",           icon: "mdi:rss" },
  bluesound:     { name: "Bluesound",     icon: "mdi:speaker-bluetooth" },
  library:       { name: "Library",       icon: "mdi:library-shelves" },
};
const PROVIDER_FALLBACK_ICON = "mdi:music-circle";

// ---------------------------------------------------------------------------
// i18n - English is the default; `language: auto` follows the HA user profile.
// Adding another language: copy a block, translate, done.
// ---------------------------------------------------------------------------
const TRANSLATIONS = {
  en: {
    "category.radio": "RADIO",
    "category.podcast": "PODCASTS",
    "category.track": "TRACKS",
    "category.album": "ALBUMS",
    "category.artist": "ARTISTS",
    "media.radio": "radio stations",
    "media.podcast": "podcasts",
    "media.track": "tracks",
    "media.album": "albums",
    "media.artist": "artists",
    "category.prev": "Previous category",
    "category.next": "Next category",
    "filter.tooltip": "Filter providers",
    "filter.all": "All",
    "filter.empty": "No providers detected for this category.",
    "nav.prev": "Previous item",
    "nav.next": "Next item",
    "nav.play_pause": "Play / pause",
    "nav.stop": "Stop",
    "volume.up": "Volume up",
    "volume.down": "Volume down",
    "player.pick": "Select a player",
    "player.tooltip": "Select a player",
    "playback.prev": "Previous track",
    "playback.next": "Next track",
    "grid.close": "Close",
    "state.initial": "Loading your Music Assistant library ...",
    "state.loading": "Loading {media} ...",
    "state.empty_library": "No {media} found in your Music Assistant library.",
    "state.empty_filter": "No {media} match the active provider filter.",
    "clock.days": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "clock.date": "{m}/{d}",
  },
  de: {
    "category.radio": "RADIO",
    "category.podcast": "PODCASTS",
    "category.track": "TITEL",
    "category.album": "ALBEN",
    "category.artist": "K\u00dcNSTLER",
    "media.radio": "Radiosender",
    "media.podcast": "Podcasts",
    "media.track": "Titel",
    "media.album": "Alben",
    "media.artist": "K\u00fcnstler",
    "category.prev": "Vorherige Kategorie",
    "category.next": "N\u00e4chste Kategorie",
    "filter.tooltip": "Provider filtern",
    "filter.all": "Alle",
    "filter.empty": "Keine Provider f\u00fcr diese Kategorie erkennbar.",
    "nav.prev": "Vorheriger Eintrag",
    "nav.next": "N\u00e4chster Eintrag",
    "nav.play_pause": "Play / Pause",
    "nav.stop": "Stop",
    "volume.up": "Lauter",
    "volume.down": "Leiser",
    "player.pick": "Abspielger\u00e4t w\u00e4hlen",
    "player.tooltip": "Abspielger\u00e4t w\u00e4hlen",
    "playback.prev": "Vorheriger Titel",
    "playback.next": "N\u00e4chster Titel",
    "grid.close": "Schlie\u00dfen",
    "state.initial": "Lade Music-Assistant-Bibliothek ...",
    "state.loading": "Lade {media} ...",
    "state.empty_library": "Keine {media} in Music Assistant gefunden.",
    "state.empty_filter": "Keine {media} f\u00fcr die aktiven Provider.",
    "clock.days": ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    "clock.date": "{d}.{m}.",
  },
};

// Available categories cycled through with the left up/down buttons.
// `paths` are the browse_media URIs to try first; `keywords` help the tree-walk
// fallback to recognize relevant items by title.
const CATEGORIES = [
  {
    key: "radio",
    icon: "mdi:radio",
    media_type: "radio",
    ma_items_cmd: "music/radios/library_items",
    filter_arg: "provider",      // radios filter by provider id
    filter_kind: "provider",
    paths: ["library://radio", "library://radios", "favorites://radio"],
    keywords: ["radio", "station"],
    classes: ["radio"],
  },
  {
    key: "podcast",
    icon: "mdi:podcast",
    media_type: "podcast",
    ma_items_cmd: "music/podcasts/library_items",
    filter_arg: "provider",      // user prefers source/provider over genre
    filter_kind: "provider",
    paths: ["library://podcast", "library://podcasts", "favorites://podcast"],
    keywords: ["podcast"],
    classes: ["podcast"],
  },
  {
    key: "track",
    icon: "mdi:music-note",
    media_type: "track",
    ma_items_cmd: "music/tracks/library_items",
    filter_arg: "provider",
    filter_kind: "provider",
    paths: ["library://track", "library://tracks", "favorites://track"],
    keywords: ["track", "title", "titel", "song"],
    classes: ["track"],
  },
  {
    key: "album",
    icon: "mdi:album",
    media_type: "album",
    ma_items_cmd: "music/albums/library_items",
    filter_arg: "provider",
    filter_kind: "provider",
    paths: ["library://album", "library://albums", "favorites://album"],
    keywords: ["album", "alben"],
    classes: ["album"],
  },
  {
    key: "artist",
    icon: "mdi:account-music",
    media_type: "artist",
    ma_items_cmd: "music/artists/library_items",
    filter_arg: "provider",
    filter_kind: "provider",
    paths: ["library://artist", "library://artists", "favorites://artist"],
    keywords: ["artist", "artists", "kuenstler", "interpret"],
    classes: ["artist"],
  },
];

const STYLE = `
  :host { display: block; --image-scale: 1; }
  ha-card {
    padding: 16px 14px 18px;
    overflow: hidden;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    border-radius: var(--ha-card-border-radius, 18px);
  }
  /* smooth_animation: false -> disable all carousel transitions */
  ha-card.no-anim .item,
  ha-card.no-anim .track,
  ha-card.no-anim .cat-label,
  ha-card.no-anim .play-btn,
  ha-card.no-anim .stop-btn { transition: none !important; animation: none !important; }
  .wrap { display: flex; align-items: flex-start; gap: 16px; padding-top: 4px; }
  /* Foreground controls overlay the scaled image */
  .clock, .nav, .cat-col, .player-col { position: relative; z-index: 10; }
  .stage-col {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
  }
  .clock {
    text-align: center;
    color: var(--primary-text-color, #fff);
    user-select: none;
    margin: 0 0 4px;
    display: flex; flex-direction: column; align-items: center;
    line-height: 1.05;
    position: relative; z-index: 11;
  }
  .clock .date {
    font-size: 11px;
    color: var(--secondary-text-color, #aaa);
    font-weight: 500;
    letter-spacing: 0.04em;
    margin-bottom: 1px;
  }
  .clock .time-row {
    display: inline-flex; align-items: baseline; gap: 2px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 6px rgba(0,0,0,0.45);
  }
  .clock .seconds {
    font-size: 14px;
    color: var(--secondary-text-color, #aaa);
    font-weight: 500;
  }
  .stage {
    width: 100%;
    position: relative;
    height: 170px;
    perspective: 900px;
    perspective-origin: 50% 50%;
    /* allow large-scale images to extend above/below; controls overlay via z-index */
    overflow: visible;
    user-select: none;
    -webkit-user-select: none;
    touch-action: pan-y;
    z-index: 1;
  }
  .stage::before, .stage::after {
    content: "";
    position: absolute; top: 0; bottom: 0;
    width: 40px; z-index: 5; pointer-events: none;
  }
  .stage::before { left: 0; background: linear-gradient(to right, var(--ha-card-background, var(--card-background-color, #1c1c1e)), transparent); }
  .stage::after  { right: 0; background: linear-gradient(to left,  var(--ha-card-background, var(--card-background-color, #1c1c1e)), transparent); }
  .track { position: absolute; inset: 0; transform-style: preserve-3d; }
  .item {
    position: absolute; top: 50%; left: 50%;
    width: 110px; height: 110px;
    margin: -55px 0 0 -55px;
    border-radius: 16px;
    background: var(--secondary-background-color, #2c2c2e);
    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; overflow: hidden;
    transition: transform 520ms cubic-bezier(.22,.9,.31,1.2), opacity 520ms ease, filter 520ms ease, box-shadow 520ms ease;
    will-change: transform, opacity, filter;
    backface-visibility: hidden;
  }
  .item img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .item .fallback { --mdc-icon-size: 64px; color: var(--primary-text-color, #fff); opacity: 0.85; }
  .item .label {
    position: absolute; bottom: 4px; left: 4px; right: 4px;
    text-align: center; font-size: 10px; color: #fff;
    background: rgba(0,0,0,0.55); border-radius: 8px;
    padding: 2px 4px; line-height: 1.1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    opacity: 0; transition: opacity 320ms ease;
  }
  .item.center .label { opacity: 1; }
  .item.center {
    box-shadow: 0 14px 28px rgba(0,0,0,0.55), 0 0 0 2px var(--primary-color, #03a9f4), 0 0 22px rgba(3,169,244,0.45);
  }
  .item.center.playing { animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 14px 28px rgba(0,0,0,0.55), 0 0 0 2px var(--primary-color, #03a9f4), 0 0 22px rgba(3,169,244,0.45); }
    50%     { box-shadow: 0 14px 28px rgba(0,0,0,0.55), 0 0 0 3px var(--primary-color, #03a9f4), 0 0 38px rgba(3,169,244,0.85); }
  }
  /* play-overlay entfernt - jetzt zentraler Play/Stop Button unter Stage */
  /* Linke Spalte: Kategorie-Switcher (Up + Label + Down) */
  .cat-col {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 86px;
  }
  .cat-btn {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--primary-color, #03a9f4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1),
                background 200ms ease, box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .cat-btn ha-icon {
    --mdc-icon-size: 22px;
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1);
  }
  .cat-btn:hover {
    background: var(--primary-color, #03a9f4); color: #fff;
    box-shadow: 0 4px 14px rgba(3,169,244,0.55);
  }
  .cat-btn:hover ha-icon { color: #fff; }
  .cat-btn.up:hover ha-icon   { transform: translateY(-2px) scale(1.05); }
  .cat-btn.down:hover ha-icon { transform: translateY(2px)  scale(1.05); }
  .cat-btn:active { transform: scale(0.85); }
  .cat-btn.bump-up   { animation: catBumpUp   380ms ease; }
  .cat-btn.bump-down { animation: catBumpDown 380ms ease; }
  @keyframes catBumpUp {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.86) translateY(-3px); }
    100% { transform: scale(1); }
  }
  @keyframes catBumpDown {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.86) translateY(3px); }
    100% { transform: scale(1); }
  }
  .cat-label {
    flex: 0 0 auto;
    padding: 14px 8px 10px;
    border-radius: 12px;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 4px 14px rgba(0,0,0,0.35),
                inset 0 1px 0 rgba(255,255,255,0.06);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 5px;
    color: var(--primary-text-color);
    width: 84px;
    min-height: 72px;
    overflow: hidden;
    position: relative;
  }
  .cat-label ha-icon {
    --mdc-icon-size: 26px;
    color: var(--primary-color, #03a9f4);
    transition: transform 320ms cubic-bezier(.34,1.56,.64,1);
  }
  .cat-label .text {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: center;
    line-height: 1.1;
    text-transform: uppercase;
  }
  .cat-label.flip-up    { animation: flipUp   420ms cubic-bezier(.4,.0,.2,1); }
  .cat-label.flip-down  { animation: flipDown 420ms cubic-bezier(.4,.0,.2,1); }
  @keyframes flipUp {
    0%   { transform: translateY(0)    rotateX(0);   opacity: 1; }
    49%  { transform: translateY(-12px) rotateX(70deg); opacity: 0; }
    51%  { transform: translateY(12px)  rotateX(-70deg); opacity: 0; }
    100% { transform: translateY(0)    rotateX(0);   opacity: 1; }
  }
  @keyframes flipDown {
    0%   { transform: translateY(0)    rotateX(0);    opacity: 1; }
    49%  { transform: translateY(12px)  rotateX(-70deg); opacity: 0; }
    51%  { transform: translateY(-12px) rotateX(70deg);  opacity: 0; }
    100% { transform: translateY(0)    rotateX(0);    opacity: 1; }
  }

  /* Provider-Filter Button + Dropdown */
  .filter-divider {
    width: 50%;
    height: 1px;
    background: rgba(255,255,255,0.1);
    margin: 6px auto 4px;
  }
  .filter-btn {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--primary-color, #03a9f4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1),
                background 200ms ease, color 200ms ease,
                box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    position: relative;
  }
  .filter-btn ha-icon {
    --mdc-icon-size: 22px;
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1);
  }
  .filter-btn:hover {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    box-shadow: 0 4px 14px rgba(3,169,244,0.55);
  }
  .filter-btn:hover ha-icon { color: #fff; transform: scale(1.08); }
  .filter-btn:active { transform: scale(0.85); }
  .filter-btn.has-filter {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    box-shadow: 0 2px 10px rgba(3,169,244,0.55);
  }
  .filter-badge {
    position: absolute;
    top: -3px; right: -3px;
    min-width: 16px; height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #e74c3c;
    color: #fff;
    font-size: 9px; font-weight: 700;
    display: none;
    align-items: center; justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  }
  .filter-btn.has-filter .filter-badge { display: flex; }

  .filter-panel {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: var(--card-background-color, #2c2c2e);
    color: var(--primary-text-color);
    border-radius: 14px;
    padding: 12px;
    min-width: 260px; max-width: 360px;
    max-height: 70vh;
    overflow: auto;
    z-index: 9999;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    display: none;
  }
  .filter-panel.open { display: block; }
  .filter-panel h4 {
    margin: 4px 6px 8px;
    font-size: 14px;
    font-weight: 600;
    display: flex; align-items: center; gap: 8px;
  }
  .filter-panel h4 ha-icon {
    --mdc-icon-size: 18px;
    color: var(--primary-color, #03a9f4);
  }
  .filter-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 10px;
    cursor: pointer; font-size: 13px;
    transition: background 160ms ease;
  }
  .filter-row:hover { background: var(--secondary-background-color, #444); }
  .filter-row .check {
    width: 20px; height: 20px;
    border-radius: 5px;
    border: 2px solid var(--secondary-text-color, #888);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .filter-row .check ha-icon {
    --mdc-icon-size: 14px;
    color: #fff;
    opacity: 0;
    transition: opacity 140ms ease;
  }
  .filter-row.active .check {
    background: var(--primary-color, #03a9f4);
    border-color: var(--primary-color, #03a9f4);
  }
  .filter-row.active .check ha-icon { opacity: 1; }
  .filter-row.all-row {
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 4px;
    padding-bottom: 11px;
    font-weight: 600;
  }
  .filter-row .prov-icon {
    --mdc-icon-size: 18px;
    color: var(--primary-color, #03a9f4);
    flex-shrink: 0;
  }
  .filter-row .label {
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .filter-row .count {
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.8;
  }

  /* Rechte Spalte: Volume Up + Player Chip + Volume Down */
  .player-col {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .vol-btn {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--primary-color, #03a9f4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1),
                background 200ms ease,
                box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  .vol-btn ha-icon {
    --mdc-icon-size: 22px;
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1);
  }
  .vol-btn:hover {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    box-shadow: 0 4px 14px rgba(3,169,244,0.55);
  }
  .vol-btn:hover ha-icon { color: #fff; }
  .vol-btn.up:hover ha-icon   { transform: translateY(-2px) scale(1.05); }
  .vol-btn.down:hover ha-icon { transform: translateY(2px)  scale(1.05); }
  .vol-btn:active { transform: scale(0.85); }
  .vol-btn.bump-up   { animation: volBumpUp   380ms ease; }
  .vol-btn.bump-down { animation: volBumpDown 380ms ease; }
  @keyframes volBumpUp {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.86) translateY(-3px); }
    100% { transform: scale(1); }
  }
  @keyframes volBumpDown {
    0%   { transform: scale(1); }
    40%  { transform: scale(0.86) translateY(3px); }
    100% { transform: scale(1); }
  }

  .player-chip {
    /* Match cat-label dimensions on the left for visual balance */
    width: 84px; min-height: 72px;
    padding: 14px 8px 10px; border-radius: 12px;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 5px;
    cursor: pointer; color: var(--primary-text-color);
    transition: transform 180ms ease, background 180ms ease;
    position: relative;
    overflow: hidden;
  }
  .player-chip ha-icon { --mdc-icon-size: 26px; color: var(--primary-color, #03a9f4); }
  .player-chip .name {
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
    text-align: center; line-height: 1.1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word;
  }
  .player-chip:hover { transform: translateY(-2px); background: var(--ha-card-background, #333); }
  .player-chip.active::after {
    content: ""; position: absolute; top: 8px; right: 8px;
    width: 8px; height: 8px; border-radius: 50%;
    background: #4caf50; box-shadow: 0 0 8px #4caf50;
  }
  /* Grid view overlay - replaces the carousel when grid_mode is on */
  .grid-view {
    position: absolute;
    inset: 18px 14px;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    display: none;
    z-index: 50;
    overflow: hidden;
    border-radius: var(--ha-card-border-radius, 18px);
  }
  .grid-view.open { display: block; }
  .grid-view-scroll {
    position: absolute; inset: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .grid-back {
    position: absolute; top: 8px; right: 8px;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(0,0,0,0.55);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    z-index: 51;
    transition: transform 180ms ease, background 180ms ease;
  }
  .grid-back:hover { background: var(--primary-color, #03a9f4); transform: scale(1.08); }
  .grid-back ha-icon { --mdc-icon-size: 18px; }
  .grid-cells {
    display: grid;
    gap: 6px;
    padding: 8px 6px 6px 6px;
  }
  .grid-cell {
    position: relative;
    aspect-ratio: 1 / 1;
    border-radius: 10px;
    background: var(--secondary-background-color, #2c2c2e);
    cursor: pointer;
    overflow: hidden;
    transition: transform 180ms cubic-bezier(.34,1.56,.64,1), box-shadow 180ms ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }
  .grid-cell:hover {
    transform: scale(1.04);
    box-shadow: 0 6px 18px rgba(3,169,244,0.45),
                0 0 0 2px var(--primary-color, #03a9f4);
  }
  .grid-cell:active { transform: scale(0.96); }
  .grid-cell img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .grid-cell .fallback {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    --mdc-icon-size: 38%; color: var(--primary-text-color, #fff); opacity: 0.7;
  }
  .grid-cell .label {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 4px 6px;
    background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0));
    color: #fff;
    font-size: 11px;
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }

  /* Playback queue controls (prev/next), placed at bottom of player-col */
  .pb-row {
    display: flex; flex-direction: row;
    align-items: center; justify-content: center;
    gap: 6px;
  }
  .pb-btn {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--primary-color, #03a9f4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 200ms cubic-bezier(.34,1.56,.64,1), background 200ms ease, box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .pb-btn ha-icon { --mdc-icon-size: 22px; }
  .pb-btn:hover {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    box-shadow: 0 4px 14px rgba(3,169,244,0.55);
    transform: scale(1.06);
  }
  .pb-btn:active { transform: scale(0.88); }
  .pb-btn.bump { animation: btnBump 320ms ease; }

  .picker-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 9998; display: none;
  }
  .picker-backdrop.open { display: block; }
  .picker {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--card-background-color, #2c2c2e); color: var(--primary-text-color);
    border-radius: 14px; padding: 12px;
    min-width: 260px; max-width: 360px; max-height: 70vh; overflow: auto;
    z-index: 9999; box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }
  .picker h3 { margin: 4px 6px 10px; font-size: 14px; font-weight: 600; }
  .picker .row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px; border-radius: 10px; cursor: pointer;
  }
  .picker .row:hover { background: var(--secondary-background-color, #444); }
  .picker .row.active { background: rgba(3,169,244,0.18); }
  .picker .row ha-icon { --mdc-icon-size: 22px; color: var(--primary-color, #03a9f4); }
  .empty {
    color: var(--secondary-text-color); text-align: center;
    padding: 20px; font-size: 13px; width: 100%;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; color: var(--primary-text-color);
  }
  .header .title { font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .header .title ha-icon { --mdc-icon-size: 20px; color: var(--primary-color, #03a9f4); }
  .header .now {
    font-size: 11px; color: var(--secondary-text-color);
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 60%;
  }

  /* Navigation arrows + zentraler Play/Stop */
  .nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 28px;
    margin-top: 10px;
    padding-bottom: 2px;
  }
  .arrow {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--secondary-background-color, #2c2c2e);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--primary-color, #03a9f4);
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1), background 200ms ease, box-shadow 200ms ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    flex: 0 0 auto;
  }
  .arrow ha-icon {
    --mdc-icon-size: 22px;
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1);
  }
  .arrow:hover {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    box-shadow: 0 4px 14px rgba(3,169,244,0.55);
  }
  .arrow:hover ha-icon { color: #fff; }
  .arrow.left:hover ha-icon  { transform: translateX(-3px); }
  .arrow.right:hover ha-icon { transform: translateX(3px); }
  .arrow:active { transform: scale(0.85); }
  .arrow.pressed-left  { animation: bumpLeft 360ms ease; }
  .arrow.pressed-right { animation: bumpRight 360ms ease; }
  @keyframes bumpLeft {
    0%   { transform: scale(1); }
    50%  { transform: scale(0.82) translateX(-4px); }
    100% { transform: scale(1); }
  }
  @keyframes bumpRight {
    0%   { transform: scale(1); }
    50%  { transform: scale(0.82) translateX(4px); }
    100% { transform: scale(1); }
  }

  /* Zwei dedizierte Buttons: Play/Pause + Stop */
  .play-btn, .stop-btn {
    width: 56px; height: 56px;
    border-radius: 50%;
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(.34,1.56,.64,1),
                box-shadow 200ms ease,
                background 220ms ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    flex: 0 0 auto;
    position: relative;
  }
  .play-btn ha-icon, .stop-btn ha-icon {
    --mdc-icon-size: 32px;
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1),
                opacity 180ms ease;
  }
  /* Play-Button: kräftiges Primary Blau, neutraler Karten-Schatten */
  .play-btn {
    background: var(--primary-color, #03a9f4);
    box-shadow: 0 6px 18px rgba(0,0,0,0.45),
                inset 0 1px 0 rgba(255,255,255,0.18);
  }
  .play-btn:hover {
    transform: scale(1.06);
    box-shadow: 0 8px 22px rgba(0,0,0,0.55),
                inset 0 1px 0 rgba(255,255,255,0.22);
  }
  .play-btn:active { transform: scale(0.92); }
  /* Pause-Variante: dunkles Blau wenn etwas läuft, Icon pulsiert */
  .play-btn.playing {
    background: #01579b;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45),
                inset 0 1px 0 rgba(255,255,255,0.18);
  }
  .play-btn.playing:hover {
    background: #0277bd;
    box-shadow: 0 8px 22px rgba(0,0,0,0.55),
                inset 0 1px 0 rgba(255,255,255,0.22);
  }
  /* Pause icon pulses in sync with the center card's glow (same 2.4s cycle) */
  .play-btn.playing ha-icon {
    animation: pausePulse 2.4s ease-in-out infinite;
  }
  @keyframes pausePulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.3); }
  }
  /* Stop-Button: rot, neutraler Karten-Schatten */
  .stop-btn {
    background: #e74c3c;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45),
                inset 0 1px 0 rgba(255,255,255,0.18);
  }
  .stop-btn:hover {
    transform: scale(1.06);
    box-shadow: 0 8px 22px rgba(0,0,0,0.55),
                inset 0 1px 0 rgba(255,255,255,0.22);
  }
  .stop-btn:active { transform: scale(0.92); }

  .play-btn.bump, .stop-btn.bump { animation: btnBump 380ms ease; }
  @keyframes btnBump {
    0%   { transform: scale(1); }
    35%  { transform: scale(0.86); }
    65%  { transform: scale(1.12); }
    100% { transform: scale(1); }
  }
`;

/**
 * MAClient - opens a WebSocket to Music Assistant via HA's Hassio Ingress.
 * Same origin as HA, so HTTPS / Nabu Casa / Remote works automatically.
 */
class MAClient {
  constructor(hass) {
    this.hass = hass;
    this.ws = null;
    this.connecting = null;
    this.pending = new Map();
    this.connected = false;
    this.disabled = false;
  }

  async _discoverWSUrl() {
    // Direct host has priority once we know it (no auth needed, fast)
    if (this._directHost) {
      const url = `ws://${this._directHost}/ws`;
      return url;
    }
    // Build candidate addon-slugs from registered panels.
    const panels = this.hass?.panels || {};
    const candidates = new Set();
    for (const [key, panel] of Object.entries(panels)) {
      const k = key.toLowerCase();
      if (k.includes("music_assistant") || k.includes("musicassistant") || k.includes("mass")) {
        if (panel.config?.ingress) candidates.add(panel.config.ingress);
        if (panel.config?.slug) candidates.add(panel.config.slug);
        if (panel.config?.addon) candidates.add(panel.config.addon);
        if (panel.url_path) candidates.add(panel.url_path);
        if (panel.url_path?.includes("_")) {
          candidates.add(panel.url_path.split("_").slice(1).join("_"));
        }
        // pre-baked URL?
        if (panel.config?.url && /hassio_ingress\/([^/]+)/.test(panel.config.url)) {
          const m = panel.config.url.match(/hassio_ingress\/([^/]+)/);
          if (m) {
            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            const url = `${proto}//${location.host}/api/hassio_ingress/${m[1]}/ws`;
            return url;
          }
        }
      }
    }
    ["music_assistant", "music_assistant_server"].forEach((s) => candidates.add(s));

    // -- Path 1: HA WebSocket command (uses HA WS auth, not REST)
    for (const slug of candidates) {
      if (!slug) continue;
      try {
        const r = await this.hass.callWS({ type: "supervisor/api",
          endpoint: "/ingress/session", method: "post", data: { addon: slug } });
        const session = r?.data?.session || r?.session;
        if (session) {
          const proto = location.protocol === "https:" ? "wss:" : "ws:";
          return `${proto}//${location.host}/api/hassio_ingress/${session}/ws`;
        }
      } catch (e) { /* try next */ }
    }

    // -- Path 2: REST API (needs supervisor admin role)
    for (const slug of candidates) {
      if (!slug) continue;
      for (const param of [{ addon: slug }, { slug }]) {
        try {
          const res = await this.hass.callApi("POST", "hassio/ingress/session", param);
          const session = res?.data?.session || res?.session;
          if (session) {
            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            return `${proto}//${location.host}/api/hassio_ingress/${session}/ws`;
          }
        } catch (e) { /* try next */ }
      }
    }

    return null;
  }

  // Allow caller to set the direct host (extracted from item images, e.g. "192.168.1.5:8095")
  setDirectHost(host) {
    if (host && this._directHost !== host) {
      this._directHost = host;
      this.disabled = false;       // re-enable: new info changes the picture
      this.connecting = null;
    }
  }

  setToken(token) {
    if (token && this._token !== token) {
      this._token = token;
      this.disabled = false;
      this.connecting = null;
    }
  }

  async connect() {
    if (this.disabled) throw new Error("MAClient disabled");
    if (this.authed && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      await this._doConnect();
      // Now authenticate (MA requires this before any other command)
      await this._authenticate();
      this.authed = true;
    })();
    try { await this.connecting; }
    finally { this.connecting = null; }
  }

  async _authenticate() {
    if (!this._token) {
      throw new Error(
        "MA auth: no ma_token configured. Generate a long-lived token in the " +
        "Music Assistant web UI (Profile -> Long-Lived Tokens) and add it to " +
        "the card's `ma_token` config."
      );
    }
    await this._sendRaw("auth", { token: this._token });
  }

  // Internal: send a command without waiting for connect/auth (used by _authenticate)
  _sendRaw(command, args) {
    return new Promise((resolve, reject) => {
      const id = "harc-" + Math.random().toString(36).slice(2);
      this.pending.set(id, { resolve, reject });
      const msg = { command, message_id: id };
      if (args && typeof args === "object" && Object.keys(args).length > 0) msg.args = args;
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("MA command timeout: " + command));
        }
      }, 8000);
    });
  }

  _doConnect() {
    return new Promise(async (resolve, reject) => {
      const url = await this._discoverWSUrl();
      if (!url) { this.disabled = true; reject(new Error("Could not discover MA ingress URL")); return; }
      const ws = new WebSocket(url);
      let opened = false;
      const to = setTimeout(() => {
        if (!opened) { try { ws.close(); } catch (e) {} reject(new Error("MA WS connect timeout")); }
      }, 8000);
      ws.onopen = () => {
        opened = true;
        clearTimeout(to);
        this.ws = ws;
        this.connected = true;
        resolve();
      };
      ws.onerror = (e) => {
        if (!opened) { clearTimeout(to); reject(new Error("MA WS error")); }
        else console.warn("[MAClient] error", e);
      };
      ws.onmessage = (evt) => this._handleMessage(evt);
      ws.onclose = () => {
        this.connected = false; this.authed = false; this.ws = null;
        // Reject all pending
        this.pending.forEach((p) => p.reject(new Error("WS closed")));
        this.pending.clear();
      };
    });
  }

  _handleMessage(evt) {
    let data;
    try { data = JSON.parse(evt.data); } catch (e) { return; }

    // Server greeting (no message_id, has server_id) - capture for diagnostics
    if (!data.message_id && data.server_id) {
      this._serverInfo = data;
      return;
    }

    const id = data.message_id;
    if (!id) return;
    const p = this.pending.get(id);
    if (!p) return;

    // MA error format: { message_id, error_code, details }
    if (data.error_code !== undefined || data.error) {
      this.pending.delete(id);
      const msg = data.details || data.error?.message || data.error || ("error_code " + data.error_code);
      p.reject(new Error(msg));
      return;
    }

    // MA may stream large responses: a series of partial:true messages each
    // carrying chunks of the result array, terminated by partial:false (often empty).
    if (data.partial === true) {
      if (!p.partials) p.partials = [];
      if (Array.isArray(data.result)) p.partials.push(...data.result);
      else if (data.result !== undefined) p.partials.push(data.result);
      return;  // wait for end-of-stream
    }

    // partial:false (or no partial field) = final message.
    this.pending.delete(id);
    if (p.partials && p.partials.length > 0) {
      // Streamed response: include any tail result chunk too
      if (Array.isArray(data.result)) p.partials.push(...data.result);
      else if (data.result !== undefined) p.partials.push(data.result);
      p.resolve(p.partials);
    } else {
      // Single-shot response
      p.resolve(data.result);
    }
  }

  async send(command, args) {
    await this.connect();
    return new Promise((resolve, reject) => {
      const id = "harc-" + Math.random().toString(36).slice(2);
      this.pending.set(id, { resolve, reject });
      const msg = { command, message_id: id };
      // Only include args field if it has actual content (matches MA panel behavior)
      if (args && typeof args === "object" && Object.keys(args).length > 0) msg.args = args;
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("MA command timeout: " + command));
        }
      }, 12000);
    });
  }

  close() { try { this.ws?.close(); } catch (e) {} this.ws = null; this.connected = false; this.authed = false; }
}

class DynamicRadioCard extends HTMLElement {
  static getStubConfig() { return { title: "Dynamic RadioCard", show_title: true }; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._radios = [];
    this._players = [];
    this._centerIdx = 0;
    this._loadingRadios = false;
    this._loadingPlayers = false;
    this._initialized = false;
    this._itemsByCategory = {};         // cache: catKey -> array of items (filtered set)
    this._fullItemsByCategory = {};     // cache: catKey -> array of items (unfiltered set, for counts)
    this._centerByCategory = {};        // cache: catKey -> last center index
    this._providersByCategory = {};     // catKey -> [Provider]
    this._activeByCategory = {};        // catKey -> Set<string>
    this._catInitialized = {};          // catKey -> true once user-chosen filter set saved
    let savedCat = null;
    let savedProviderState = null;
    try {
      this._selectedPlayer = localStorage.getItem(STORAGE_KEY_PLAYER) || null;
      savedCat = localStorage.getItem(STORAGE_KEY_CATEGORY);
      const sp = localStorage.getItem(STORAGE_KEY_PROVIDERS);
      savedProviderState = sp ? JSON.parse(sp) : null;
    } catch (e) { this._selectedPlayer = null; }
    const idx = CATEGORIES.findIndex((c) => c.key === savedCat);
    this._catIdx = idx >= 0 ? idx : 0;
    if (savedProviderState && typeof savedProviderState === "object") {
      Object.entries(savedProviderState).forEach(([catKey, ids]) => {
        if (Array.isArray(ids)) {
          this._activeByCategory[catKey] = new Set(ids);
          this._catInitialized[catKey] = true;
        }
      });
    }
    this._lastPlayerState = null;
    this._touch = null;
    this._isAnimating = false;
    this._maWS = null;          // MAClient instance (lazy)
    this._maWSReady = null;     // promise for first connect attempt
    this._genresByCategory = {}; // catKey -> [{item_id, name}]
  }

  _getMaClient() {
    if (!this._maWS && this._hass) {
      this._maWS = new MAClient(this._hass);
      if (this._config?.ma_token) this._maWS.setToken(this._config.ma_token);
      if (this._sniffedHost) {
        this._maWS.setDirectHost(this._sniffedHost);
      } else {
        // Guess: the MA add-on runs on the same host as HA, default port 8095.
        // This lets the very first items query already go through the MA WS
        // (the full library) instead of the limited HA service fallback.
        const port = parseInt(this._config?.ma_port, 10) || 8095;
        try {
          this._maWS.setDirectHost(location.hostname + ":" + port);
        } catch (e) { /* ignore */ }
      }
    }
    return this._maWS;
  }

  _activeCategory() { return CATEGORIES[this._catIdx]; }

  // --- i18n ---------------------------------------------------------------
  _lang() {
    const cfg = this._config?.language;
    let lang = (!cfg || cfg === "auto")
      ? (this._hass?.locale?.language || this._hass?.language || navigator.language || "en")
      : cfg;
    lang = String(lang).toLowerCase().slice(0, 2);
    return TRANSLATIONS[lang] ? lang : "en";
  }

  _t(key, vars) {
    let str = TRANSLATIONS[this._lang()][key];
    if (str === undefined) str = TRANSLATIONS.en[key];
    if (str === undefined) return key;
    if (vars) Object.entries(vars).forEach(([k, v]) => {
      str = str.split("{" + k + "}").join(v);
    });
    return str;
  }

  // Re-apply all texts that were rendered at build time (used after a
  // language change, e.g. when `language: auto` resolves differently once
  // the hass object arrives).
  _applyStaticTexts() {
    const root = this.shadowRoot;
    if (!root || !this._built) return;
    const setTitle = (id, key) => {
      const el = root.getElementById(id);
      if (el) el.title = this._t(key);
    };
    setTitle("cat-up", "category.prev");
    setTitle("cat-down", "category.next");
    setTitle("filter-btn", "filter.tooltip");
    setTitle("arrow-left", "nav.prev");
    setTitle("play-btn", "nav.play_pause");
    setTitle("stop-btn", "nav.stop");
    setTitle("arrow-right", "nav.next");
    setTitle("vol-up", "volume.up");
    setTitle("vol-down", "volume.down");
    setTitle("player-chip", "player.tooltip");
    setTitle("pb-prev", "playback.prev");
    setTitle("pb-next", "playback.next");
    setTitle("grid-back", "grid.close");
    const pickerH3 = root.querySelector("#picker h3");
    if (pickerH3) pickerH3.textContent = this._t("player.pick");
  }

  _updateClock() {
    if (!this._clockTime) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    this._clockTime.textContent = hh + ":" + mm;
    if (this._clockSeconds) this._clockSeconds.textContent = ":" + ss;
    if (this._clockDate) {
      const days = this._t("clock.days");
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = this._t("clock.date").split("{d}").join(day).split("{m}").join(month);
      this._clockDate.textContent = days[d.getDay()] + " " + date;
    }
  }

  disconnectedCallback() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }
  connectedCallback() {
    if (this._clockTime && !this._clockTimer) {
      this._updateClock();
      this._clockTimer = setInterval(() => this._updateClock(), 1000);
    }
    if (!this._visibilityHandler) {
      this._visibilityHandler = () => {
        if (!document.hidden && this._initialized) {
          const now = Date.now();
          if (!this._lastRefresh || (now - this._lastRefresh) > 30_000) {
            this._lastRefresh = now;
            this._refreshAllData();
          }
        }
      };
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }
    // Refresh on connect if we've been initialized before and it's been a while
    if (this._initialized && this._hass) {
      const now = Date.now();
      if (!this._lastRefresh || (now - this._lastRefresh) > 30_000) {
        this._lastRefresh = now;
        this._refreshAllData();
      }
    }
  }

  // Re-fetch players and the current category - throttled by visibility/connect
  async _refreshAllData() {
    // Re-discover players
    this._maDiscoveryPromise = null;
    this._maPlayerIds = null;
    this._playerRetries = 0;
    this._loadPlayers().then(() => this._renderPlayer());
    // Re-fetch current category
    const cat = this._activeCategory();
    if (this._itemRetries) this._itemRetries[cat.key] = 0;
    delete this._fullItemsByCategory[cat.key];
    delete this._itemsByCategory[cat.key];
    this._loadCategory(cat).then(() => this._renderCarousel());
  }

  setConfig(config) {
    this._config = {
      title: "Dynamic RadioCard",
      show_title: true,
      show_labels: true,
      language: "auto",            // "auto" follows the HA user profile; or "en" / "de"
      provider_names: {},          // manual override map { "plex--36fRmfSE": "Plex Hörbücher", ... }
      ma_token: null,              // MA long-lived token (JWT, generate in MA web UI -> profile)
      ma_port: 8095,               // MA server port (addon default 8095, same host as HA)
      debug: false,                // set true in YAML to enable verbose console logging
      image_scale: 1.0,            // scale factor for main carousel images (1.0 = default)
      playback_controls: true,     // show prev/next buttons in player column (hidden for radio)
      grid_mode: false,            // true: clicking the center item opens a grid view of all items
      smooth_animation: true,      // false: instant transitions, no carousel easing
      grid_max: 70,                // max number of cards shown in the grid view
      album_sort: "newest",        // album order in grid/carousel: "newest" or "alpha"
      hide_players: null,          // optional regex (on display name) - matching players are hidden
      favorites_only: {            // per-category: true = favorites only, false = whole library
        radio:   true,
        podcast: true,
        track:   true,
        album:   true,
        artist:  true,
      },
      ...config,
    };
    this._imageScale = Math.max(0.4, Math.min(3.0, parseFloat(this._config.image_scale) || 1.0));
    this._buildDom();
    this.style.setProperty("--image-scale", this._imageScale);
    if (this._maWS && this._config.ma_token) {
      this._maWS.setToken(this._config.ma_token);
    }
    this._applyAnimationConfig();
    this._renderPlaybackControls();
  }

  _applyAnimationConfig() {
    const card = this.shadowRoot?.querySelector("ha-card");
    if (card) card.classList.toggle("no-anim", this._config.smooth_animation === false);
  }

  // Load all items of a category via MA WS. Queries each music provider
  // separately and combines the results, so no provider is lost behind the
  // global limit (the original bug: 500 newest albums were all one provider).
  async _maWsLoadItems(cat, maClient, log) {
    const favoritesOnly = this._favoritesOnlyFor(cat.key);
    const orderBy = this._orderByFor(cat);
    const perProviderLimit = MAX_ITEMS_FOR_COUNTS;  // applied per provider

    // Make sure we know the providers
    await this._loadProviderRegistry(maClient, log);
    const reg = Array.isArray(this._providerRegistry) ? this._providerRegistry : [];
    const musicProviders = reg
      .filter((p) => p.type === "music" && (p.instance_id || p.domain))
      .map((p) => p.instance_id || p.domain);

    // Fallback: no registry -> one combined query
    if (!musicProviders.length) {
      const args = { search: "", limit: perProviderLimit, offset: 0, order_by: orderBy };
      if (favoritesOnly) args.favorite = true;
      log("MA WS (single)", cat.ma_items_cmd, args);
      const r = await maClient.send(cat.ma_items_cmd, args);
      return Array.isArray(r) ? r : [];
    }

    // Query each provider in parallel
    log("MA WS per-provider", cat.ma_items_cmd, "providers:", musicProviders.length);
    const results = await Promise.all(musicProviders.map(async (provId) => {
      const args = {
        search: "", limit: perProviderLimit, offset: 0,
        order_by: orderBy,
        provider: [provId],
      };
      if (favoritesOnly) args.favorite = true;
      try {
        const r = await maClient.send(cat.ma_items_cmd, args);
        return Array.isArray(r) ? r : [];
      } catch (e) {
        log("provider query failed", provId, e?.message || e);
        return [];
      }
    }));

    // Combine + dedupe by uri
    const seen = new Set();
    const combined = [];
    results.forEach((arr) => {
      arr.forEach((it) => {
        const uri = it.uri || it.item_id || it.media_content_id;
        if (uri && seen.has(uri)) return;
        if (uri) seen.add(uri);
        combined.push(it);
      });
    });
    return combined;
  }

  // MA order_by for a category. Albums honor the album_sort config option.
  _orderByFor(cat) {
    if (cat && cat.key === "album") {
      return this._config?.album_sort === "alpha" ? "name" : "timestamp_added_desc";
    }
    return "name";
  }

  // Returns whether items for a given category should be limited to favorites
  _favoritesOnlyFor(catKey) {
    const m = this._config?.favorites_only;
    if (m == null) return true;            // missing -> default favorites only
    if (typeof m === "boolean") return m;  // single boolean covers all
    if (typeof m === "object" && catKey in m) return m[catKey] !== false;
    return true;
  }

  // User-configured display name for a provider id (case-insensitive)
  _configuredProviderName(id) {
    const map = this._config?.provider_names || {};
    if (!id) return null;
    const lower = String(id).toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (String(k).toLowerCase() === lower) return v;
    }
    return null;
  }

  set hass(hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    // `language: auto` may resolve differently once hass is available
    const lang = this._lang();
    if (this._built && lang !== this._resolvedLang) {
      this._resolvedLang = lang;
      this._applyStaticTexts();
      this._updateCategoryLabel();
      if (this._initialized) this._renderCarousel();
    }
    if (firstHass) this._initialLoad();
    this._syncPlayerState();
  }

  getCardSize() { return 3; }

  _buildDom() {
    if (this._built) return;
    const root = this.shadowRoot;
    root.innerHTML =
      "<style>" + STYLE + "</style>" +
      '<ha-card>' +
      '  <div class="clock" id="clock">' +
      '    <span class="date" id="clock-date"></span>' +
      '    <span class="time-row">' +
      '      <span id="clock-time">--:--</span><span class="seconds" id="clock-seconds">:--</span>' +
      '    </span>' +
      '  </div>' +
      '  <div class="header" id="header" style="' + (this._config.show_title ? '' : 'display:none;') + '">' +
      '    <div class="title">' +
      '      <span id="title-text">' + this._escape(this._config.title) + '</span>' +
      '    </div>' +
      '    <div class="now" id="now"></div>' +
      '  </div>' +
      '  <div class="wrap">' +
      '    <div class="cat-col">' +
      '      <div class="cat-btn up" id="cat-up" title="' + this._t("category.prev") + '">' +
      '        <ha-icon icon="mdi:chevron-up"></ha-icon>' +
      '      </div>' +
      '      <div class="cat-label" id="cat-label">' +
      '        <ha-icon id="cat-icon" icon="mdi:radio"></ha-icon>' +
      '        <div class="text" id="cat-text">RADIO</div>' +
      '      </div>' +
      '      <div class="cat-btn down" id="cat-down" title="' + this._t("category.next") + '">' +
      '        <ha-icon icon="mdi:chevron-down"></ha-icon>' +
      '      </div>' +
      '      <div class="filter-divider"></div>' +
      '      <div class="filter-btn" id="filter-btn" title="' + this._t("filter.tooltip") + '">' +
      '        <ha-icon icon="mdi:filter-variant"></ha-icon>' +
      '        <div class="filter-badge" id="filter-badge"></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="stage-col">' +
      '      <div class="stage" id="stage">' +
      '        <div class="track" id="track"></div>' +
      '        <div class="empty" id="empty">' + this._t("state.initial") + '</div>' +
      '      </div>' +
      '      <div class="nav">' +
      '        <div class="arrow left" id="arrow-left" title="' + this._t("nav.prev") + '">' +
      '          <ha-icon icon="mdi:chevron-left"></ha-icon>' +
      '        </div>' +
      '        <div class="play-btn" id="play-btn" title="' + this._t("nav.play_pause") + '">' +
      '          <ha-icon id="play-btn-icon" icon="mdi:play"></ha-icon>' +
      '        </div>' +
      '        <div class="stop-btn" id="stop-btn" title="' + this._t("nav.stop") + '">' +
      '          <ha-icon icon="mdi:stop"></ha-icon>' +
      '        </div>' +
      '        <div class="arrow right" id="arrow-right" title="' + this._t("nav.next") + '">' +
      '          <ha-icon icon="mdi:chevron-right"></ha-icon>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="player-col">' +
      '      <div class="vol-btn up" id="vol-up" title="' + this._t("volume.up") + '">' +
      '        <ha-icon icon="mdi:volume-plus"></ha-icon>' +
      '      </div>' +
      '      <div class="player-chip" id="player-chip" title="' + this._t("player.tooltip") + '">' +
      '        <ha-icon icon="mdi:speaker"></ha-icon>' +
      '        <div class="name" id="player-name">-</div>' +
      '      </div>' +
      '      <div class="vol-btn down" id="vol-down" title="' + this._t("volume.down") + '">' +
      '        <ha-icon icon="mdi:volume-minus"></ha-icon>' +
      '      </div>' +
      '      <div class="filter-divider"></div>' +
      '      <div class="pb-row" id="playback-controls">' +
      '        <div class="pb-btn" id="pb-prev" title="' + this._t("playback.prev") + '"><ha-icon icon="mdi:skip-previous"></ha-icon></div>' +
      '        <div class="pb-btn" id="pb-next" title="' + this._t("playback.next") + '"><ha-icon icon="mdi:skip-next"></ha-icon></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid-view" id="grid-view">' +
      '    <div class="grid-back" id="grid-back" title="' + this._t("grid.close") + '"><ha-icon icon="mdi:close"></ha-icon></div>' +
      '    <div class="grid-view-scroll" id="grid-view-scroll">' +
      '      <div class="grid-cells" id="grid-cells"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="filter-panel" id="filter-panel">' +
      '    <h4><ha-icon icon="mdi:filter-variant"></ha-icon><span id="filter-title">Filter</span></h4>' +
      '    <div id="filter-rows"></div>' +
      '  </div>' +
      '  <div class="picker-backdrop" id="picker-backdrop"></div>' +
      '  <div class="picker" id="picker" style="display:none;">' +
      '    <h3>' + this._t("player.pick") + '</h3>' +
      '    <div id="picker-list"></div>' +
      '  </div>' +
      '</ha-card>';
    this._stage = root.getElementById("stage");
    this._track = root.getElementById("track");
    this._emptyEl = root.getElementById("empty");
    this._playerChip = root.getElementById("player-chip");
    this._playerName = root.getElementById("player-name");
    this._pickerBackdrop = root.getElementById("picker-backdrop");
    this._picker = root.getElementById("picker");
    this._pickerList = root.getElementById("picker-list");
    this._nowEl = root.getElementById("now");
    this._playerChip.addEventListener("click", () => this._openPicker());
    this._pickerBackdrop.addEventListener("click", () => this._closePicker());

    // Navigation arrows
    const arrowL = root.getElementById("arrow-left");
    const arrowR = root.getElementById("arrow-right");
    arrowL.addEventListener("click", () => {
      arrowL.classList.remove("pressed-left");
      void arrowL.offsetWidth;
      arrowL.classList.add("pressed-left");
      this._rotate(-1);
    });
    arrowR.addEventListener("click", () => {
      arrowR.classList.remove("pressed-right");
      void arrowR.offsetWidth;
      arrowR.classList.add("pressed-right");
      this._rotate(1);
    });

    // Play/Pause + Stop buttons
    this._playBtn = root.getElementById("play-btn");
    this._playBtnIcon = root.getElementById("play-btn-icon");
    this._stopBtn = root.getElementById("stop-btn");
    this._playBtn.addEventListener("click", () => {
      this._playBtn.classList.remove("bump");
      void this._playBtn.offsetWidth;
      this._playBtn.classList.add("bump");
      this._playOrPause();
    });
    this._stopBtn.addEventListener("click", () => {
      this._stopBtn.classList.remove("bump");
      void this._stopBtn.offsetWidth;
      this._stopBtn.classList.add("bump");
      this._stopPlayback();
    });

    // Playback queue controls (prev / next only)
    this._playbackControls = root.getElementById("playback-controls");
    this._pbPrev = root.getElementById("pb-prev");
    this._pbNext = root.getElementById("pb-next");

    // Grid view elements
    this._gridView = root.getElementById("grid-view");
    this._gridCells = root.getElementById("grid-cells");
    this._gridScroll = root.getElementById("grid-view-scroll");
    const gridBack = root.getElementById("grid-back");
    gridBack.addEventListener("click", () => this._closeGrid());
    const bumpAndCall = (btn, fn) => () => {
      btn.classList.remove("bump");
      void btn.offsetWidth;
      btn.classList.add("bump");
      fn();
    };
    this._pbPrev.addEventListener("click", bumpAndCall(this._pbPrev, () => this._playerSvc("media_previous_track")));
    this._pbNext.addEventListener("click", bumpAndCall(this._pbNext, () => this._playerSvc("media_next_track")));

    // Clock
    this._clockTime = root.getElementById("clock-time");
    this._clockSeconds = root.getElementById("clock-seconds");
    this._clockDate = root.getElementById("clock-date");
    this._updateClock();
    this._clockTimer = setInterval(() => this._updateClock(), 1000);

    // Category buttons (left side)
    this._catLabel = root.getElementById("cat-label");
    this._catIcon = root.getElementById("cat-icon");
    this._catText = root.getElementById("cat-text");
    this._filterBtn = root.getElementById("filter-btn");
    this._filterBadge = root.getElementById("filter-badge");
    this._filterPanel = root.getElementById("filter-panel");
    this._filterTitle = root.getElementById("filter-title");
    this._filterRows = root.getElementById("filter-rows");
    this._filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleFilterPanel();
    });
    // Clicks inside the panel must not bubble to backdrop/document
    this._filterPanel.addEventListener("click", (e) => e.stopPropagation());
    this._pickerBackdrop.addEventListener("click", () => this._closeFilterPanel());
    const catUp = root.getElementById("cat-up");
    const catDown = root.getElementById("cat-down");
    catUp.addEventListener("click", () => {
      catUp.classList.remove("bump-up");
      void catUp.offsetWidth;
      catUp.classList.add("bump-up");
      this._switchCategory(-1);
    });
    catDown.addEventListener("click", () => {
      catDown.classList.remove("bump-down");
      void catDown.offsetWidth;
      catDown.classList.add("bump-down");
      this._switchCategory(1);
    });

    // Volume buttons
    const volUp = root.getElementById("vol-up");
    const volDown = root.getElementById("vol-down");
    volUp.addEventListener("click", () => {
      volUp.classList.remove("bump-up");
      void volUp.offsetWidth;
      volUp.classList.add("bump-up");
      this._volume(1);
    });
    volDown.addEventListener("click", () => {
      volDown.classList.remove("bump-down");
      void volDown.offsetWidth;
      volDown.classList.add("bump-down");
      this._volume(-1);
    });
    this._stage.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this._stage.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this._stage.addEventListener("pointerup", (e) => this._onPointerEnd(e));
    this._stage.addEventListener("pointercancel", (e) => this._onPointerEnd(e));
    this._stage.tabIndex = 0;
    this._stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this._rotate(-1);
      else if (e.key === "ArrowRight") this._rotate(1);
      else if (e.key === " " || e.key === "Enter") this._togglePlay();
    });
    this._built = true;
    this._resolvedLang = this._lang();
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async _initialLoad() {
    const debug = this._config?.debug === true;
    const log = (...a) => debug && console.log("[dynamic-radiocard]", ...a);
    await Promise.all([this._loadCategory(this._activeCategory()), this._loadPlayers()]);
    this._initialized = true;
    this._updateCategoryLabel();
    await this._fetchFilterValuesViaMA(this._activeCategory(), log);
    this._renderCarousel();
    this._renderPlayer();
  }

  _switchCategory(delta) {
    const len = CATEGORIES.length;
    const newIdx = (this._catIdx + delta + len) % len;
    if (newIdx === this._catIdx) return;
    // Cache current center index for current category
    this._centerByCategory[this._activeCategory().key] = this._centerIdx;
    this._catIdx = newIdx;
    try { localStorage.setItem(STORAGE_KEY_CATEGORY, this._activeCategory().key); } catch (e) {}

    // Animate label flip
    const flipClass = delta > 0 ? "flip-down" : "flip-up";
    this._catLabel.classList.remove("flip-up", "flip-down");
    void this._catLabel.offsetWidth;
    this._catLabel.classList.add(flipClass);

    this._updateCategoryLabel();
    // Use cached items if available, otherwise load
    const cat = this._activeCategory();
    const cached = this._itemsByCategory[cat.key];
    if (cached) {
      this._radios = cached;
      this._centerIdx = this._centerByCategory[cat.key] || 0;
      this._renderCarousel();
    } else {
      this._radios = [];
      this._centerIdx = 0;
      this._loadingRadios = true;
      this._renderCarousel();
      this._loadCategory(cat).then(async () => {
        const debug = this._config?.debug === true;
        const log = (...a) => debug && console.log("[dynamic-radiocard]", ...a);
        await this._fetchFilterValuesViaMA(cat, log);
        this._renderCarousel();
      });
    }
    // For cached categories, also refresh providers/genres once (in case list grew)
    if (cached) {
      const debug = this._config?.debug === true;
      const log = (...a) => debug && console.log("[dynamic-radiocard]", "[" + cat.key + "]", ...a);
      this._fetchFilterValuesViaMA(cat, log).then(() => this._renderCarousel());
    }
  }

  _updateCategoryLabel() {
    const cat = this._activeCategory();
    if (this._catIcon) this._catIcon.setAttribute("icon", cat.icon);
    if (this._catText) this._catText.textContent = this._t("category." + cat.key);
    // Playback controls visibility depends on category (hidden for radio)
    this._renderPlaybackControls();
  }

  async _loadCategory(cat) {
    if (!this._hass) return;
    this._loadingRadios = true;
    const debug = this._config?.debug === true;
    const log = (...a) => debug && console.log("[dynamic-radiocard]", "[" + cat.key + "]", ...a);

    await this._discoverMaPlayers(log);  // singleton - safe to always await
    // Whether the current provider filter is a no-op for this category.
    // Fallback strategies below may only treat the loaded set as the "full"
    // cache when it is genuinely unfiltered. (Fixes a long-standing bug where
    // isUnfiltered was referenced but never defined, silently killing the
    // service/browse_media fallbacks inside their try/catch blocks.)
    const activeSet = this._activeByCategory[cat.key];
    const provList = this._providersByCategory[cat.key] || [];
    const isUnfiltered = !activeSet || !provList.length || activeSet.size === provList.length;

    // Strategy 0: MA-native WebSocket via Hassio Ingress (full data, supports filters)
    const maClient = this._getMaClient();
    if (maClient && !maClient.disabled && cat.ma_items_cmd) {
      try {
        const items = await this._maWsLoadItems(cat, maClient, log);
        if (Array.isArray(items) && items.length) {
          const normFull = items.map((r) => this._normalizeRadio(r));
          this._radios = normFull;
          this._itemsByCategory[cat.key] = normFull;
          this._fullItemsByCategory[cat.key] = normFull;
          if (this._itemRetries) this._itemRetries[cat.key] = 0;
          log("loaded via MA WS:", normFull.length, "items");
          this._loadingRadios = false;
          this._fetchFilterValuesViaMA(cat, log);
          return;
        }
      } catch (e) {
        log("MA WS failed -> fall back to HA service:", e?.message || e);
      }
    }

    // Strategy 1: HA service (only useful if config_entry_id is known)
    if (this._maConfigEntryId) {
      try {
        const favoritesOnly = this._favoritesOnlyFor(cat.key);
        const svcData = {
          config_entry_id: this._maConfigEntryId,
          media_type: cat.media_type,
          limit: MAX_ITEMS_PER_CATEGORY,
        };
        if (favoritesOnly) svcData.favorite = true;
        const result = await this._hass.callWS({
          type: "call_service",
          domain: "music_assistant",
          service: "get_library",
          service_data: svcData,
          return_response: true,
        });
        const resp = result?.response;
        let items = [];
        if (Array.isArray(resp)) items = resp;
        else if (Array.isArray(resp?.items)) items = resp.items;
        else if (resp && typeof resp === "object") {
          for (const v of Object.values(resp)) {
            if (Array.isArray(v)) { items = v; break; }
            if (Array.isArray(v?.items)) { items = v.items; break; }
          }
        }
        if (items.length) {
          const norm = items.slice(0, MAX_ITEMS_PER_CATEGORY).map((r) => this._normalizeRadio(r));
          this._radios = norm;
          this._itemsByCategory[cat.key] = norm;
          if (isUnfiltered) this._fullItemsByCategory[cat.key] = norm;
          if (this._itemRetries) this._itemRetries[cat.key] = 0;
          log("loaded via service", norm.length, isUnfiltered ? "(full)" : "(filtered)");
          this._loadingRadios = false;
          this._fetchFilterValuesViaMA(cat, log).then(() => this._renderCarousel());
          return;
        }
      } catch (e) {
        log("get_library failed", e?.message || e);
      }
    }

    // Strategy 2: browse_media tree - try multiple MA players until one responds
    const candidates = this._maPlayersByAvailability();
    if (!candidates.length) {
      log("no MA player available");
      this._radios = [];
      this._itemsByCategory[cat.key] = [];
      this._loadingRadios = false;
      return;
    }

    for (const player of candidates) {
      try {
        log("trying browse_media via", player);
        const found = await this._browseLibrary(player, cat, log);
        if (found.length) {
          const limited = found.slice(0, MAX_ITEMS_PER_CATEGORY);
          this._radios = limited;
          this._itemsByCategory[cat.key] = limited;
          if (isUnfiltered) this._fullItemsByCategory[cat.key] = limited;
          log("loaded via browse_media", limited.length, "from", player);
          this._loadingRadios = false;
          this._fetchFilterValuesViaMA(cat, log).then(() => this._renderCarousel());
          return;
        }
      } catch (e) {
        log("browse_media via", player, "failed:", e?.message || e);
      }
    }

    // Auto-retry with backoff if MA hasn't returned items yet (still booting / no auth)
    const backoffs = [2000, 4000, 7000, 12000];
    const n = (this._itemRetries && this._itemRetries[cat.key]) || 0;
    if (n < backoffs.length) {
      this._itemRetries = this._itemRetries || {};
      this._itemRetries[cat.key] = n + 1;
      log("0 items found - retrying in", backoffs[n] + "ms (attempt", n + 1, ")");
      this._loadingRadios = true;
      setTimeout(() => {
        this._loadCategory(cat).then(() => this._renderCarousel());
      }, backoffs[n]);
      return;
    }

    log("no items found after retry");
    this._radios = [];
    this._itemsByCategory[cat.key] = [];
    this._loadingRadios = false;
  }

  // -------- Provider discovery & filtering (per category) --------

  // Extract providers from a list of items (using as much metadata as available)
  _extractProvidersFromItems(items, log) {
    const found = new Map();
    let logged = 0;
    items.forEach((it) => {
      // First-time debug: dump raw structure so we can refine extraction
      if (log && logged === 0 && it.raw) {
        try { log("sample raw:", JSON.stringify(it.raw).slice(0, 800)); } catch (e) {}
        logged = 1;
      }
      this._itemProviderDescriptors(it).forEach((d) => {
        if (!found.has(d.id)) found.set(d.id, d);
      });
    });
    return Array.from(found.values());
  }

  // Returns full descriptors {id, name, icon, domain} for an item's providers.
  // Order of preference:
  //   1. provider_mappings array (richest data)
  //   2. top-level provider_instance / provider_domain / provider fields
  //   3. provider= query parameter in the item.image URL  (works for Plex et al.)
  //   4. external image hostname  (works for direct CDN-served items)
  //   5. URI scheme  (e.g. spotify:// or library://)
  //   6. "library" fallback
  _itemProviderDescriptors(item) {
    const out = new Map();
    const r = item.raw || {};
    const add = (id, name, domain) => {
      if (!id) return;
      const idStr = String(id);
      const idLower = idStr.toLowerCase();
      if (out.has(idLower)) return;
      const dKey = String(domain || idStr).toLowerCase();
      const meta = PROVIDER_META[dKey] || PROVIDER_META[idLower] || {};
      out.set(idLower, {
        id: idLower,                  // lowercased - used as map/set key
        raw_id: idStr,                // original case - used in MA filter args
        name: name || meta.name || idStr,
        icon: meta.icon || PROVIDER_FALLBACK_ICON,
        domain: dKey,
      });
    };

    // 1. provider_mappings array (full structured form)
    if (Array.isArray(r.provider_mappings)) {
      r.provider_mappings.forEach((m) => {
        const inst = m.provider_instance || m.provider_instance_id;
        const dom = m.provider_domain || m.provider;
        const name = m.provider_name || m.name || inst || dom;
        add(inst || dom, name, dom);
      });
    }
    // 2. top-level fields
    if (r.provider_instance) {
      add(r.provider_instance, r.provider_name || r.provider_instance, r.provider_domain || r.provider);
    }
    if (r.provider && !r.provider_instance && !Array.isArray(r.provider_mappings)) {
      add(r.provider, r.provider_name || r.provider, r.provider);
    }
    if (r.provider_domain && !r.provider_instance) {
      add(r.provider_domain, r.provider_name || r.provider_domain, r.provider_domain);
    }

    // 3. Image URL ?provider=... (e.g. plex--GCjhCPCi, builtin--xyz)
    if (!out.size) {
      const img = item.image || r.image || "";
      if (img) {
        const m = img.match(/[?&]provider=([^&#]+)/);
        if (m) {
          const ps = decodeURIComponent(m[1]);
          const dashIdx = ps.indexOf("--");
          const dom = dashIdx > 0 ? ps.substring(0, dashIdx) : ps;
          // Display: show full instance_id so user can verify against MA;
          // the registry lookup later replaces it with the proper name.
          add(ps, ps, dom);
        } else {
          // 4. external image hostname
          try {
            const url = new URL(img);
            const host = url.hostname.toLowerCase()
              .replace(/^(www\.|api\.|static\.|cdn\.|img\.|images\.)/, "");
            const isLocal = url.hostname.startsWith("192.168.") || url.hostname.startsWith("10.")
              || url.hostname.startsWith("172.") || url.hostname === "localhost";
            if (host && !isLocal) {
              add(host, host, host);
            }
          } catch (e) { /* not a parseable URL */ }
        }
      }
    }

    // 5. URI scheme fallback
    if (!out.size) {
      const uri = (item.uri || "").toLowerCase();
      const scheme = uri.split("://")[0];
      if (scheme && scheme !== "library") add(scheme, undefined, scheme);
    }

    // 6. ultimate fallback
    if (!out.size) add("library", "Bibliothek", "library");
    return Array.from(out.values());
  }

  // What provider IDs does this single item belong to (used for filtering)
  _itemProviderIds(item) {
    return this._itemProviderDescriptors(item).map((d) => d.id);
  }

  async _loadMaProviderConfigsOnce(log) {
    if (this._providerConfigLoaded) return;
    this._providerConfigLoaded = true;

    // (a) Try various MA service names that might exist
    const services = ["get_provider_configs", "get_providers", "get_music_providers", "providers"];
    for (const svc of services) {
      if (!this._maConfigEntryId) break;
      try {
        const r = await this._hass.callWS({
          type: "call_service",
          domain: "music_assistant",
          service: svc,
          service_data: { config_entry_id: this._maConfigEntryId },
          return_response: true,
        });
        const list = r?.response?.provider_configs || r?.response?.providers || r?.response;
        if (Array.isArray(list) && list.length) {
          this._providerConfigList = list;
          log("provider list via service " + svc + ":", list.length);
          break;
        }
      } catch (e) { /* try next */ }
    }

    // (b) Try device registry as a secondary source - each MA provider instance is registered as a device
    try {
      const devices = await this._hass.callWS({ type: "config/device_registry/list" });
      const maDevs = devices.filter((d) =>
        Array.isArray(d.config_entries) && this._maConfigEntryId &&
        d.config_entries.includes(this._maConfigEntryId)
      );
      log("MA devices total:", maDevs.length);
      if (maDevs.length) {
        log("device sample:", JSON.stringify(maDevs[0]).slice(0, 600));
      }
      this._maDeviceList = maDevs;
    } catch (e) { log("device registry failed:", e?.message || e); }
  }

  _enrichProvidersFromConfigs(provs) {
    const list = Array.isArray(this._providerConfigList) ? this._providerConfigList : [];
    const devs = Array.isArray(this._maDeviceList) ? this._maDeviceList : [];
    return provs.map((p) => {
      // Try config list first
      const conf = list.find(
        (c) => (c.instance_id && c.instance_id.toLowerCase() === p.id)
            || (c.id && c.id.toLowerCase() === p.id)
            || (c.domain && c.domain.toLowerCase() === p.domain)
      );
      if (conf) {
        const meta = PROVIDER_META[(conf.domain || "").toLowerCase()] || {};
        return { ...p, name: conf.name || conf.title || p.name, icon: meta.icon || p.icon };
      }
      // Try device list - match by identifier substring or by domain/model
      const dev = devs.find((d) => {
        const ids = (d.identifiers || []).map((i) => i.join(":").toLowerCase());
        const model = (d.model || "").toLowerCase();
        const name = (d.name || "").toLowerCase();
        return ids.some((s) => s.includes(p.id))
            || model === p.domain
            || name.includes(p.id)
            || name.includes(p.domain);
      });
      if (dev) {
        const meta = PROVIDER_META[p.domain] || {};
        return { ...p, name: dev.name_by_user || dev.name || p.name, icon: meta.icon || p.icon };
      }
      return p;
    });
  }

  async _refreshProvidersForCategory(catKey, log) {
    const items = this._itemsByCategory[catKey] || [];
    if (!items.length) {
      this._providersByCategory[catKey] = [];
      this._renderFilterButton();
      return;
    }
    await this._loadMaProviderConfigsOnce(log);
    let provs = this._extractProvidersFromItems(items, log);
    provs = this._enrichProvidersFromConfigs(provs);

    this._providersByCategory[catKey] = provs;

    // Initialize active set if first time for this category
    if (!this._catInitialized[catKey]) {
      this._activeByCategory[catKey] = new Set(provs.map((p) => p.id));
      this._catInitialized[catKey] = true;
      this._saveProviderState();
    } else {
      // Add any new provider not yet in active list (default: enabled)
      const active = this._activeByCategory[catKey] || new Set();
      let changed = false;
      provs.forEach((p) => {
        if (!active.has(p.id) && !this._explicitlyDisabledProvider(catKey, p.id)) {
          active.add(p.id);
          changed = true;
        }
      });
      this._activeByCategory[catKey] = active;
      if (changed) this._saveProviderState();
    }
    log("providers for", catKey, ":", provs.map((p) => p.name + " (" + p.id + ")"));
    this._renderFilterButton();
  }

  // Track explicit disables so re-discovery doesn't re-enable a switched-off provider.
  _explicitlyDisabledProvider(catKey, id) {
    // We mark a provider as "explicitly disabled" by storing an extra entry.
    // Simpler: if catKey was initialized AND id is missing from active, treat it as explicit.
    return this._catInitialized[catKey] === true;
  }

  _saveProviderState() {
    try {
      const obj = {};
      Object.entries(this._activeByCategory).forEach(([k, set]) => {
        obj[k] = [...set];
      });
      localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(obj));
    } catch (e) {}
  }

  // Apply current active filter to the cached full set (no network query).
  // This keeps row counts, header count and the displayed set consistent.
  _applyClientFilter(cat) {
    const full = this._fullItemsByCategory[cat.key] || [];
    const active = this._activeByCategory[cat.key];
    const provs = this._providersByCategory[cat.key] || [];
    let filtered;
    if (!provs.length || !active) {
      filtered = full;
    } else if (active.size === 0) {
      filtered = [];                       // user deselected everything
    } else if (active.size === provs.length) {
      filtered = full;                     // all active = no filter
    } else {
      filtered = full.filter((it) => {
        const ids = this._itemProviderIds(it);
        return ids.some((id) => active.has(id));
      });
    }
    const display = filtered.slice(0, MAX_ITEMS_PER_CATEGORY);
    this._radios = display;
    this._itemsByCategory[cat.key] = display;
    // Reset center if it'd be out of range
    if (this._centerIdx >= display.length) this._centerIdx = 0;
  }

  // Re-apply filter and re-render (used after filter toggle - no network)
  _reloadCurrentCategory() {
    const cat = this._activeCategory();
    this._applyClientFilter(cat);
    this._renderCarousel();
    this._renderFilterRows();
  }

  _toggleFilterPanel() {
    if (this._filterPanel.classList.contains("open")) {
      this._closeFilterPanel();
    } else {
      this._openFilterPanel();
    }
  }

  _openFilterPanel() {
    this._renderFilterRows();
    this._pickerBackdrop.classList.add("open");
    this._filterPanel.classList.add("open");
  }

  _closeFilterPanel() {
    this._filterPanel.classList.remove("open");
    if (!this._picker || this._picker.style.display !== "block") {
      this._pickerBackdrop.classList.remove("open");
    }
  }

  _renderFilterRows() {
    const cat = this._activeCategory();
    const provs = this._providersByCategory[cat.key] || [];
    const active = this._activeByCategory[cat.key] || new Set();
    const fullItems = this._fullItemsByCategory[cat.key] || this._itemsByCategory[cat.key] || [];

    // Header count: full items that pass the current active filter
    // (single source of truth shared with row counts below)
    let visibleCount;
    if (!provs.length || !active.size) {
      visibleCount = active.size === 0 ? 0 : fullItems.length;
    } else if (active.size === provs.length) {
      visibleCount = fullItems.length;
    } else {
      visibleCount = fullItems.filter((it) =>
        this._itemProviderIds(it).some((id) => active.has(id))
      ).length;
    }

    if (this._filterTitle) {
      this._filterTitle.textContent = this._t("category." + cat.key) + " (" + visibleCount + ")";
    }
    this._filterRows.innerHTML = "";
    if (!provs.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:14px; text-align:center; color:var(--secondary-text-color); font-size:12px;";
      empty.textContent = this._t("filter.empty");
      this._filterRows.appendChild(empty);
      return;
    }
    // "Alle" toggle row
    const allRow = document.createElement("div");
    const allActive = provs.length > 0 && active.size === provs.length;
    const noneActive = active.size === 0;
    allRow.className = "filter-row all-row" + (allActive ? " active" : "");
    allRow.innerHTML =
      '<div class="check"><ha-icon icon="' + (noneActive ? "mdi:checkbox-blank-outline" : (allActive ? "mdi:check" : "mdi:minus")) + '"></ha-icon></div>' +
      '<ha-icon class="prov-icon" icon="mdi:select-all"></ha-icon>' +
      '<div class="label">' + this._t("filter.all") + '</div>' +
      '<div class="count">' + fullItems.length + '</div>';
    allRow.addEventListener("click", (e) => {
      e.stopPropagation();
      // Re-read current state (closure capture might be stale after re-renders)
      const cur = this._activeByCategory[cat.key] || new Set();
      const isAll = cur.size === provs.length;
this._activeByCategory[cat.key] = isAll ? new Set() : new Set(provs.map((p) => p.id));
      this._saveProviderState();
      this._renderFilterRows();
      this._renderFilterButton();
      this._reloadCurrentCategory();
    });
    this._filterRows.appendChild(allRow);
    // Per-provider rows - count from the FULL set so numbers are stable
    provs.forEach((p) => {
      const row = document.createElement("div");
      const isActive = active.has(p.id);
      row.className = "filter-row" + (isActive ? " active" : "");
      const count = fullItems.filter((it) => this._itemProviderIds(it).includes(p.id)).length;
      row.innerHTML =
        '<div class="check"><ha-icon icon="mdi:check"></ha-icon></div>' +
        '<ha-icon class="prov-icon" icon="' + p.icon + '"></ha-icon>' +
        '<div class="label">' + this._escape(p.name) + '</div>' +
        '<div class="count">' + count + '</div>';
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const set = this._activeByCategory[cat.key] || new Set();
        const wasActive = set.has(p.id);
if (wasActive) set.delete(p.id);
        else set.add(p.id);
        this._activeByCategory[cat.key] = set;
        this._saveProviderState();
        this._renderFilterRows();
        this._renderFilterButton();
        this._reloadCurrentCategory();
      });
      this._filterRows.appendChild(row);
    });
  }

  _renderFilterButton() {
    if (!this._filterBtn || !this._filterBadge) return;
    const cat = this._activeCategory();
    const provs = this._providersByCategory[cat.key] || [];
    const active = this._activeByCategory[cat.key] || new Set();
    const filtered = provs.length > 0 && active.size > 0 && active.size < provs.length;
    const allOff = provs.length > 0 && active.size === 0;
    this._filterBtn.classList.toggle("has-filter", filtered || allOff);
    if (filtered) {
      this._filterBadge.textContent = active.size + "/" + provs.length;
    } else if (allOff) {
      this._filterBadge.textContent = "0";
    } else {
      this._filterBadge.textContent = "";
    }
  }

  _filteredItems(items) {
    const cat = this._activeCategory();
    const provs = this._providersByCategory[cat.key] || [];
    const active = this._activeByCategory[cat.key];
    if (!provs.length || !active) return items;
    if (active.size === 0) return [];
    if (active.size === provs.length) return items;
    // When the MA WS is available, items are already server-side filtered.
    // Client-side filter only when we don't reload via WS.
    return items.filter((it) => {
      const ids = this._itemProviderIds(it);
      return ids.some((id) => active.has(id));
    });
  }

  // Active filter values translated to the WS arg shape (e.g. genre: [62,61])
  _activeFilterArgList(cat) {
    const provs = this._providersByCategory[cat.key] || [];
    const active = this._activeByCategory[cat.key];
    if (!provs.length || !active) return null;
    if (active.size === 0) return null;
    if (active.size === provs.length) return null; // no filtering = omit arg
    // For genre: arg expects numeric item_ids; for provider: original-case strings
    const result = [];
    provs.forEach((p) => {
      if (!active.has(p.id)) return;
      if (cat.filter_kind === "genre" && p.raw_id) {
        result.push(parseInt(p.raw_id, 10));
      } else {
        // Provider: prefer registry's exact instance_id (original case)
        const reg = this._lookupProvider(p.raw_id || p.id);
        result.push(reg?.instance_id || p.raw_id || p.id);
      }
    });
    return result;
  }

  // Loaded once per session: full MA provider registry (instance_id -> name)
  async _loadProviderRegistry(maClient, log) {
    if (Array.isArray(this._providerRegistry) && this._providerRegistry.length > 0) {
      return this._providerRegistry;
    }
    // Try cached registry from localStorage for instant first-render
    if (!this._providerRegistryTriedCache) {
      this._providerRegistryTriedCache = true;
      try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || "null");
        if (Array.isArray(cached) && cached.length) {
          this._providerRegistry = cached;
          // Refresh in background (don't await)
          this._refreshProviderRegistry(maClient, log);
          return cached;
        }
      } catch (e) { /* ignore */ }
    }
    if (this._providerRegistryPromise) return this._providerRegistryPromise;
    this._providerRegistryPromise = this._refreshProviderRegistry(maClient, log);
    return this._providerRegistryPromise;
  }

  async _refreshProviderRegistry(maClient, log) {
    try {
      const r = await maClient.send("providers");
      if (Array.isArray(r)) {
        this._providerRegistry = r;
        try { localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(r)); } catch (e) {}
        log("provider registry:", r.length, "entries");
      } else {
        log("provider registry: unexpected response shape");
        if (!this._providerRegistry) this._providerRegistry = [];
      }
    } catch (e) {
      log("providers fetch failed:", e?.message || e);
      if (!this._providerRegistry) this._providerRegistry = [];
    } finally {
      this._providerRegistryPromise = null;
    }
    return this._providerRegistry;
  }

  _lookupProvider(idOrDomain) {
    const reg = this._providerRegistry;
    if (!Array.isArray(reg) || !idOrDomain) return null;
    const lower = String(idOrDomain).toLowerCase();
    return reg.find((p) =>
      (p.instance_id || "").toLowerCase() === lower ||
      (p.lookup_key || "").toLowerCase() === lower ||
      (p.domain || "").toLowerCase() === lower
    ) || null;
  }

  // Fetch genre or provider list via MA WebSocket; falls back to extraction.
  async _fetchFilterValuesViaMA(cat, log) {
    // If a filter is currently applied AND we already have the full provider list,
    // don't rebuild - that would shrink the dropdown to only the active provider's items.
    const activeIds = this._activeFilterArgList(cat);
    if (activeIds && activeIds.length && this._providersByCategory[cat.key]?.length) {
      log("skip provider-list rebuild (filter active)");
      return;
    }

    const maClient = this._getMaClient();
    let values = null;

    // 1) Try MA WS (only if not disabled)
    if (maClient && !maClient.disabled) {
      try {
        values = await this._fetchFilterValuesMA_WS(cat, maClient, log);
      } catch (e) {
        log("MA WS filter fetch failed:", e?.message || e);
      }
    }

    // 2) Fallback: extract from items
    if (!values || !values.length) {
      const items = this._itemsByCategory[cat.key] || [];
      const extracted = this._extractProvidersFromItems(items, log);
      values = this._enrichProvidersFromConfigs(extracted);
      // Try to enrich with MA registry if we have it (might have loaded later)
      if (this._providerRegistry?.length) {
        values = values.map((p) => {
          const reg = this._lookupProvider(p.raw_id || p.id) || this._lookupProvider(p.domain);
          return reg ? { ...p, name: reg.name || p.name } : p;
        });
      }
      log("filter values for", cat.key, "via fallback extraction:", values.length,
          "registry size:", this._providerRegistry?.length || 0);
    }

    // 3) User-configured names always win (highest priority)
    values = values.map((p) => {
      const cfg = this._configuredProviderName(p.raw_id || p.id);
      return cfg ? { ...p, name: cfg } : p;
    });

    if (!values || !values.length) return;

    this._providersByCategory[cat.key] = values;
    if (!this._catInitialized[cat.key]) {
      // First time we discover providers for this category: activate all by default
      this._activeByCategory[cat.key] = new Set(values.map((v) => v.id));
      this._catInitialized[cat.key] = true;
      this._saveProviderState();
    }
    // else: keep user's explicit active set (do NOT auto-add - that would undo
    // a user's "deselect all" action by re-adding all providers).
    log("filter values for", cat.key, ":", values.map((v) => v.name));
    this._renderFilterButton();
    // If dropdown is currently open, refresh its rows so new names appear live
    if (this._filterPanel && this._filterPanel.classList.contains("open")) {
      this._renderFilterRows();
    }
  }

  async _fetchFilterValuesMA_WS(cat, maClient, log) {
    let values = [];
    if (cat.filter_kind === "genre") {
      const r = await maClient.send("music/genres/library_items", {
        limit: 200, offset: 0, order_by: "name", hide_empty: true, media_type: cat.media_type,
      });
      if (Array.isArray(r)) {
        values = r.map((g) => ({
          id: "genre:" + g.item_id,
          raw_id: g.item_id,
          name: g.name,
          icon: "mdi:tag",
          domain: "genre",
        }));
      }
    } else if (cat.filter_kind === "provider") {
      // Make sure we have the registry for proper display names
      await this._loadProviderRegistry(maClient, log);
      const items = this._itemsByCategory[cat.key] || [];
      const map = new Map();
      items.forEach((it) => {
        (it.raw?.provider_mappings || []).forEach((m) => {
          const dom = m.provider_domain || m.provider;
          const inst = m.provider_instance || dom;
          if (!inst) return;
          const idStr = String(inst);
          const idLower = idStr.toLowerCase();
          if (!map.has(idLower)) {
            const reg = this._lookupProvider(idStr) || this._lookupProvider(dom);
            const meta = PROVIDER_META[(reg?.domain || dom || "").toLowerCase()] || {};
            const userName = this._configuredProviderName(idStr);
            map.set(idLower, {
              id: idLower,
              raw_id: reg?.instance_id || idStr,
              name: userName || reg?.name || meta.name || dom || idStr,
              icon: meta.icon || PROVIDER_FALLBACK_ICON,
              domain: reg?.domain || dom,
            });
          }
        });
      });
      values = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    return values;
  }

  async _discoverMaPlayers(log) {
    // Singleton: parallel callers all wait on the same promise
    if (this._maDiscoveryPromise) return this._maDiscoveryPromise;
    this._maDiscoveryPromise = (async () => {
      this._maPlayerIds = [];
      this._maConfigEntryId = null;
      try {
        const entities = await this._hass.callWS({ type: "config/entity_registry/list" });
        const maEnts = entities.filter(
          (e) => e.platform === "music_assistant" && e.entity_id.startsWith("media_player.")
        );
        this._maPlayerIds = maEnts.map((e) => e.entity_id);
        this._maConfigEntryId = maEnts[0]?.config_entry_id || null;
        log("Discovered MA players:", this._maPlayerIds, "config_entry_id:", this._maConfigEntryId);
      } catch (e) {
        log("entity_registry/list failed:", e?.message || e);
      }
      // Try to read MA host directly from config_entry data (fastest path)
      try {
        const cfgEntries = await this._hass.callWS({ type: "config_entries/get" });
        const ma = cfgEntries.find((e) => e.domain === "music_assistant");
        const url = ma?.data?.url || ma?.data?.host;
        if (url) {
          let hostStr = String(url);
          try { const u = new URL(hostStr); hostStr = u.host; }
          catch (e) { /* may already be host:port */ }
          if (hostStr) {
            this._sniffedHost = hostStr;
            if (this._maWS) this._maWS.setDirectHost(hostStr);
            log("MA host from config_entry:", hostStr);
          }
        }
      } catch (e) {
        log("config_entries/get failed:", e?.message || e);
      }
    })();
    return this._maDiscoveryPromise;
  }

  // Returns MA players ordered by likelihood of working: state != unavailable first
  _maPlayersByAvailability() {
    const ids = this._maPlayerIds || [];
    const states = this._hass?.states || {};
    const available = ids.filter((id) => {
      const s = states[id]?.state;
      return s && s !== "unavailable" && s !== "unknown";
    });
    const others = ids.filter((id) => !available.includes(id));
    return [...available, ...others];
  }

  async _browseLibrary(entity_id, cat, log) {
    const seen = new Set();
    const result = [];

    // STRICT match: relies on media_content_id structure or exact class.
    // No title/keyword matching (caused cross-category contamination).
    const isCategoryItem = (c) => {
      if (!c.can_play) return false;
      const cid = (c.media_content_id || "").toLowerCase();
      const cls = (c.media_class || "").toLowerCase();
      const ct = (c.media_content_type || "").toLowerCase();
      // strongest signal: URI prefix
      if (cid.startsWith("library://" + cat.key + "/")) return true;
      if (cid.startsWith(cat.key + "://")) return true;
      // for some MA versions, the URI uses plural
      if (cat.paths.some((p) => cid.startsWith(p.toLowerCase() + "/"))) return true;
      // class/type exact match (lowercased)
      if (cat.classes.map((s) => s.toLowerCase()).includes(cls)) return true;
      if (cat.classes.map((s) => s.toLowerCase()).includes(ct)) return true;
      return false;
    };

    // Looser test for navigating into folders (only used for tree walk)
    const isCategoryFolder = (c) => {
      if (!c.can_expand) return false;
      const cid = (c.media_content_id || "").toLowerCase();
      const title = (c.title || "").toLowerCase();
      if (cat.paths.some((p) => cid === p.toLowerCase())) return true;
      if (cid.startsWith("library://" + cat.key)) return true;
      if (cat.keywords.some((k) => title === k || title.startsWith(k + " ") || title.endsWith(" " + k))) return true;
      return title.includes("favorit") || title.includes("library");
    };

    // Direct paths
    for (const p of cat.paths) {
      try {
        const r = await this._hass.callWS({
          type: "media_player/browse_media",
          entity_id,
          media_content_type: "directory",
          media_content_id: p,
        });
        if (r?.children?.length) {
          log("direct browse", p, "->", r.children.length, "children");
          for (const c of r.children) {
            const cid = c.media_content_id;
            if (seen.has(cid)) continue;
            if (!isCategoryItem(c)) continue;
            seen.add(cid);
            result.push({
              uri: cid,
              name: c.title,
              image: c.thumbnail || null,
              media_type: cat.media_type,
            });
            if (result.length >= MAX_ITEMS_PER_CATEGORY) return result;
          }
          log("after filter", p, "->", result.length, "matching items");
          if (result.length) return result;
        } else {
          log("direct browse", p, "-> no children");
        }
      } catch (e) {
        log("direct browse", p, "failed:", e?.message || e);
      }
    }

    // Tree walk fallback
    const wsCall = (id) => this._hass.callWS({
      type: "media_player/browse_media",
      entity_id,
      ...(id ? { media_content_type: "", media_content_id: id } : {}),
    });
    const visited = new Set();
    const queue = [{ id: undefined, depth: 0 }];
    let calls = 0;
    while (queue.length && calls < 30 && result.length < MAX_ITEMS_PER_CATEGORY) {
      const { id, depth } = queue.shift();
      if (id && visited.has(id)) continue;
      if (id) visited.add(id);
      let node;
      try {
        node = await wsCall(id);
        calls++;
      } catch (e) {
        log("wsCall failed for id=" + (id || "<root>") + ":", e?.message || e);
        continue;
      }
      if (!node?.children) {
        if (calls === 1) log("root browse returned no children for", entity_id);
        continue;
      }
      for (const c of node.children) {
        const cid = c.media_content_id || "";
        if (isCategoryItem(c)) {
          if (!seen.has(cid)) {
            seen.add(cid);
            result.push({
              uri: cid, name: c.title, image: c.thumbnail || null, media_type: cat.media_type,
            });
            if (result.length >= MAX_ITEMS_PER_CATEGORY) return result;
          }
        } else if (depth < 3 && (isCategoryFolder(c) || depth === 0)) {
          queue.push({ id: cid, depth: depth + 1 });
        }
      }
    }
    log("Tree walk found", result.length, "items in", calls, "calls");
    return result;
  }

  // Canonical MA imageproxy URL (schema >= 2.8):
  //   http://<host>/imageproxy/<proxy_id>?size=512&fmt=jpeg
  // proxy_id is a 64-hex sha256 computed by MA from (provider, path). It comes
  // with every MediaItemImage the server sends us. Allowed sizes: 0, 80, 160,
  // 256, 512, 1024 - other values return 400.
  _buildImageProxyByIdUrl(host, proxyId) {
    return "http://" + host + "/imageproxy/" + proxyId + "?size=512&fmt=jpeg";
  }

  _normalizeRadio(r) {
    // Image may be:
    //  (a) full http(s) URL with /imageproxy? path - use as-is
    //  (b) plain metadata image object - we have metadata.images[].path + .provider
    //  (c) bare relative path like "library/metadata/<id>/thumb/<ts>" - need to build
    //      an imageproxy URL pointing to MA host
    let image = null;
    const imgs = Array.isArray(r.metadata?.images) ? r.metadata.images : null;
    // Prefer the thumb image (that's what our small carousel tiles need)
    const thumb = imgs && (imgs.find((i) => i && i.type === "thumb") || imgs[0]);
    const host = this._sniffedHost || (this._maWS && this._maWS._directHost) || null;

    // Priority 1: canonical /imageproxy/<proxy_id> URL - MA schema >= 2.8
    if (thumb && thumb.proxy_id && host) {
      image = this._buildImageProxyByIdUrl(host, thumb.proxy_id);
    }
    // Priority 2: remotely accessible image URL (external CDN etc.)
    else if (thumb && thumb.remotely_accessible && typeof thumb.path === "string" && /^https?:\/\//i.test(thumb.path)) {
      image = thumb.path;
    }
    // Priority 3: top-level image string (older MA versions)
    else if (typeof r.image === "string") image = r.image;
    else if (typeof r.image_url === "string") image = r.image_url;
    else if (typeof r.metadata?.image === "string") image = r.metadata.image;
    // Sniff MA host ONLY from URLs that match MA's imageproxy pattern
    // (e.g. "http://192.168.1.5:8095/imageproxy?path=...&provider=plex--..."). External
    // stream URLs (icecast, ardmediathek etc.) must not be picked up here.
    if (image && !this._sniffedHost) {
      try {
        const u = new URL(image);
        const isMaImageProxy =
          u.pathname.includes("/imageproxy") &&
          (u.searchParams.has("provider") || u.searchParams.has("path"));
        if (isMaImageProxy) {
          this._sniffedHost = u.host;
          if (this._maWS) this._maWS.setDirectHost(u.host);
        }
      } catch (e) { /* ignore */ }
    }
    return {
      uri: r.uri || r.item_id || r.media_content_id || r.id,
      name: r.name || r.title || "Radio",
      image,
      media_type: r.media_type || "radio",
      raw: r,
    };
  }

  async _loadPlayers() {
    if (!this._hass) return;
    this._loadingPlayers = true;
    const debug = this._config?.debug === true;
    const log = (...a) => debug && console.log("[dynamic-radiocard]", ...a);

    await this._discoverMaPlayers(log);  // singleton - safe to always await
    const idsFromRegistry = this._maPlayerIds || [];

    // Scan all media_player entities for any with MA-related attributes - this
    // catches players that didn't make it into the entity_registry filter or
    // are registered via a different platform but still controlled by MA.
    const idsFromStates = Object.keys(this._hass.states || {}).filter((id) => {
      if (!id.startsWith("media_player.")) return false;
      const a = this._hass.states[id]?.attributes || {};
      return a.mass_player_id || a.app_id === "music_assistant"
          || a.app_name === "Music Assistant"
          || (typeof a.source === "string" && a.source.toLowerCase().includes("music assistant"));
    });

    // Optional MA-WS players/all (fast path when available)
    let idsFromMa = [];
    const maClient = this._getMaClient();
    if (maClient && !maClient.disabled) {
      try {
        const r = await maClient.send("players/all");
        if (Array.isArray(r)) {
          idsFromMa = r
            .map((p) => p.entity_id || p.hass_entity_id || (p.player_id ? "media_player." + p.player_id : null))
            .filter(Boolean);
          log("players via MA WS:", idsFromMa.length);
        }
      } catch (e) {
        // Some MA versions don't expose this; ignore silently.
      }
    }

    // Union & dedupe (preserve a stable order)
    const seen = new Set();
    const ids = [];
    [idsFromRegistry, idsFromStates, idsFromMa].forEach((src) => {
      src.forEach((id) => {
        if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
      });
    });

    let players = ids.map((id) => {
      const st = this._hass.states[id];
      const a = st?.attributes || {};
      return {
        entity_id: id,
        name: a.friendly_name || id.split(".")[1],
        icon: this._iconForPlayer({ name: a.friendly_name || id }),
      };
    });
    // Hide players whose display name matches the hide_players regex
    const hideRe = this._getHidePlayersRegex();
    if (hideRe) {
      const before = players.length;
      players = players.filter((p) => !hideRe.test(p.name));
      log("hide_players regex removed", before - players.length, "of", before);
    }
    this._players = players;
    log("Player list:", this._players.map((p) => p.entity_id),
        "(registry:" + idsFromRegistry.length,
        "states:" + idsFromStates.length,
        "ma-ws:" + idsFromMa.length + ")");
    this._loadingPlayers = false;

    // Retry if list is empty (MA might still be booting on the HA host).
    // Backoff: 3s, 5s, 8s, 12s, 16s. Resets to 0 on success.
    if (!this._players.length) {
      const backoffs = [3000, 5000, 8000, 12000, 16000];
      const n = this._playerRetries || 0;
      if (n < backoffs.length) {
        this._playerRetries = n + 1;
        setTimeout(() => {
          this._maDiscoveryPromise = null;
          this._maPlayerIds = null;
          this._loadPlayers().then(() => this._renderPlayer());
        }, backoffs[n]);
      }
    } else {
      this._playerRetries = 0;
    }
  }

  // Compiled regex from the hide_players config (matched against display name).
  // Empty / null config disables hiding.
  _getHidePlayersRegex() {
    const pat = this._config?.hide_players;
    if (pat === "" || pat === null || pat === undefined) return null;
    try {
      return new RegExp(String(pat), "i");
    } catch (e) {
      console.warn("[dynamic-radiocard] invalid hide_players regex:", pat);
      return null;
    }
  }

  _iconForPlayer(p) {
    const n = (p?.name || p?.display_name || "").toLowerCase();
    if (n.includes("sonos")) return "mdi:speaker-multiple";
    if (n.includes("kitchen") || n.includes("kueche")) return "mdi:silverware-fork-knife";
    if (n.includes("bath") || n.includes("bad")) return "mdi:shower";
    if (n.includes("bed") || n.includes("schlaf")) return "mdi:bed";
    if (n.includes("living") || n.includes("wohn")) return "mdi:sofa";
    if (n.includes("office") || n.includes("buero")) return "mdi:desk";
    if (n.includes("group") || n.includes("gruppe")) return "mdi:speaker-multiple";
    if (n.includes("cast")) return "mdi:cast";
    return "mdi:speaker";
  }

  _renderCarousel() {
    if (!this._track) return;
    // Apply provider filter
    const visible = this._filteredItems(this._radios);
    if (!visible.length) {
      this._emptyEl.style.display = "flex";
      this._emptyEl.style.alignItems = "center";
      this._emptyEl.style.justifyContent = "center";
      this._emptyEl.style.height = "100%";
      const cat = this._activeCategory();
      let msg;
      const media = this._t("media." + cat.key);
      if (this._loadingRadios) msg = this._t("state.loading", { media });
      else if (!this._radios.length) msg = this._t("state.empty_library", { media });
      else msg = this._t("state.empty_filter", { media });
      this._emptyEl.textContent = msg;
      this._track.innerHTML = "";
      return;
    }
    this._emptyEl.style.display = "none";

    const slots = [-2, -1, 0, 1, 2];
    if (this._track.children.length !== 5) {
      this._track.innerHTML = "";
      slots.forEach((s) => {
        const div = document.createElement("div");
        div.className = "item";
        div.dataset.slot = s;
        const img = document.createElement("img");
        img.style.display = "none";
        const fb = document.createElement("ha-icon");
        fb.setAttribute("icon", "mdi:radio");
        fb.classList.add("fallback");
        const label = document.createElement("div");
        label.className = "label";
        div.appendChild(img);
        div.appendChild(fb);
        div.appendChild(label);
        div.addEventListener("click", (e) => {
          if (this._suppressNextClick) {
this._suppressNextClick = false;
            return;
          }
          const slot = parseInt(div.dataset.slot, 10);
          if (slot === 0) {
            if (this._config?.grid_mode) this._openGrid();
            else this._togglePlay();
          } else this._rotate(slot);
        });
        this._track.appendChild(div);
      });
    }

    const N = visible.length;
    const idx = (n) => ((n % N) + N) % N;
    // Clamp center index when filter shrinks the list
    if (this._centerIdx >= N) this._centerIdx = 0;
    this._visibleRadios = visible;

    [...this._track.children].forEach((el) => {
      const slot = parseInt(el.dataset.slot, 10);
      const radio = visible[idx(this._centerIdx + slot)];
      const img = el.querySelector("img");
      const fb = el.querySelector(".fallback");
      const label = el.querySelector(".label");
      label.textContent = this._config.show_labels ? radio.name : "";
      if (radio.image) {
        img.src = radio.image;
        img.style.display = "block";
        fb.style.display = "none";
      } else {
        img.style.display = "none";
        fb.style.display = "block";
      }
      const cfg = this._slotTransform(slot);
      el.style.transform = cfg.transform;
      el.style.opacity = cfg.opacity;
      el.style.filter = cfg.filter;
      el.style.zIndex = cfg.z;
      el.classList.toggle("center", slot === 0);
      el.classList.toggle("playing", slot === 0 && this._isPlaying());
    });

    // Update Play/Pause button: show pause whenever the player is playing
    // (regardless of which exact item, so the pause action is always available)
    if (this._playBtn) {
      const playing = this._isPlaying();
      this._playBtn.classList.toggle("playing", playing);
      this._playBtnIcon.setAttribute("icon", playing ? "mdi:pause" : "mdi:play");
    }

    if (N <= 1) {
      [...this._track.children].forEach((el) => {
        const slot = parseInt(el.dataset.slot, 10);
        if (slot !== 0 && N === 1) el.style.opacity = 0;
        if ((slot === -2 || slot === 2) && N === 2) el.style.opacity = 0;
      });
    }
  }

  _slotTransform(slot) {
    const s = this._imageScale || 1;
    const offset = slot * 78 * s;
    let scale, rotateY, opacity, z, blur;
    switch (slot) {
      case 0:  scale = 1.3; rotateY = 0;   opacity = 1;    z = 50; blur = 0; break;
      case -1: scale = 1.0; rotateY = 38;  opacity = 0.85; z = 30; blur = 0; break;
      case 1:  scale = 1.0; rotateY = -38; opacity = 0.85; z = 30; blur = 0; break;
      case -2: scale = 0.8; rotateY = 55;  opacity = 0.55; z = 10; blur = 1; break;
      case 2:  scale = 0.8; rotateY = -55; opacity = 0.55; z = 10; blur = 1; break;
      default: scale = 0.6; rotateY = 0;   opacity = 0;    z = 0;  blur = 2;
    }
    // Multiply slot scale with the configured image_scale so items grow from
    // their geometric center (stage center stays fixed - clock/nav overlay).
    const finalScale = scale * s;
    return {
      transform: "translateX(" + offset + "px) translateZ(" + (slot === 0 ? 60 * s : 0) + "px) rotateY(" + rotateY + "deg) scale(" + finalScale + ")",
      opacity,
      filter: blur ? "blur(" + blur + "px)" : "none",
      z,
    };
  }

  _renderPlayer() {
    const list = this._players;
    if (!list.length) { this._playerName.textContent = "-"; return; }
    if (!this._selectedPlayer || !list.some((p) => p.entity_id === this._selectedPlayer)) {
      this._selectedPlayer = list[0].entity_id;
      try { localStorage.setItem(STORAGE_KEY_PLAYER, this._selectedPlayer); } catch (e) {}
    }
    const cur = list.find((p) => p.entity_id === this._selectedPlayer);
    this._playerName.textContent = cur?.name || this._selectedPlayer;
    this._playerChip.querySelector("ha-icon").setAttribute("icon", cur?.icon || "mdi:speaker");
    const st = this._hass?.states?.[this._selectedPlayer];
    this._playerChip.classList.toggle("active", st?.state === "playing");
    if (this._nowEl) {
      const t = st?.attributes?.media_title;
      this._nowEl.textContent = t ? "> " + t : "";
    }
  }

  _openPicker() {
    if (!this._players.length) return;
    this._pickerList.innerHTML = "";
    this._players.forEach((p) => {
      const row = document.createElement("div");
      row.className = "row" + (p.entity_id === this._selectedPlayer ? " active" : "");
      row.innerHTML =
        '<ha-icon icon="' + p.icon + '"></ha-icon>' +
        '<div>' + this._escape(p.name) + '</div>';
      row.addEventListener("click", () => {
        this._selectedPlayer = p.entity_id;
        try { localStorage.setItem(STORAGE_KEY_PLAYER, p.entity_id); } catch (e) {}
        this._closePicker();
        this._renderPlayer();
      });
      this._pickerList.appendChild(row);
    });
    this._pickerBackdrop.classList.add("open");
    this._picker.style.display = "block";
  }

  _closePicker() {
    this._pickerBackdrop.classList.remove("open");
    this._picker.style.display = "none";
  }

  _rotate(delta) {
    const list = this._visibleRadios && this._visibleRadios.length
      ? this._visibleRadios : this._radios;
    if (!list.length) return;
    this._isAnimating = true;
    this._centerIdx = (this._centerIdx + delta + list.length * 1000) % list.length;
    this._renderCarousel();
    setTimeout(() => { this._isAnimating = false; }, 540);
  }

  _onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    this._touch = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, moved: false };
    // NO setPointerCapture - it would eat click events on child items
  }
  _onPointerMove(e) {
    if (!this._touch || this._touch.id !== e.pointerId) return;
    const dx = e.clientX - this._touch.x;
    const dy = e.clientY - this._touch.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      this._touch.moved = true;
    }
  }
  _onPointerEnd(e) {
    if (!this._touch || this._touch.id !== e.pointerId) return;
    const dx = e.clientX - this._touch.x;
    const dt = Date.now() - this._touch.t;
    const t = this._touch;
    this._touch = null;
    if (!t.moved) return;
    // Mark next click to be ignored so swipe doesn't double-trigger
    this._suppressNextClick = true;
    setTimeout(() => { this._suppressNextClick = false; }, 250);
    const fast = dt < 350 && Math.abs(dx) > 30;
    const long = Math.abs(dx) > 60;
    if (!fast && !long) return;
    const steps = Math.max(1, Math.min(3, Math.round(Math.abs(dx) / 80)));
    this._rotate(dx < 0 ? steps : -steps);
  }

  _selectedPlayerState() {
    if (!this._hass || !this._selectedPlayer) return null;
    return this._hass.states[this._selectedPlayer] || null;
  }
  _isPlaying() { return this._selectedPlayerState()?.state === "playing"; }
  _currentRadio() {
    const list = this._visibleRadios && this._visibleRadios.length
      ? this._visibleRadios : this._radios;
    return list[this._centerIdx];
  }
  _isCurrentRadioActive() {
    const r = this._currentRadio();
    const s = this._selectedPlayerState();
    if (!r || !s) return false;
    const cur = s.attributes?.media_content_id || s.attributes?.media_title;
    if (!cur) return false;
    return (r.uri && cur === r.uri) || (r.name && s.attributes?.media_title === r.name);
  }

  async _volume(delta) {
    if (!this._selectedPlayer) {
      console.warn("[dynamic-radiocard] no player selected for volume");
      return;
    }
    const service = delta > 0 ? "volume_up" : "volume_down";
    try {
      await this._hass.callService("media_player", service, { entity_id: this._selectedPlayer });
return;
    } catch (e) {
      console.warn("[dynamic-radiocard] " + service + " failed, trying volume_set", e?.message || e);
    }
    // Fallback: read current volume_level and step by 5%
    try {
      const st = this._hass.states[this._selectedPlayer];
      const curr = parseFloat(st?.attributes?.volume_level);
      const step = 0.05;
      const next = Math.max(0, Math.min(1, (isNaN(curr) ? 0.5 : curr) + delta * step));
      await this._hass.callService("media_player", "volume_set", {
        entity_id: this._selectedPlayer,
        volume_level: next,
      });
    } catch (e) {
      console.error("[dynamic-radiocard] volume change failed", e);
    }
  }

  // Click on center carousel item: equivalent to the Play/Pause button
  async _togglePlay() { return this._playOrPause(); }

  // Play current radio - or pause if anything is already playing on the selected player
  async _playOrPause() {
    if (!this._selectedPlayer) { this._openPicker(); return; }
    // If the player is currently playing, the button acts as Pause
    if (this._isPlaying()) {
      try {
        await this._hass.callService("media_player", "media_pause", { entity_id: this._selectedPlayer });
      } catch (e) {
        console.error("[dynamic-radiocard] pause failed", e);
      }
      return;
    }
    await this._playItem();
  }

  // Always start playback of the current center item (never pauses)
  async _playItem() {
    if (!this._selectedPlayer) { this._openPicker(); return; }
    const radio = this._currentRadio();
    if (!radio) return;
    const mt = radio.media_type || this._activeCategory().media_type;
    try {
      await this._hass.callService("music_assistant", "play_media", {
        entity_id: this._selectedPlayer,
        media_id: radio.uri,
        media_type: mt,
        enqueue: "play",
      });
    } catch (e) {
      try {
        await this._hass.callService("media_player", "play_media", {
          entity_id: this._selectedPlayer,
          media_content_id: radio.uri,
          media_content_type: "music",
        });
      } catch (e2) {
        console.error("[dynamic-radiocard] play failed", e2);
      }
    }
  }

  // Show / hide queue playback controls based on category and config
  _renderPlaybackControls() {
    if (!this._playbackControls) return;
    const cat = this._activeCategory ? this._activeCategory() : null;
    const enabled = this._config?.playback_controls !== false;
    const isRadio = cat?.key === "radio";
    this._playbackControls.style.display = (enabled && !isRadio) ? "flex" : "none";
  }

  // Open the grid view that replaces the carousel with a square grid of all items
  _openGrid() {
    if (!this._gridView) return;
    const cat = this._activeCategory();
    const fullItems = this._fullItemsByCategory[cat.key] || [];
    // Apply current filter, then cap to grid_max
    const gridMax = Math.max(1, parseInt(this._config?.grid_max, 10) || 70);
    const items = this._filteredItems(fullItems).slice(0, gridMax);
    if (!items.length) return;

    // Determine cell size: try 1/2, 1/3, 1/4, 1/5 of the card height in that order
    // (largest possible where all items fit) - falls back to 1/5 + vertical scroll
    const card = this.shadowRoot.querySelector("ha-card");
    const rect = card?.getBoundingClientRect() || { width: 320, height: 400 };
    const cardW = rect.width  - 24;   // minus padding/inset
    const cardH = rect.height - 24;
    const fractions = [2, 3, 4, 5];
    let cellSize = Math.floor(cardH / 5);
    for (const f of fractions) {
      const size = Math.floor(cardH / f);
      const cols = Math.max(1, Math.floor(cardW / size));
      const rows = Math.max(1, Math.floor(cardH / size));
      if (items.length <= cols * rows) { cellSize = size; break; }
    }

    this._gridCells.style.gridTemplateColumns =
      "repeat(auto-fill, minmax(" + cellSize + "px, 1fr))";
    this._gridCells.innerHTML = "";

    items.forEach((it, idx) => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.title = it.name;
      if (it.image) {
        const img = document.createElement("img");
        img.src = it.image;
        img.loading = "lazy";
        cell.appendChild(img);
      } else {
        const fb = document.createElement("ha-icon");
        fb.classList.add("fallback");
        fb.setAttribute("icon", "mdi:radio");
        cell.appendChild(fb);
      }
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = it.name || "";
      cell.appendChild(label);
      // Pass the index within the *filtered* list - the carousel renders the
      // same filtered list, so the index maps 1:1 (no URI matching needed).
      cell.addEventListener("click", () => this._playFromGridIndex(idx));
      this._gridCells.appendChild(cell);
    });

    this._gridView.classList.add("open");
  }

  _closeGrid() {
    if (this._gridView) this._gridView.classList.remove("open");
  }

  async _playFromGridIndex(idx) {
    // idx is the position within the FILTERED list (what the grid showed).
    // The carousel renders _filteredItems(this._radios); if we set _radios to
    // the full list, _renderCarousel produces exactly that same filtered list,
    // so this index maps 1:1 to the center item.
    const cat = this._activeCategory();
    const fullList = this._fullItemsByCategory[cat.key] || [];
    this._radios = fullList;
    this._itemsByCategory[cat.key] = fullList;
    this._centerIdx = idx;
    this._closeGrid();
    this._renderCarousel();
    await this._playItem();   // grid selection always starts playback immediately
  }

  // Helper: call a media_player service on the selected player
  async _playerSvc(svc) {
    if (!this._selectedPlayer) return;
    try {
      await this._hass.callService("media_player", svc, { entity_id: this._selectedPlayer });
    } catch (e) {
      console.error("[dynamic-radiocard] " + svc + " failed", e);
    }
  }

  // Stop: always sends media_stop (independent of current play state)
  async _stopPlayback() {
    if (!this._selectedPlayer) return;
    try {
      await this._hass.callService("media_player", "media_stop", { entity_id: this._selectedPlayer });
    } catch (e) {
      // Some players don't implement stop; fall back to pause
      try { await this._hass.callService("media_player", "media_pause", { entity_id: this._selectedPlayer }); }
      catch (e2) { console.error("[dynamic-radiocard] stop failed", e2); }
    }
  }

  _syncPlayerState() {
    if (!this._initialized) return;
    const s = this._selectedPlayerState();
    const sig = s ? (s.state + "|" + (s.attributes?.media_title || "")) : "";
    if (sig !== this._lastPlayerState) {
      this._lastPlayerState = sig;
      this._renderCarousel();
      this._renderPlayer();
    }
  }
}

customElements.define("dynamic-radiocard", DynamicRadioCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "dynamic-radiocard",
  name: "Dynamic RadioCard",
  description: "3D cover-flow media browser for Music Assistant: radio, podcasts, tracks, albums and artists.",
  preview: false,
});

console.info(
  "%c DYNAMIC-RADIOCARD %c v" + CARD_VERSION + " ",
  "color: white; background: #03a9f4; font-weight: 700;",
  "color: #03a9f4; background: #1c1c1e;"
);

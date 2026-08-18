# Dynamic RadioCard (Deutsch)

Eine abhängigkeitsfreie Custom-Lovelace-Karte, die deine
**Music-Assistant-Bibliothek** als 3D-Cover-Flow-Karussell darstellt —
Radio, Podcasts, Titel, Alben und Künstler in einer Karte, bedienbar per
Klick, Swipe oder Tastatur. Die Oberfläche ist auf Deutsch und Englisch
verfügbar; `language: auto` folgt automatisch der Sprache deines
HA-Profils.

Die vollständige Dokumentation ist auf Englisch:

- [README](README.md) — Features, Installation, Schnellstart
- [Installation](docs/installation.md)
- [Konfiguration](docs/configuration.md) — alle Optionen
- [Troubleshooting](docs/troubleshooting.md)

## Schnellstart

1. HACS → **Custom repositories** →
   `https://github.com/badboiaustria/dynamic-radiocard` (Typ **Dashboard**)
   hinzufügen und installieren — oder `dynamic-radiocard.js` aus dem
   [neuesten Release](https://github.com/badboiaustria/dynamic-radiocard/releases/latest)
   nach `/config/www/` kopieren und als Ressource (JavaScript-Modul)
   eintragen.
2. In Music Assistant unter Profil → *Long-Lived Tokens* einen Token
   erzeugen.
3. Karte einfügen:

```yaml
type: custom:dynamic-radiocard
title: Musik
ma_token: "eyJhbGciOi..."
language: auto   # oder explizit "de"
```

## Umstieg von `ha-radio-card` 2.x

In den Dashboards `type: custom:ha-radio-card` durch
`type: custom:dynamic-radiocard` ersetzen und die Ressource auf
`/local/dynamic-radiocard.js` zeigen lassen. Gespeicherte Einstellungen
(Player, Kategorie, Filter) werden automatisch übernommen.

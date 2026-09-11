# Matrix Watchface Red

Zifferblatt für die Amazfit T-Rex 3 Pro 48 mm (Zepp OS, 480 × 480 px, rund).
Roter Matrix-Regen als Hintergrund, Uhrzeit und Sensorwerte in einem
Terminal-Layout.

Rote Variante von `matrix-watchface`. Unterschiede beschränken sich auf die
Farbpalette in `watchface/index.js`, die rot gerenderten Regen-Frames sowie
`appId` und `appName` in `app.json`.

![Aktives Zifferblatt](docs/screenshots/active.png)

## Funktionsumfang

- **Regen-Hintergrund** aus 24 vorgerenderten PNG-Frames (480 × 480) mit 6 fps,
  Schleifenlänge 4 s, nahtlos geschlossen
- **Uhrzeit** zentriert in 80 px, Sekunden rechts daneben in 28 px, Cursor
  blinkt im Sekundentakt
- **Datenzeilen** für Datum, Schritte, Puls und Akkustand, Label- und
  Wertespalte auf festen X-Positionen
- **AOD** auf eigener Widget-Ebene (`show_level.ONAL_AOD`): gedimmte Farben,
  nur Uhrzeit, Datum und Schritte, keine Animation
- **Chakra Petch Medium** als Schriftart, wird mit dem Paket ausgeliefert

![Always-On-Display](docs/screenshots/aod.png)

## Aktualisierung

Ein Widget wird nur beschrieben, wenn sich sein Wert geändert hat.

| Auslöser | Aktualisiert |
| --- | --- |
| `Time.onPerMinute()` | Stunde, Minute, Datum, Akku, AOD-Ebene |
| `Step.onChange()`, `HeartRate.onLastChange()` | Schritte, Puls – gepuffert, geschrieben höchstens 1× pro Sekunde |
| `setInterval(1000)` | Sekunden und Cursor, nur bei eingeschaltetem Display |

## Voraussetzungen

- Amazfit T-Rex 3 Pro 48 mm, in der Zepp App gekoppelt
- [Node.js](https://nodejs.org/) ab Version 14
- Zepp-Konto und aktivierter Developer Mode in der Zepp App
  (Profil → gekoppeltes Gerät → ganz nach unten scrollen)

## Installation

Das Watchface liegt nicht im Zepp-Store und wird über den Entwicklermodus
installiert.

```bash
npm install -g @zeppos/zeus-cli
zeus login
git clone https://github.com/<account>/matrix-watchface-red.git
cd matrix-watchface-red
zeus preview
```

`zeus preview` baut das Paket und gibt einen QR-Code im Terminal aus. Diesen mit
der Scan-Funktion im Developer Mode der Zepp App einlesen; das Watchface wird
auf die Uhr übertragen und erscheint dort in der Zifferblattauswahl.

`zeus build` erzeugt stattdessen ein `.zab`-Paket unter `dist/`.

Grüne und rote Variante haben unterschiedliche `appId`s und lassen sich parallel
auf derselben Uhr installieren.

## Konfiguration

Feature-Flags am Anfang von `watchface/index.js`:

| Flag | Standard | Wirkung |
| --- | --- | --- |
| `USE_RAIN` | `true` | Regen-Animation aus `image/rain/` |
| `USE_FLAP` | `false` | Fallblatt-Animation beim Ziffernwechsel |

Die Fallblatt-Animation ist vollständig implementiert, die Frames liegen unter
`image/flap/` (6 Frames für die großen Ziffern, je 4 für Sekunden und kleine
Ziffern, 20 fps, also 300 ms pro Ziffernschritt). Ein Sprung von 9 auf 2 spielt
9→0, 0→1 und 1→2 hintereinander ab. Auf echter Hardware läuft das noch nicht
sauber, deshalb ist das Flag deaktiviert und die Ziffern wechseln direkt.

![Ziffernwechsel mit Fallblatt-Animation](docs/screenshots/flap.png)

## Farbpalette

Definiert als `COLOR` in `watchface/index.js`:

| Schlüssel | Wert | Verwendung |
| --- | --- | --- |
| `digit` | `0xffd9d9` | große Ziffern |
| `second` | `0xbf2222` | Sekunden |
| `label` | `0x731414` | Labels der Datenzeilen |
| `value` | `0xf22b2b` | Werte der Datenzeilen |
| `rule` | `0x4d0e0e` | Trennlinie |
| `aodLabel` | `0x611111` | Labels im AOD |
| `aodValue` | `0xb82020` | Werte im AOD |

## Projektstruktur

```
app.json                    Manifest: Target, appId, Berechtigungen
app.js                      App-Einstiegspunkt
watchface/index.js          Layout, Widgets, Sensoranbindung
assets/480x480-.../image/   rain (24), flap, digit
assets/480x480-.../fonts/   Chakra Petch Medium + OFL.txt
design/                     HTML-Artboards des Layout-Entwurfs
docs/screenshots/           Screenshots für dieses README
```

## Kompatibilität

Ausgelegt auf die T-Rex 3 Pro 48 mm mit 480 × 480 px. Weitere runde
Zepp-OS-Geräte derselben Auflösung – etwa T-Rex 3 oder T-Rex Ultra 2 – lassen
sich über einen zusätzlichen Eintrag unter `targets` in `app.json` ergänzen.
Die 44-mm-Variante hat 466 × 466 px und braucht ein eigenes Layout.

## Lizenz

Chakra Petch steht unter der SIL Open Font License. Die Lizenzdatei liegt als
`OFL.txt` neben der Schriftdatei und muss mit ausgeliefert werden.

## Status

Lauffähig. Offen sind die Fallblatt-Animation (siehe oben) und eine eigene
`appId` aus der Zepp-Entwicklerkonsole, solange eine Store-Veröffentlichung
geplant ist. Details in [DEVELOPMENT.md](DEVELOPMENT.md).

Grüne Variante: `matrix-watchface`.

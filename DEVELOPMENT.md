# Entwickler-Dokumentation

Technische Seite des Matrix Watchface Red. Die Anwender- und Installationsseite
steht in [README.md](README.md).

## Gerät und Ziel

| | |
| --- | --- |
| Gerät | Amazfit T-Rex 3 Pro 48mm |
| Display | 480 × 480, rund, AMOLED |
| `deviceSource` | 10551552 (CN), 10551553, 10551555 |
| `configVersion` | v2 (v2 und v3 sind gültig, v1 ist abgekündigt) |
| API-Level | 4.2 |
| Target-Key | `480x480-amazfit-t-rex-3-pro` |
| `designWidth` | 480 |

## API

Das Gerät läuft auf API-Level 4.2. Die klassischen Globals (`hmUI`,
`hmSensor`, `hmSetting`, `timer`) **existieren dort nicht mehr** — jeder
Zugriff darauf endet in `TypeError: cannot read property … of undefined` und
einem schwarzen Bildschirm. Alles kommt aus den `@zos`-Modulen:

```js
import ui from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { Time, Step, HeartRate, Battery } from '@zos/sensor'
```

`WatchFace({ … })`, `console.log`, `setInterval` und `clearInterval` bleiben
global. **Nicht** `createSysTimer` aus `@zos/timer` für den Sekundentakt
nehmen: der ist dafür gedacht, den ausgeschalteten Bildschirm zu überleben,
und die Firmware weist so kurze Perioden ab (`_check_param … bad repeat(1000)`
im Log, der Timer läuft dann einfach nicht).

Die Sensoren brauchen Permissions in `app.json`, sonst schlägt der Zugriff
fehl: `data:user.hd.step` und `data:user.hd.heart_rate`. Time und Battery
brauchen keine.

## Projektstruktur

```
app.json                    Manifest, Target und deviceSource
app.js                      App-Einstiegspunkt (unverändert aus dem Template)
watchface/index.js          das komplette Watchface
assets/480x480-amazfit-t-rex-3-pro/
  icon.png                  Vorschaubild, 480 x 480
  fonts/                    Chakra Petch Medium + OFL.txt
  image/rain/               Frames des Matrix-Regens
  image/flap/big/           Klapp-Frames der großen Ziffern (noch leer)
  image/flap/small/         Klapp-Frames der kleinen Ziffern (noch leer)
design/                     Quelle des Design-Canvas (*.dc.html)
design/frames/              Frame-Generator für den Regen
design/shots/               eigenständige HTML-Seiten für die Screenshots
docs/screenshots/           die Bilder im README
```

Das entspricht der offiziellen
[Folder Structure](https://docs.zepp.com/docs/v2/guides/architecture/folder-structure/):
`app.js` und `app.json` an der Wurzel, darunter ein Ordner je Target unter
`assets/`, benannt **exakt wie der Schlüssel im `targets`-Objekt**, mit
`icon.png` und Bildern unter `image/`.

`design/` und `docs/` liegen zwar im Projekt, landen aber nicht im Paket — beim
Install legt die Firmware nur `watchface/` und `assets/` an. Sie lösen
allerdings Rebuilds aus, solange `zeus dev` läuft.

## Vorschaubild

`icon.png` ist das Bild, das in der Zifferblatt-Auswahl auf der Uhr erscheint.
Der Build skaliert es auf 324 px (`[RESIZE] Succeed resize icon.png to target
size 324` im Log) — das ist die Größe, die die Spezifikation für ein
480 × 480-Gerät verlangt. Es kommt mit dem Paket, nicht erst beim
Veröffentlichen.

Erzeugt aus dem Entwurf:

```bash
msedge --headless=new --window-size=480,480   --screenshot=assets/480x480-amazfit-t-rex-3-pro/icon.png   "file:///<pfad>/design/shots/active.html?icon=1"
```

`?icon=1` lässt den Gehäusering weg, damit exakt das 480 × 480-Panel im Bild
ist.

## Schrift

Chakra Petch Medium, mitgeliefert als
`assets/<target>/fonts/ChakraPetch-Medium.ttf` und an jedem `TEXT`-Widget über
`font: FONT` gesetzt. Das TEXT-Widget nimmt laut
[UI-Referenz](https://docs.zepp.com/docs/reference/device-app-api/newAPI/ui/)
einen Pfad relativ zum Asset-Ordner — Bild-Ziffern sind dafür nicht nötig.

Die Lizenz (SIL Open Font License) liegt als `OFL.txt` daneben; sie erlaubt
das Mitliefern, verlangt aber, dass sie mitgeht. Nicht löschen.

Die Zellenbreiten unten stammen aus der gemessenen Ziffernbreite dieser
Schrift: **50,9 px bei 80 px** Schriftgröße und **14,0 px bei 22 px**. Wer die
Schrift tauscht, muss neu messen — sonst stehen die Ziffern schief in ihren
Zellen oder werden abgeschnitten.

## Layout (480 × 480)

| Element | Position |
| --- | --- |
| `> SYS.TIME` | y 150, zentriert, 22 px |
| Uhrzeit HH:MM | 4 Zellen à 51 × 76 + 20 px Doppelpunkt, Block ab x 128, auf y 240 zentriert |
| Sekunden | 2 Zellen à 18 × 30 ab x 364 |
| Cursor | 10 × 26 bei x 408 |
| Trennlinie | x 110, y 296, 260 × 1 |
| Datenzeilen | Label x 137, Wert x 233, Ziffernzelle 14 px, ab y 308, Abstand 32 |

Oben und unten bleiben 44 px frei — dort zeichnet das System den Statuspunkt
und den Offline-Voice-Hinweis. Mindestschriftgröße auf dem Zifferblatt sind
22 px, deshalb sind die Datenzeilen genau so groß.

## Aufbau des Codes

`watchface/index.js` ist in Abschnitte gegliedert: Einstellungen, Farben,
Layout, Zustand, Hilfsfunktionen, Ziffern-Slots, Aufbau, Aktualisierung,
Einstieg.

**Slots.** Jede Ziffer auf dem Zifferblatt ist ein Slot. Ohne Bild-Assets ist
das ein `TEXT`-Widget, mit Assets ein `IMG_ANIM`. `setDigits()` schaltet
zwischen beiden Wegen um.

`setNumber()` setzt Werte wechselnder Länge **linksbündig** an die Wertespalte
`ROW.valueX` — wie das Datum, damit alle vier Zeilen bündig stehen. Nicht
gebrauchte Slots am Ende werden ausgeblendet, und die Einheit dahinter (`BPM`,
`%`) rückt nach: sie behält ihr Options-Objekt, damit
`setProperty(ui.prop.MORE, options)` sie mit neuem `x` neu setzen kann.

**Klapp-Logik.** `rollTo()` legt pro Zwischenschritt einen Eintrag in die
Queue, `playStep()` spielt sie über `anim_complete_call` nacheinander ab. So
läuft die Walze immer vorwärts, auch über den Nullpunkt.

**Zwei Sätze Widgets.** `buildActive()` und `buildAod()` erzeugen die aktive
und die Always-On-Anzeige, getrennt über `show_level: ONLY_NORMAL` bzw.
`ONAL_AOD`. Die Uhrzeit steht in beiden an derselben Stelle und in derselben
Größe, damit beim Umschalten nichts springt.

## Aktualisierung

Die Anzeige wird ereignisgesteuert aktualisiert, nicht im Sekundentakt
durchgerechnet:

| Auslöser | Was aktualisiert wird |
| --- | --- |
| `time.onPerMinute` | Stunde, Minute, Datum, Akku, komplette Always-On-Anzeige |
| `step.onChange` | Schrittzahl |
| `heart.onLastChange` | Puls |
| `battery.onChange` | Akkustand |
| `setInterval(…, 1000)` | Sekunden und Cursor |

Der Timer läuft nur bei eingeschaltetem Display — `WIDGET_DELEGATE` startet und
stoppt ihn über `resume_call` / `pause_call`, und im Always-On-Modus
(`getScene() === SCENE_AOD`) wird erst gar keiner angelegt. Die
Always-On-Anzeige bleibt trotzdem aktuell, weil das System das Zifferblatt für
`onPerMinute` weckt.

Zusätzlich schreibt `setText()` nur dann in ein Widget, wenn sich der Wert
wirklich geändert hat, und `setDigits()` überspringt Ziffern, die schon
stimmen. Pro Sekunde bleiben damit im Normalfall zwei Schreibzugriffe übrig:
die Sekundenziffer und der Cursor.

## Feature-Flags

Ganz oben in `watchface/index.js`:

```js
const USE_RAIN = true    // Matrix-Regen als Vollbild-Animation
const USE_FLAP = true    // Klapp-Ziffern statt einfacher Textziffern
```

Beide brauchen die Bildfolgen unten. Stehen sie auf `false`, läuft dasselbe
Zifferblatt ohne Regen und mit hart wechselnden Textziffern.

## Frames

Alles unter `assets/480x480-amazfit-t-rex-3-pro/`:

| Ordner | Dateien | Größe | Stand |
| --- | --- | --- | --- |
| `rain/` | `rain_0.png` … `rain_23.png` | 480 × 480 | **fertig, 2,4 MB** |
| `flap/big/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…5 | 51 × 76 | **fertig** |
| `flap/sec/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…3 | 18 × 30 | **fertig** |
| `flap/sml/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…3 | 14 × 26 | **fertig** |

Der Dateiname ist `<anim_prefix>_<index>.png` — bestätigt am offiziellen
Sample (`anim_prefix: 'a'` → `a_0.png`).

### Klapp-Ziffern

**Jede Zellengröße braucht eigene Frames.** Eine `IMG_ANIM` hat genau eine
Pixelgröße, deshalb gibt es drei Sätze: `big` für Stunde und Minute, `sec` für
die Sekunden, `sml` für Schritte, Puls und Akku. Früher zeigten Sekunden und
Datenwerte auf denselben Ordner, was nicht funktionieren kann.

Erzeugt aus `design/frames/flap.html`, ein Aufruf pro Frame:

```bash
msedge --headless=new --window-size=51,76   --screenshot=.../image/flap/big/roll_9_3.png   "file:///<pfad>/design/frames/flap.html?size=big&from=9&f=3&c=c9ffd9&g=0,255,65"
```

`size` wählt die Zellengröße, `from` die Ausgangsziffer, `f` das Einzelbild,
`c` die Ziffernfarbe und `g` die Glühfarbe als RGB-Tripel. Die rote Variante
benutzt dieselbe Seite mit anderen Farbwerten.

Das Tempo steckt in `FLAP_FPS` (aktuell 20). Bei sechs Frames dauert ein
Ziffernschritt damit 300 ms; ein Sprung von 9 auf 2 klappt dreimal
hintereinander, also knapp eine Sekunde. Höher heißt schneller und irgendwann
unsichtbar.

### Regen

Erzeugt aus `design/frames/rain.html?f=<0…23>`, ein Aufruf pro Frame:

```bash
msedge --headless=new --window-size=480,480   --screenshot=assets/480x480-amazfit-t-rex-3-pro/rain/rain_0.png   "file:///<pfad>/design/frames/rain.html?f=0"
```

Das Tempo steckt allein in `RAIN_FPS` (aktuell 8, also 3 s pro Schleife) — die
Spalten wandern pro Frame um ganze Glyphenzeilen, die Bildrate skaliert also
den ganzen Regen. Niedriger heißt langsamer und zugleich weniger Rechenlast;
neu rendern muss man dafür nichts.

Die Schleife schließt nahtlos, weil jede Spalte pro Frame um ganze
Glyphenzeilen wandert (1, 2 oder 3) und die Strähne sich alle `PERIOD = 24`
Zeilen wiederholt — nach 24 Frames ist jede Spalte um ein ganzes Vielfaches
der Periode gewandert. `PERIOD` muss deshalb `FRAMES` teilen. Jede Spalte hat
zusätzlich eine feste Phase, sonst stehen alle Strähnen auf derselben Höhe.

In die Frames sind Scrim, Scanlines und Vignette eingebacken — sie kosten nur
rund 8 % Dateigröße und sparen ein zweites Overlay-Widget. Weniger Frames
halbieren die 2,4 MB, dann muss `PERIOD` aber mitgezogen werden.

`roll_3` ist der Schritt **von 3 auf 4**. Das letzte Frame jeder Sequenz muss
die fertige Zielziffer sein, weil es bis zum nächsten Wechsel stehen bleibt.
Der Hintergrund ist immer reines Schwarz.

Vorlage für das Aussehen ist `design/shots/active.html` — dort sind Zellgröße,
Schrift, Nachleuchten und die Klappkante schon so gesetzt, wie die Frames
aussehen sollen.

## Build

```
zeus dev      # Simulator mit Live-Reload
zeus preview  # QR-Code, Installation aufs Gerät
zeus build    # .zab-Paket nach dist/
```

Während `zeus dev` läuft, löst **jede** Dateiänderung im Projektordner einen
Rebuild aus — auch in `design/` und `docs/`. Bei vielen Schreibvorgängen
hintereinander verliert der Watcher die Verbindung zum Simulator und beendet
sich mit Code 1.

## Screenshots neu erzeugen

Die Bilder im README kommen nicht vom Gerät, sondern aus eigenständigen
HTML-Seiten unter `design/shots/`, gerendert mit einem headless Chromium:

```bash
msedge --headless=new --window-size=520,520 \
  --screenshot=docs/screenshots/active.png \
  file:///<pfad>/design/shots/active.html
```

`active.html?flap=1` zeigt die Minutenziffer mitten im Klappvorgang,
`aod.html` die Always-On-Anzeige. Werte und Uhrzeit sind die Beispieldaten aus
der Zepp-OS-Spezifikation für Vorschaubilder: 10:09:36, 8670 Schritte, 86 bpm.

## Stromverbrauch

Schwarzer Grund und eine einzige rote Farbe sind auf AMOLED der günstigste
Fall — nur leuchtende Pixel ziehen Strom. Teuer ist der Vollbild-Regen: Zepp OS
zeichnet nicht frei, sondern spielt vorgerenderte PNG-Sequenzen ab, und ein
480 × 480-Loop ist das Aufwendigste, was auf das Zifferblatt passt.

Stellschrauben, alle an `IMG_ANIM`:

- `repeat_count: 1` statt `0` — der Regen läuft einmal beim Handheben statt
  dauerhaft
- `default_frame_index` — das Bild, das im Stromsparmodus stehen bleibt
- `step` — Frames überspringen
- kleinere animierte Fläche statt Vollbild

Für den Always-On-Modus schreibt die Zepp-OS-Spezifikation vor: höchstens 10 %
leuchtende Pixel, schwarzer Grund, keine Sekundenanzeige, helle Flächen als
Kontur mit maximal 6 px Strichstärke, und Elemente dürfen zwischen den Modi
nicht springen. `buildAod()` hält sich an alle Punkte.

## Offene Prüfpunkte

Geklärt und auf dem Gerät bestätigt: die Globals sind weg, alles läuft über
`@zos`. Diese Stellen stammen weiter aus Doku bzw. offiziellen Samples und
sind noch nicht gegen Hardware belegt:

- **Farbformat.** `@zos/ui` bekommt Farben als einfache Zahl (`0xff2d2d`), so
  wie es die API-Referenz und das 3.0-Sample zeigen. Ältere, mit dem Watchface
  Maker erzeugte Samples schreiben stattdessen `"0xAARRGGBB"` als String. Falls
  Text unsichtbar bleibt, obwohl im Log alles `ok` meldet, ist das der erste
  Verdacht.
- `ui.widget.WIDGET_DELEGATE` mit `resume_call` / `pause_call` — im
  3.0-Sample nicht mehr enthalten, dort wird gar nicht pausiert. Schlägt es
  fehl, meldet sich `[matrix] delegate FAILED` und der Timer läuft weiter.
- Nachladen einer `IMG_ANIM` über `setProperty(ui.prop.MORE, …)`, um die
  Klapp-Schritte zu verketten.
- `time.getDay()` wird als 1 = Montag … 7 = Sonntag angenommen.

## Fehlersuche

Jeder Aufbauschritt und jeder Callback meldet sich im Log, sichtbar in der
Ausgabe von `zeus dev`:

```
[matrix] sensors ok
[matrix] background ok
[matrix] rain ok
[matrix] active ok
[matrix] aod ok
[matrix] events ok
[matrix] delegate ok
[matrix] clock ok
```

Bricht etwas, steht statt `ok` ein `FAILED: <Fehler>` an genau der Stelle.
Callbacks melden sich nur beim ersten Fehler, damit ein defekter Timer das Log
nicht flutet. Bleibt der Bildschirm schwarz und es erscheint gar keine
`[matrix]`-Zeile, wurde das Modul nicht geladen — dann liegt es am Manifest,
nicht am Code.

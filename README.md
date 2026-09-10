# Matrix Watchface Red

**Der Matrix-Code auf deinem Handgelenk, in Rot.** Rote Zeichen regnen über einen
schwarzen Grund, in der Mitte steht die Uhrzeit als Terminal-Ausdruck, darunter
Datum, Schritte, Puls und Akkustand. Ein Cursor blinkt im Sekundentakt.

Für die **Amazfit T-Rex 3 Pro 48mm**.

![Matrix Watchface](docs/screenshots/active.png)

## Was drin steckt

* **Fallende Katakana** über die ganze Fläche, 24 Einzelbilder, vier Sekunden
  pro Schleife, nahtlos geschlossen
* **Phosphor-CRT-Look** mit Scanlines, Nachleuchten und einem langsam
  durchlaufenden Helligkeitsband
* **Kantige Terminal-Schrift** (Chakra Petch), abgeschnittene Ecken statt
  Rundungen
* **Uhrzeit exakt in der Bildmitte**, Sekunden kleiner rechts daneben, dahinter
  der blinkende Cursor
* **Datum, Schritte, Puls und Akkustand** als Terminal-Zeilen, alle Werte
  bündig untereinander
* **Sparsame Always-On-Anzeige**: schwarzer Grund, gedimmte Ziffern an genau
  derselben Stelle wie im aktiven Zustand, kein Regen, keine Animation

**Die Always-On-Anzeige, nur Uhrzeit, Datum und Schritte**

![Always-On-Anzeige](docs/screenshots/aod.png)

## Klapp-Ziffern, vorbereitet aber ausgeschaltet

Gedacht ist der Ziffernwechsel als Fallblattanzeige: von 9 auf 2 rollt die
Ziffer vorwärts über 0 und 1 durch. Der Effekt ist vollständig gebaut, die
Bildfolgen liegen im Projekt, ein Ziffernschritt dauert 300 Millisekunden.

**Aktuell ist er ausgeschaltet.** Im Alltag wechseln die Ziffern direkt. Der
Effekt lief auf echter Hardware noch nicht sauber und wartet auf einen weiteren
Anlauf. Wer ihn ausprobieren will, setzt in `watchface/index.js` die Zeile
`const USE_FLAP = false` auf `true`.

So sähe er aus, hier mitten im Rollen festgehalten:

![Ziffer im Klappvorgang](docs/screenshots/flap.png)

## Auf die Uhr bringen

Das Watchface liegt nicht im Zepp-Store, es wird über den Entwicklermodus
installiert. Das dauert einmalig etwa fünf Minuten.

**Was du brauchst**

* eine Amazfit T-Rex 3 Pro 48mm, mit der Zepp App gekoppelt
* [Node.js](https://nodejs.org/) ab Version 14 auf dem Rechner
* ein Zepp-Konto, dasselbe wie in der App

**1. Zeus CLI installieren**

```bash
npm install -g @zeppos/zeus-cli
zeus login
```

**2. Entwicklermodus in der Zepp App einschalten**

Profil, dann bei den gekoppelten Geräten ganz nach unten scrollen, dort
**Developer Mode** aktivieren.

**3. Projekt holen und auf die Uhr schicken**

```bash
git clone https://github.com/<dein-account>/matrix-watchface-red.git
cd matrix-watchface-red
zeus preview
```

`zeus preview` baut das Paket und zeigt einen QR-Code im Terminal. Den mit der
Scan-Funktion im Developer Mode der Zepp App abfotografieren, dann wird das
Watchface direkt auf die Uhr installiert.

Danach liegt es auf der Uhr unter den Zifferblättern und lässt sich wie jedes
andere auswählen.

Alternativ legt `zeus build` ein `.zab`-Paket in `dist/` ab.

## Kompatibilität

Gebaut und ausgelegt für die **T-Rex 3 Pro 48mm** mit 480 × 480 Pixeln, rund.

Andere runde Zepp-OS-Geräte mit derselben Auflösung, etwa T-Rex 3 oder T-Rex
Ultra 2, brauchen nur einen zusätzlichen Eintrag in `app.json`. Die
44-mm-Variante der T-Rex 3 Pro hat 466 × 466 Pixel und würde ein eigenes
Layout brauchen.

## Schrift

Die Anzeige benutzt **Chakra Petch Medium**. Die Schriftdatei liegt unter
`assets/480x480-amazfit-t-rex-3-pro/fonts/` und wird mit dem Watchface auf die
Uhr gespielt. Sie steht unter der SIL Open Font License, die als `OFL.txt`
danebenliegt und mitgeliefert werden muss.

## Stand

Läuft. Der Regen ist drin, die Anzeige steht, die Always-On-Variante auch.

Offen sind zwei Dinge: der Klapp-Effekt braucht noch einen Durchlauf auf echter
Hardware, und für eine Veröffentlichung im Zepp-Store fehlt eine eigene `appId`
aus der Entwicklerkonsole. Details dazu in
[DEVELOPMENT.md](DEVELOPMENT.md).

Es gibt das Ganze auch in Grün, siehe `matrix-watchface`.

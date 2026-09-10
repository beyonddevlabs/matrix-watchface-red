// Matrix Watchface - Amazfit T-Rex 3 Pro 48mm (480 x 480, round)
// All coordinates are taken 1:1 from the design canvas in design/.
//
// The device runs API level 4.2, where the legacy globals (hmUI, hmSensor,
// hmSetting, timer) no longer exist - everything comes from @zos modules.
//
// Update strategy, cheapest first:
//   onPerMinute -> hour, minute, date, battery, always-on face
//   onChange / onLastChange -> steps and heart rate, only when they change
//   setInterval -> seconds and the cursor, and only while the screen is on
// Nothing is written to a widget unless its value changed.

import ui from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { Time, Step, HeartRate, Battery } from '@zos/sensor'

// ---------------------------------------------------------------- settings

// Both need rendered frames under assets/, see DEVELOPMENT.md. Until then the
// face runs on plain text widgets, which need no assets at all.
const USE_RAIN = true
const USE_FLAP = false

// One "roll" animation per digit is the step from n to n+1. A change of 9 -> 2
// plays 9->0, 0->1, 1->2 back to back, so the digit flaps through every value.
// Every cell size needs its own frames - an IMG_ANIM has exactly one pixel
// size - and the small ones get by with fewer steps.
// Jede Ziffer besteht aus zwei Widgets: einem Standbild, das dauerhaft steht,
// und einer IMG_ANIM darueber, die nur waehrend des Rollens sichtbar ist. Eine
// IMG_ANIM zeichnet naemlich nur, solange sie laeuft - steht sie, bleibt die
// Zelle leer.
const FLAP = {
  big: { path: 'image/flap/big', still: 'image/digit/big', frames: 6 },
  sec: { path: 'image/flap/sec', still: 'image/digit/sec', frames: 4 },
  sml: { path: 'image/flap/sml', still: 'image/digit/sml', frames: 4 }
}
// 20 fps: one digit step takes 300 ms with six frames, so the roll is visible
// instead of flicking past.
const FLAP_FPS = 20

// Chakra Petch Medium, mitgeliefert unter assets/<target>/fonts/ (OFL).
// Ziffernbreite gemessen: 50.9 px bei 80 px, 14.0 px bei 22 px - die
// Zellenbreiten unten stammen genau daher.
const FONT = 'fonts/ChakraPetch-Medium.ttf'

const RAIN_FRAMES = 24
// Tempo des Regens: Spalten wandern 1-3 Glyphenzeilen pro Frame, die
// Bildrate bestimmt also alles. 6 fps = 4 s pro Schleife. Das ist zugleich der
// wirksamste Performance-Hebel: jedes Frame ist ein 480x480-PNG, das aus dem
// Flash dekodiert wird. Weniger Bilder pro Sekunde heisst direkt weniger Last.
const RAIN_FPS = 6

// The design's accent green, pre-blended over black at the opacities used
// there. Colours are plain numbers, the way @zos/ui takes them.
const COLOR = {
  bg: 0x000000,
  digit: 0xffd9d9,
  second: 0xbf2222,
  label: 0x731414,
  value: 0xf22b2b,
  rule: 0x4d0e0e,
  aodLabel: 0x611111,
  aodValue: 0xb82020
}

// ---------------------------------------------------------------- layout

const SCREEN = 480
const BIG = { w: 51, h: 76, size: 80, y: 202 }
const SEC = { w: 18, h: 30, size: 28, y: 248 }
const SMALL = { w: 14, h: 26, size: 22 }

const LABEL_Y = 150
const TIME_X = 128
const COLON_W = 20
const SEC_X = 364
const CURSOR = { x: 408, y: 252, w: 10, h: 26 }
const RULE = { x: 110, y: 296, w: 260 }
const ROW = { x: 137, labelW: 96, valueX: 233, top: 308, pitch: 32 }

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// ---------------------------------------------------------------- state

const digits = {}
const widgets = {}
const units = {}
const written = {}
const reported = {}

let time = null
let step = null
let heart = null
let battery = null

let tickTimer = null
let cursorOn = true

// Schritte koennen im Gehen mehrmals pro Sekunde eintreffen. Die Rueckrufe
// merken sich nur, dass etwas offen ist; geschrieben wird hoechstens einmal
// pro Sekunde im Takt. Sonst zeichnet das System bei jedem Schritt neu.
const pending = { steps: false, heart: false, power: false }

// ---------------------------------------------------------------- helpers

// Build steps and callbacks report themselves, so a failure shows up in the
// `zeus dev` log by name instead of as an empty screen. Callbacks report only
// their first failure, otherwise a broken timer would flood the log.
function stage(name, fn) {
  try {
    fn()
    console.log('[matrix] ' + name + ' ok')
  } catch (error) {
    console.log('[matrix] ' + name + ' FAILED: ' + error)
  }
}

function safe(name, fn) {
  return function () {
    try {
      fn()
    } catch (error) {
      if (reported[name]) return
      reported[name] = true
      console.log('[matrix] ' + name + ' FAILED: ' + error)
    }
  }
}

function pad(value) {
  return value < 10 ? '0' + value : String(value)
}

// Widgets are only touched when the value really changed - setProperty forces
// a redraw, and most of these values hold still for minutes at a time.
function setText(key, widget, text) {
  if (written[key] === text) return
  written[key] = text
  widget.setProperty(ui.prop.MORE, { text: text })
}

// ---------------------------------------------------------------- digits

// Every digit on the face is a slot: a TEXT widget, or an IMG_ANIM that rolls
// to its new value once the flap frames exist.
function slotGroup(name, count, x, y, box, color, flap) {
  const group = []

  for (let i = 0; i < count; i++) {
    const left = x + i * box.w
    let widget
    let anim = null
    let still = null

    if (USE_FLAP) {
      still = {
        x: left,
        y: y,
        src: flap.still + '/0.png',
        show_level: ui.show_level.ONLY_NORMAL
      }
      widget = ui.createWidget(ui.widget.IMG, still)
      anim = ui.createWidget(ui.widget.IMG_ANIM, {
        x: left,
        y: y,
        anim_path: flap.path,
        anim_prefix: 'roll_0',
        anim_ext: 'png',
        anim_fps: FLAP_FPS,
        anim_size: flap.frames,
        repeat_count: 1,
        anim_status: ui.anim_status.STOP,
        show_level: ui.show_level.ONLY_NORMAL
      })
      anim.setProperty(ui.prop.VISIBLE, false)
    } else {
      widget = ui.createWidget(ui.widget.TEXT, {
        x: left,
        y: y,
        w: box.w,
        h: box.h,
        color: color,
        font: FONT,
        text_size: box.size,
        align_h: ui.align.CENTER_H,
        align_v: ui.align.CENTER_V,
        text: '0',
        show_level: ui.show_level.ONLY_NORMAL
      })
    }

    group.push({
      widget: widget,
      anim: anim,
      still: still,
      value: 0,
      shown: true,
      painted: false,
      queue: [],
      flap: flap
    })
  }

  digits[name] = group
}

function setDigits(name, text) {
  const group = digits[name]
  if (!group) return

  for (let i = 0; i < group.length; i++) {
    const digit = text.charCodeAt(i) - 48
    if (!(digit >= 0 && digit <= 9)) continue

    const slot = group[i]

    if (USE_FLAP) {
      // Beim ersten Zeichnen nur das Standbild setzen, nicht rollen.
      if (!slot.painted) {
        slot.value = digit
        slot.painted = true
        setStill(slot)
        continue
      }
      if (slot.value === digit) continue
      rollTo(slot, digit)
    } else {
      if (slot.value === digit && slot.painted) continue
      slot.widget.setProperty(ui.prop.MORE, { text: String(digit) })
      slot.value = digit
      slot.painted = true
    }
  }
}

// Values of varying length (steps, heart rate, battery) start at the value
// column like the date does, so every row lines up. Unused slots at the end
// are hidden and the unit behind them moves in.
function setNumber(name, value) {
  const group = digits[name]
  if (!group) return

  const text = String(value)
  if (text.length > group.length) return

  for (let i = 0; i < group.length; i++) {
    const slot = group[i]
    const used = i < text.length
    if (slot.shown === used) continue
    slot.widget.setProperty(ui.prop.VISIBLE, used)
    if (slot.anim && !used) slot.anim.setProperty(ui.prop.VISIBLE, false)
    slot.shown = used
  }

  setDigits(name, text)

  const unit = units[name]
  if (unit && unit.len !== text.length) {
    unit.len = text.length
    unit.options.x = ROW.valueX + text.length * SMALL.w + unit.gap
    unit.widget.setProperty(ui.prop.MORE, unit.options)
  }
}

// Standbild auf den aktuellen Wert setzen.
function setStill(slot) {
  slot.still.src = slot.flap.still + '/' + slot.value + '.png'
  slot.widget.setProperty(ui.prop.MORE, slot.still)
}

// Queue one step per digit in between, so the roll always runs forwards.
function rollTo(slot, target) {
  slot.queue = []
  let from = slot.value
  while (from !== target) {
    slot.queue.push(from)
    from = (from + 1) % 10
  }
  slot.anim.setProperty(ui.prop.VISIBLE, true)
  slot.widget.setProperty(ui.prop.VISIBLE, false)
  playStep(slot)
}

function playStep(slot) {
  const from = slot.queue.shift()
  if (from === undefined) {
    // Fertig gerollt: Standbild auf den Zielwert, Animation wieder verstecken.
    setStill(slot)
    slot.widget.setProperty(ui.prop.VISIBLE, true)
    slot.anim.setProperty(ui.prop.VISIBLE, false)
    return
  }

  slot.value = (from + 1) % 10
  slot.anim.setProperty(ui.prop.MORE, {
    anim_path: slot.flap.path,
    anim_prefix: 'roll_' + from,
    anim_ext: 'png',
    anim_fps: FLAP_FPS,
    anim_size: slot.flap.frames,
    repeat_count: 1,
    anim_status: ui.anim_status.START,
    anim_complete_call: safe('flap', function () {
      playStep(slot)
    })
  })
}

// ---------------------------------------------------------------- build

function buildBackground() {
  ui.createWidget(ui.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: SCREEN,
    h: SCREEN,
    radius: SCREEN / 2,
    color: COLOR.bg
  })
}

function buildRain() {
  if (!USE_RAIN) return
  ui.createWidget(ui.widget.IMG_ANIM, {
    x: 0,
    y: 0,
    anim_path: 'image/rain',
    anim_prefix: 'rain',
    anim_ext: 'png',
    anim_fps: RAIN_FPS,
    anim_size: RAIN_FRAMES,
    repeat_count: 0,
    anim_status: ui.anim_status.START,
    default_frame_index: 0,
    show_level: ui.show_level.ONLY_NORMAL
  })
}

function text(options) {
  return ui.createWidget(ui.widget.TEXT, {
    x: options.x,
    y: options.y,
    w: options.w,
    h: options.h || SMALL.h,
    color: options.color,
    font: FONT,
    text_size: options.size || SMALL.size,
    align_h: options.align || ui.align.LEFT,
    align_v: ui.align.CENTER_V,
    text: options.text || '',
    show_level: options.level
  })
}

function buildActive() {
  const normal = ui.show_level.ONLY_NORMAL

  text({
    x: 0, y: LABEL_Y, w: SCREEN, color: COLOR.label,
    align: ui.align.CENTER_H, text: '> SYS.TIME', level: normal
  })

  slotGroup('hour', 2, TIME_X, BIG.y, BIG, COLOR.digit, FLAP.big)

  text({
    x: TIME_X + 2 * BIG.w, y: BIG.y, w: COLON_W, h: BIG.h, size: BIG.size,
    color: COLOR.digit, align: ui.align.CENTER_H, text: ':', level: normal
  })

  slotGroup('minute', 2, TIME_X + 2 * BIG.w + COLON_W, BIG.y, BIG, COLOR.digit, FLAP.big)
  slotGroup('second', 2, SEC_X, SEC.y, SEC, COLOR.second, FLAP.sec)

  widgets.cursor = ui.createWidget(ui.widget.FILL_RECT, {
    x: CURSOR.x,
    y: CURSOR.y,
    w: CURSOR.w,
    h: CURSOR.h,
    color: COLOR.digit,
    show_level: normal
  })

  ui.createWidget(ui.widget.FILL_RECT, {
    x: RULE.x,
    y: RULE.y,
    w: RULE.w,
    h: 1,
    color: COLOR.rule,
    show_level: normal
  })

  buildRow(0, 'DATE')
  buildRow(1, 'STEPS')
  buildRow(2, 'HR')
  buildRow(3, 'PWR')

  widgets.date = text({ x: ROW.valueX, y: rowY(0), w: 160, color: COLOR.value, level: normal })
  slotGroup('steps', 5, ROW.valueX, rowY(1), SMALL, COLOR.value, FLAP.sml)
  slotGroup('heart', 3, ROW.valueX, rowY(2), SMALL, COLOR.value, FLAP.sml)
  slotGroup('power', 3, ROW.valueX, rowY(3), SMALL, COLOR.value, FLAP.sml)

  unitWidget('heart', 2, 'BPM', 8)
  unitWidget('power', 3, '%', 0)
}

// The unit keeps its options around so it can be moved when the value in front
// of it grows or shrinks - prop.MORE takes the same object createWidget does.
function unitWidget(name, index, label, gap) {
  const options = {
    x: ROW.valueX,
    y: rowY(index),
    w: 60,
    h: SMALL.h,
    color: COLOR.value,
    font: FONT,
    text_size: SMALL.size,
    align_h: ui.align.LEFT,
    align_v: ui.align.CENTER_V,
    text: label,
    show_level: ui.show_level.ONLY_NORMAL
  }
  units[name] = {
    widget: ui.createWidget(ui.widget.TEXT, options),
    options: options,
    gap: gap,
    len: -1
  }
}

function rowY(index) {
  return ROW.top + index * ROW.pitch
}

function buildRow(index, label) {
  text({
    x: ROW.x, y: rowY(index), w: ROW.labelW, color: COLOR.label,
    text: label, level: ui.show_level.ONLY_NORMAL
  })
}

// Screen-off face: same position and size as the active one, no rain, no
// seconds, nothing that moves.
function buildAod() {
  const aod = ui.show_level.ONAL_AOD

  widgets.aodTime = text({
    x: TIME_X, y: BIG.y, w: 4 * BIG.w + COLON_W, h: BIG.h, size: BIG.size,
    color: COLOR.aodValue, align: ui.align.CENTER_H, text: '00:00', level: aod
  })

  text({ x: ROW.x, y: rowY(0), w: ROW.labelW, color: COLOR.aodLabel, text: 'DATE', level: aod })
  widgets.aodDate = text({ x: ROW.valueX, y: rowY(0), w: 160, color: COLOR.aodValue, level: aod })

  text({ x: ROW.x, y: rowY(1), w: ROW.labelW, color: COLOR.aodLabel, text: 'STEPS', level: aod })
  widgets.aodSteps = text({ x: ROW.valueX, y: rowY(1), w: 160, color: COLOR.aodValue, level: aod })
}

// ---------------------------------------------------------------- sensors

function openSensors() {
  time = new Time()
  step = new Step()
  heart = new HeartRate()
  battery = new Battery()
}

function wireSensors() {
  time.onPerMinute(safe('minute', updateMinute))
  step.onChange(safe('steps', function () { pending.steps = true }))
  heart.onLastChange(safe('heart', function () { pending.heart = true }))
  battery.onChange(safe('battery', function () { pending.power = true }))
}

// Offene Sensorwerte nachziehen, gebuendelt. Laeuft nur, solange der Bildschirm
// an ist - bei ausgeschaltetem Display waere das Zeichnen ohnehin unsichtbar,
// und beim Aufwachen holt refreshAll alles nach.
function flushPending() {
  if (pending.steps) {
    pending.steps = false
    setNumber('steps', step.getCurrent() || 0)
  }
  if (pending.heart) {
    pending.heart = false
    setNumber('heart', heart.getLast() || 0)
  }
  if (pending.power) {
    pending.power = false
    setNumber('power', battery.getCurrent() || 0)
  }
}

// ---------------------------------------------------------------- updates

function dateText() {
  // getDay() is 1 = Monday through 7 = Sunday.
  return WEEKDAYS[time.getDay() - 1] + ' ' + pad(time.getDate()) + ' ' + MONTHS[time.getMonth() - 1]
}

// Am Minutenwechsel so wenig wie moeglich schreiben: jeder setProperty-Aufruf
// zwingt das System zum Neuzeichnen, und darunter laeuft der Vollbild-Regen.
// Deshalb hier nur, was im sichtbaren Zifferblatt wirklich anders wird.
// Der Akku hat einen eigenen onChange-Listener und gehoert nicht hierher.
function updateMinute() {
  if (isAod()) {
    updateAod()
    return
  }

  setDigits('hour', pad(time.getHours()))
  setDigits('minute', pad(time.getMinutes()))
  setText('date', widgets.date, dateText())
}

// Die Always-On-Widgets sind im Normalbetrieb unsichtbar. Sie werden beim
// Abschalten des Displays einmal nachgezogen und danach im Minutentakt, statt
// jede Minute im laufenden Betrieb mitgeschrieben zu werden.
function updateAod() {
  setText('aodTime', widgets.aodTime, pad(time.getHours()) + ':' + pad(time.getMinutes()))
  setText('aodDate', widgets.aodDate, dateText())
  setText('aodSteps', widgets.aodSteps, String(step.getCurrent() || 0))
}

// The only thing that has to happen every second.
function tick() {
  setDigits('second', pad(time.getSeconds()))
  cursorOn = !cursorOn
  widgets.cursor.setProperty(ui.prop.VISIBLE, cursorOn)
  flushPending()
}

function isAod() {
  try {
    return getScene() === SCENE_AOD
  } catch (error) {
    console.log('[matrix] scene unavailable: ' + error)
    return false
  }
}

function refreshAll() {
  updateMinute()
  updateAod()
  pending.steps = false
  pending.heart = false
  pending.power = false
  setNumber('steps', step.getCurrent() || 0)
  setNumber('heart', heart.getLast() || 0)
  setNumber('power', battery.getCurrent() || 0)
  setDigits('second', pad(time.getSeconds()))
}

function startClock() {
  refreshAll()
  if (isAod()) return
  if (tickTimer) return
  // Not createSysTimer: that one is meant to survive the screen going off and
  // the firmware rejects a period this short ("bad repeat(1000)").
  tickTimer = setInterval(safe('tick', tick), 1000)
}

function stopClock() {
  if (!tickTimer) return
  clearInterval(tickTimer)
  tickTimer = null
}

// ---------------------------------------------------------------- entry

WatchFace({
  onInit() {},

  build() {
    stage('sensors', openSensors)
    stage('background', buildBackground)
    stage('rain', buildRain)
    stage('active', buildActive)
    stage('aod', buildAod)
    stage('events', wireSensors)
    stage('delegate', function () {
      ui.createWidget(ui.widget.WIDGET_DELEGATE, {
        resume_call: safe('resume', startClock),
        pause_call: safe('pause', function () {
          stopClock()
          updateAod()
        })
      })
    })
    stage('clock', startClock)
  },

  onDestroy() {
    stopClock()
  }
})

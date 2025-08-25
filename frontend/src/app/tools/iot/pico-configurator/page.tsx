'use client';

import React, { useMemo, useState } from 'react';

/**
 * Pico Wiring Configurator – Patch & Test (Client Component)
 *
 * Features
 * - Pick modules from the Freenove kit (and passives) and wire them to Pico, to power rails, or directly to each other.
 * - Per-pin connection selector: AUTO (to Pico), 3V3, GND, or LINK→other module pin.
 * - Drag modules around the canvas; links stay connected.
 * - Colored nets; simple Test animation (dashed lines move).
 * - Auto GPIO allocator for pins left in AUTO (conflict-free, preferring convenient GPIOs).
 * - Generates MicroPython, C (Pico SDK), and JS (Web Serial console) code where applicable.
 *
 * Note
 * - This file is a Client Component. If you want a page title, put it in a server-side layout.tsx in this route.
 */

// ---------- Small style tokens ----------
const wrap: React.CSSProperties = { padding: 16, display: 'grid', gap: 16 };
const grid: React.CSSProperties = { display: 'grid', gap: 16, gridTemplateColumns: '1fr 2fr' };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 16 };
const h2: React.CSSProperties = { fontWeight: 700, marginBottom: 8 };
const labelRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const tableCss: React.CSSProperties = { width: '100%', fontSize: 13, borderCollapse: 'collapse' };
const pre: React.CSSProperties = { fontSize: 12, background: '#f8fafc', padding: 12, borderRadius: 10, overflow: 'auto', maxHeight: 420 };
const btnRow: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };
const btn: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', background: '#f9fafb', cursor: 'pointer' };
const selectCss: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 6, padding: 4, fontSize: 12 };

// ---------- Types ----------

type Gpio = number; // 0..28 usable

type Alloc = Record<string, Gpio>;

interface PinSpec {
  kind: 'digital' | 'pwm' | 'i2c' | 'analog' | 'spi' | 'onewire' | 'passive' | 'power';
  role?: 'in' | 'out' | 'io' | 'passive' | 'power';
}

interface ModuleDef {
  id: string;
  label: string;
  pins: Record<string, PinSpec>; // logical pins
  diagram: { width: number; height: number; pins: Array<{ name: string; side: 'left' | 'right'; y: number }>; };
  genMicroPython: (alloc: Alloc) => string;
  genC: (alloc: Alloc) => string;
  genJS: (alloc: Alloc) => string;
}

// Utility
function keyOf(modId: string, pin: string){ return `${modId}.${pin}`; }

// ---------- Catalog of supported modules ----------

const MODULES: ModuleDef[] = [
  // Passive primitives for series wiring
  {
    id: 'button2t', label: 'Button (2 terminals)',
    pins: { A: { kind: 'passive', role: 'passive' }, B: { kind: 'passive', role: 'passive' } },
    diagram: { width: 110, height: 50, pins: [{ name: 'A', side: 'left', y: 25 }, { name: 'B', side: 'right', y: 25 }] },
    genMicroPython: () => `# Button wired in hardware (2T). If one side to GPx and other to GND/3V3, use internal pull.`,
    genC: () => `// Button (2T) – hardware wiring. Use internal pull-up/down when one side to GND/3V3.`,
    genJS: () => `// Host not required.`,
  },
  {
    id: 'resistor330', label: 'Resistor 330Ω',
    pins: { A: { kind: 'passive', role: 'passive' }, B: { kind: 'passive', role: 'passive' } },
    diagram: { width: 90, height: 40, pins: [{ name: 'A', side: 'left', y: 20 }, { name: 'B', side: 'right', y: 20 }] },
    genMicroPython: () => `# Passive resistor wired in hardware.`,
    genC: () => `// Passive resistor wired in hardware.`,
    genJS: () => `// Host not required.`,
  },
  {
    id: 'led_diode', label: 'LED (discrete)',
    pins: { ANODE: { kind: 'passive', role: 'passive' }, CATHODE: { kind: 'passive', role: 'passive' } },
    diagram: { width: 100, height: 50, pins: [{ name: 'ANODE', side: 'left', y: 25 }, { name: 'CATHODE', side: 'right', y: 25 }] },
    genMicroPython: () => `# LED in hardware path. If Anode->GPx via resistor and Cathode->GND, toggle pin to blink.`,
    genC: () => `// LED in hardware path.`,
    genJS: () => `// Host not required.`,
  },

  // Sensors/actuators
  {
    id: 'pir', label: 'PIR Motion',
    pins: { OUT: { kind: 'digital', role: 'out' } },
    diagram: { width: 110, height: 60, pins: [{ name: 'OUT', side: 'left', y: 30 }] },
    genMicroPython: ({ OUT }) => `from machine import Pin
import time
pir = Pin(${OUT}, Pin.IN)
print('PIR on GP${OUT}')
while True:
    if pir.value():
        print('MOTION')
        time.sleep(1)
    time.sleep_ms(50)
`,
    genC: ({ OUT }) => `#include <stdio.h>
#include "pico/stdlib.h"
int main(){ stdio_init_all(); gpio_init(${OUT}); gpio_set_dir(${OUT}, GPIO_IN); while(1){ if(gpio_get(${OUT})) { puts("MOTION"); sleep_ms(1000);} sleep_ms(50);} }
`,
    genJS: () => `// Host not required.`,
  },
  {
    id: 'ultrasonic', label: 'Ultrasonic HC-SR04',
    pins: { TRIG: { kind: 'digital', role: 'out' }, ECHO: { kind: 'digital', role: 'in' } },
    diagram: { width: 140, height: 70, pins: [{ name: 'TRIG', side: 'left', y: 20 }, { name: 'ECHO', side: 'right', y: 20 }] },
    genMicroPython: ({ TRIG, ECHO }) => `from machine import Pin
import machine, time
trig = Pin(${TRIG}, Pin.OUT); echo = Pin(${ECHO}, Pin.IN)
trig.value(0)
print('Ultrasonic TRIG=GP${TRIG} ECHO=GP${ECHO}')

def distance_cm():
    trig.value(0); time.sleep_us(2)
    trig.value(1); time.sleep_us(10); trig.value(0)
    t = machine.time_pulse_us(echo, 1, 30000)
    if t<0: return -1
    return 0.01715 * t

while True:
    d = distance_cm()
    if d>=0: print('DIST', round(d,1), 'cm')
    time.sleep(0.2)
`,
    genC: ({ TRIG, ECHO }) => `#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/timer.h"
static uint64_t pulse_in(uint pin,bool level,uint32_t timeout_us){
  absolute_time_t t0=get_absolute_time();
  while(gpio_get(pin)==level){ if(absolute_time_diff_us(t0, get_absolute_time())>timeout_us) return 0; }
  while(gpio_get(pin)!=level){ if(absolute_time_diff_us(t0, get_absolute_time())>timeout_us) return 0; }
  absolute_time_t s=get_absolute_time();
  while(gpio_get(pin)==level){ if(absolute_time_diff_us(s, get_absolute_time())>timeout_us) return 0; }
  return absolute_time_diff_us(s, get_absolute_time());
}
int main(){ stdio_init_all(); gpio_init(${TRIG}); gpio_set_dir(${TRIG}, GPIO_OUT); gpio_put(${TRIG},0); gpio_init(${ECHO}); gpio_set_dir(${ECHO}, GPIO_IN); while(1){ gpio_put(${TRIG},1); sleep_us(10); gpio_put(${TRIG},0); uint64_t us=pulse_in(${ECHO},1,30000); float cm = us*0.01715f; printf("DIST %.1f cm
", cm); sleep_ms(200);} }
`,
    genJS: () => `// Host not required.`,
  },
  {
    id: 'relay', label: 'Relay Module (IN)',
    pins: { IN: { kind: 'digital', role: 'in' } },
    diagram: { width: 120, height: 60, pins: [{ name: 'IN', side: 'left', y: 30 }] },
    genMicroPython: ({ IN }) => `from machine import Pin
import time
rel = Pin(${IN}, Pin.OUT)
print('Relay on GP${IN}')
for i in range(3):
    rel.value(1); print('ON'); time.sleep(1)
    rel.value(0); print('OFF'); time.sleep(1)
`,
    genC: ({ IN }) => `#include <stdio.h>
#include "pico/stdlib.h"
int main(){ stdio_init_all(); gpio_init(${IN}); gpio_set_dir(${IN}, GPIO_OUT); for(;;){ gpio_put(${IN},1); puts("ON"); sleep_ms(1000); gpio_put(${IN},0); puts("OFF"); sleep_ms(1000);} }
`,
    genJS: () => `// Host not required.`,
  },
  {
    id: 'stepper_uln2003', label: 'Stepper (28BYJ-48 via ULN2003)',
    pins: { IN1: { kind: 'digital', role: 'out' }, IN2: { kind: 'digital', role: 'out' }, IN3: { kind: 'digital', role: 'out' }, IN4: { kind: 'digital', role: 'out' } },
    diagram: { width: 170, height: 90, pins: [ { name: 'IN1', side: 'left', y: 20 }, { name: 'IN2', side: 'left', y: 40 }, { name: 'IN3', side: 'left', y: 60 }, { name: 'IN4', side: 'left', y: 80 } ] },
    genMicroPython: ({ IN1, IN2, IN3, IN4 }) => `from machine import Pin
import time
p1,p2,p3,p4 = Pin(${IN1},Pin.OUT), Pin(${IN2},Pin.OUT), Pin(${IN3},Pin.OUT), Pin(${IN4},Pin.OUT)
seq = [(1,0,0,1),(1,0,0,0),(1,1,0,0),(0,1,0,0),(0,1,1,0),(0,0,1,0),(0,0,1,1),(0,0,0,1)]
for _ in range(256):
    for a,b,c,d in seq: p1.value(a); p2.value(b); p3.value(c); p4.value(d); time.sleep_ms(4)
# off
p1.value(0); p2.value(0); p3.value(0); p4.value(0)
`,
    genC: ({ IN1, IN2, IN3, IN4 }) => `#include <stdio.h>
#include "pico/stdlib.h"
int main(){ stdio_init_all(); int pins[4]={${IN1},${IN2},${IN3},${IN4}}; for(int i=0;i<4;i++){ gpio_init(pins[i]); gpio_set_dir(pins[i],GPIO_OUT);} int seq[8][4]={{1,0,0,1},{1,0,0,0},{1,1,0,0},{0,1,0,0},{0,1,1,0},{0,0,1,0},{0,0,1,1},{0,0,0,1}}; for(int r=0;r<256;r++){ for(int s=0;s<8;s++){ for(int i=0;i<4;i++) gpio_put(pins[i], seq[s][i]); sleep_ms(4);} } for(int i=0;i<4;i++) gpio_put(pins[i],0);}
`,
    genJS: () => `// Host not required.`,
  },

  // Keypad, motor, servo
  {
    id: 'keypad4x4', label: 'Matrix Keypad (4×4)',
    pins: { R1: { kind: 'digital', role: 'in' }, R2: { kind: 'digital', role: 'in' }, R3: { kind: 'digital', role: 'in' }, R4: { kind: 'digital', role: 'in' }, C1: { kind: 'digital', role: 'out' }, C2: { kind: 'digital', role: 'out' }, C3: { kind: 'digital', role: 'out' }, C4: { kind: 'digital', role: 'out' } },
    diagram: { width: 110, height: 120, pins: [ { name: 'R1', side: 'left', y: 10 }, { name: 'R2', side: 'left', y: 30 }, { name: 'R3', side: 'left', y: 50 }, { name: 'R4', side: 'left', y: 70 }, { name: 'C1', side: 'right', y: 10 }, { name: 'C2', side: 'right', y: 30 }, { name: 'C3', side: 'right', y: 50 }, { name: 'C4', side: 'right', y: 70 } ] },
    genMicroPython: ({ R1, R2, R3, R4, C1, C2, C3, C4 }) => `from machine import Pin
import time
rows=[${R1},${R2},${R3},${R4}]
cols=[${C1},${C2},${C3},${C4}]
row_pins=[Pin(r,Pin.IN,Pin.PULL_UP) for r in rows]
col_pins=[Pin(c,Pin.OUT) for c in cols]
keys=[['1','2','3','A'],['4','5','6','B'],['7','8','9','C'],['*','0','#','D']]

def scan_key():
  for ci,c in enumerate(col_pins):
    c.value(0); time.sleep_us(200)
    for ri,r in enumerate(row_pins):
      if r.value()==0:
        while r.value()==0: time.sleep_ms(10)
        c.value(1); return keys[ri][ci]
    c.value(1)
  return None

print('Keypad ready')
while True:
  k=scan_key()
  if k: print('KEY',k)
  time.sleep_ms(20)
`,
    genC: ({ R1, R2, R3, R4, C1, C2, C3, C4 }) => `#include <stdio.h>
#include "pico/stdlib.h"
static const uint rows[4] = {${R1}, ${R2}, ${R3}, ${R4}};
static const uint cols[4] = {${C1}, ${C2}, ${C3}, ${C4}};
static const char *map[4] = {"123A","456B","789C","*0#D"};
char keypad_scan(void){ for(int ci=0;ci<4;++ci){ gpio_put(cols[ci],0); sleep_us(200); for(int ri=0;ri<4;++ri){ if(gpio_get(rows[ri])==0){ while(gpio_get(rows[ri])==0) tight_loop_contents(); gpio_put(cols[ci],1); return map[ri][ci]; } } gpio_put(cols[ci],1);} return 0; }
int main(){ stdio_init_all(); for(int i=0;i<4;++i){ gpio_init(rows[i]); gpio_set_dir(rows[i],GPIO_IN); gpio_pull_up(rows[i]); } for(int i=0;i<4;++i){ gpio_init(cols[i]); gpio_set_dir(cols[i],GPIO_OUT); gpio_put(cols[i],1);} puts("Keypad ready"); while(true){ char k=keypad_scan(); if(k){ printf("KEY %c
",k);} sleep_ms(20);} }
`,
    genJS: () => `// Web Serial console reader (optional)`,
  },
  {
    id: 'dc_motor_l293d', label: 'DC Motor via L293D (1 channel)',
    pins: { IN1: { kind: 'digital', role: 'out' }, IN2: { kind: 'digital', role: 'out' }, ENA: { kind: 'pwm', role: 'out' } },
    diagram: { width: 130, height: 100, pins: [ { name: 'ENA', side: 'left', y: 20 }, { name: 'IN1', side: 'left', y: 40 }, { name: 'IN2', side: 'left', y: 60 } ] },
    genMicroPython: ({ IN1, IN2, ENA }) => `from machine import Pin, PWM
import time
IN1=Pin(${IN1},Pin.OUT)
IN2=Pin(${IN2},Pin.OUT)
ENA=PWM(Pin(${ENA}))
ENA.freq(20000)

def motor(speed):
  s=int(min(100,max(-100,speed)))
  if s>=0: IN1.value(1); IN2.value(0)
  else:    IN1.value(0); IN2.value(1)
  ENA.duty_u16(int(abs(s)*65535/100))
`,
    genC: ({ IN1, IN2, ENA }) => `#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/pwm.h"
const uint IN1=${IN1}, IN2=${IN2}, ENA=${ENA};
void motor(int speed){ if(speed>=0){ gpio_put(IN1,1); gpio_put(IN2,0);} else { gpio_put(IN1,0); gpio_put(IN2,1);} uint16_t duty=(uint16_t)(abs(speed)*65535/100); uint slice=pwm_gpio_to_slice_num(ENA); pwm_set_chan_level(slice,pwm_gpio_to_channel(ENA),duty);}
int main(){ stdio_init_all(); gpio_init(IN1); gpio_set_dir(IN1,GPIO_OUT); gpio_init(IN2); gpio_set_dir(IN2,GPIO_OUT); gpio_set_function(ENA,GPIO_FUNC_PWM); uint slice=pwm_gpio_to_slice_num(ENA); pwm_set_wrap(slice,65535); pwm_set_clkdiv(slice,1.0f); pwm_set_enabled(slice,true); puts("Motor ready"); }
`,
    genJS: () => `// Host optional.`,
  },
  {
    id: 'servo', label: 'Servo (SG90 or similar)',
    pins: { PWM: { kind: 'pwm', role: 'out' } },
    diagram: { width: 90, height: 60, pins: [ { name: 'PWM', side: 'left', y: 30 } ] },
    genMicroPython: ({ PWM }) => `from machine import Pin, PWM
import time
servo=PWM(Pin(${PWM})); servo.freq(50)
def write_angle(deg): us=500+(2000*deg)//180; servo.duty_u16(int(us*65535//20000))
for a in [0,45,90,135,180,90]: write_angle(a); time.sleep(0.6)
`,
    genC: ({ PWM }) => `#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/pwm.h"
const uint SERVO=${PWM}; void write_us(uint gpio,uint us){ uint slice=pwm_gpio_to_slice_num(gpio); pwm_set_wrap(slice,20000); pwm_set_clkdiv(slice,125.0f); pwm_set_chan_level(slice,pwm_gpio_to_channel(gpio),us);} int main(){ stdio_init_all(); gpio_set_function(SERVO,GPIO_FUNC_PWM); write_us(SERVO,1500); }
`,
    genJS: () => `// Host not required.`,
  },
];

// ---------- Connection model ----------

type LinkChoice = 'AUTO' | '3V3' | 'GND' | { linkTo: { modId: string, pin: string } };

// ---------- Pin allocator (skips pins that are LINKed or tied to power rails) ----------

const DEFAULT_DIGITAL_POOL: Gpio[] = [ 2,3,4,5,6,7,8,9, 10,11,12,13,14,15, 16,17,18,19,20,21,22,26,27,28 ];
const DEFAULT_PWM_POOL: Gpio[]     = [ 12,13,14,15,16,17,18,19,20,21 ];

function allocatePins(selected: string[], links: Record<string, LinkChoice>): Record<string, Alloc> {
  const digPool = [...DEFAULT_DIGITAL_POOL];
  const pwmPool = [...DEFAULT_PWM_POOL];
  const taken = new Set<Gpio>();
  const out: Record<string, Alloc> = {};

  function take(pool: Gpio[]): Gpio {
    while (pool.length) { const g = pool.shift()!; if (!taken.has(g)) { taken.add(g); return g; } }
    throw new Error('Ran out of GPIOs');
  }

  for (const id of selected) {
    const mod = MODULES.find((m) => m.id === id)!;
    const alloc: Alloc = {};
    Object.entries(mod.pins).forEach(([name, spec]) => {
      const choice = links[keyOf(id,name)] ?? 'AUTO';
      if (choice === 'AUTO') {
        if (spec.kind === 'pwm') alloc[name] = take(pwmPool);
        else if (spec.kind === 'digital' || spec.kind === 'analog' || spec.kind === 'onewire') alloc[name] = take(digPool);
      }
    });
    out[id] = alloc;
  }
  return out;
}

// ---------- SVG Wiring Diagram (draggable, colored nets, test animation) ----------

function PicoSvg({ pinMap, modules, links, zoom = 0.7, compact = true, positions, onStartDrag, onPinClick, connectMode, highlightPin, testing, tick = 0, netColors }: {
  pinMap: Record<string, Alloc>;
  modules: ModuleDef[];
  links: Record<string, LinkChoice>;
  zoom?: number;
  compact?: boolean;
  positions: Record<string, { x: number; y: number }>;
  onStartDrag?: (modId: string, clientX: number, clientY: number) => void;
  onPinClick?: (modId: string, pin: string) => void;
  connectMode?: boolean;
  highlightPin?: string | null;
  testing?: boolean;
  tick?: number;
  netColors: (netId: string) => string;
}){
  const baseWidth = 820;
  const step = compact ? 100 : 150; // vertical spacing between blocks
  const height = Math.max(420, 120 + step * modules.length);
  const width = baseWidth;

  const leftPins: Gpio[]  = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
  const rightPins: Gpio[] = [16,17,18,19,20,21,22,26,27,28];
  const pinY = (idx: number) => 80 + idx * 18;

  const wires: Array<{ x1: number; y1: number; x2: number; y2: number; label?: string; color?: string }> = [];

  const blocks = modules.map((mod, i) => {
    const defX = 560 + (i % 2) * 160;
    const defY = 60 + Math.floor(i / 2) * step;
    const p = positions[mod.id] || { x: defX, y: defY };
    return { id: mod.id, x: p.x, y: p.y, def: mod };
  });

  function picoPos(gpio: Gpio){
    const li = leftPins.indexOf(gpio); if (li >= 0) return { x: 240, y: pinY(li) };
    const ri = rightPins.indexOf(gpio); if (ri >= 0) return { x: 420, y: pinY(ri) };
    return { x: 330, y: 60 };
  }

  const rail3v3 = { x: 80,  y1: 60, y2: height - 60 };
  const railGnd = { x: 140, y1: 60, y2: height - 60 };

  function drawConn(a: { x: number, y: number }, b: { x: number, y: number }, label?: string, color?: string){
    wires.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, label, color });
  }

  // Map pin positions for clickable ends
  const pos: Record<string, { x: number, y: number }> = {};
  blocks.forEach((b) => {
    b.def.diagram.pins.forEach((p) => {
      const pX = p.side === 'left' ? b.x : b.x + b.def.diagram.width;
      const pY = b.y + p.y;
      pos[keyOf(b.id, p.name)] = { x: pX, y: pY };
    });
  });

  // Pico AUTO wires
  modules.forEach((m) => {
    Object.keys(m.pins).forEach((pinName) => {
      const k = keyOf(m.id, pinName);
      const choice = links[k] ?? 'AUTO';
      if (choice === 'AUTO'){
        const gpio = pinMap[m.id]?.[pinName];
        if (gpio !== undefined){ drawConn(pos[k], picoPos(gpio), `GP${gpio}`, '#64748b'); }
      }
    });
  });

  // User links and rails (colored)
  modules.forEach((m) => {
    Object.keys(m.pins).forEach((pinName) => {
      const k = keyOf(m.id, pinName);
      const choice = links[k];
      if (!choice) return;
      if (choice === '3V3')      drawConn(pos[k], { x: rail3v3.x, y: pos[k].y }, '3V3', '#ef4444');
      else if (choice === 'GND') drawConn(pos[k], { x: railGnd.x, y: pos[k].y }, 'GND', '#111827');
      else if (typeof choice === 'object' && choice.linkTo){
        const otherK = keyOf(choice.linkTo.modId, choice.linkTo.pin);
        if (otherK < k) return; // avoid duplicate lines
        const otherPos = pos[otherK];
        if (otherPos) {
          const netId = [k, otherK].sort().join('--');
          drawConn(pos[k], otherPos, undefined, netColors(netId));
        }
      }
    });
  });

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet" style={{ width: Math.round(baseWidth * zoom) + 'px', maxWidth: '100%', height: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <text x={20} y={24} fontSize={16} fontWeight={'bold' as any}>Raspberry Pi Pico – Patchable schematic</text>

        {/* Power rails */}
        <line x1={rail3v3.x} y1={rail3v3.y1} x2={rail3v3.x} y2={rail3v3.y2} stroke="#ef4444" strokeWidth={4} />
        <text x={rail3v3.x - 16} y={48} fontSize={12}>3V3</text>
        <line x1={railGnd.x} y1={railGnd.y1} x2={railGnd.x} y2={railGnd.y2} stroke="#111827" strokeWidth={4} />
        <text x={railGnd.x - 16} y={48} fontSize={12}>GND</text>

        {/* Pico board */}
        <rect x={300} y={40} width={80} height={360} rx={10} fill="#f8fafc" stroke="#0f172a" />
        <text x={312} y={58} fontSize={12}>USB</text>

        {/* Left pins */}
        {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map((g, i) => (
          <g key={`L${g}`}>
            <circle cx={280} cy={pinY(i)} r={4} fill="#0f172a" />
            <text x={240} y={pinY(i)+4} fontSize={11}>{`GP${g}`}</text>
            <line x1={280} y1={pinY(i)} x2={300} y2={pinY(i)} stroke="#0f172a" />
          </g>
        ))}

        {/* Right pins */}
        {[16,17,18,19,20,21,22,26,27,28].map((g, i) => (
          <g key={`R${g}`}>
            <line x1={380} y1={pinY(i)} x2={400} y2={pinY(i)} stroke="#0f172a" />
            <circle cx={400} cy={pinY(i)} r={4} fill="#0f172a" />
            <text x={408} y={pinY(i)+4} fontSize={11}>{`GP${g}`}</text>
          </g>
        ))}

        {/* Module blocks (draggable) */}
        {blocks.map((b) => (
          <g key={b.id} style={{ cursor: 'move' }} onMouseDown={(e)=> onStartDrag && onStartDrag(b.id, (e as any).clientX, (e as any).clientY)}>
            <rect x={b.x} y={b.y} width={b.def.diagram.width} height={b.def.diagram.height} rx={10} fill="#eef2ff" stroke="#312e81" />
            <text x={b.x + 8} y={b.y - 6} fontSize={12} fontWeight={'bold' as any}>{b.def.label}</text>
            {b.def.diagram.pins.map((p, idx) => {
              const cx = p.side === 'left' ? b.x : b.x + b.def.diagram.width;
              const cy = b.y + p.y;
              const k = keyOf(b.id, p.name);
              const isSel = highlightPin === k;
              return (
                <g key={idx} onClick={()=> onPinClick && onPinClick(b.id, p.name)} style={{ cursor: 'pointer' }}>
                  <circle cx={cx} cy={cy} r={5} fill={isSel ? '#10b981' : '#312e81'} stroke={isSel ? '#064e3b' : 'none'} />
                  <text x={(p.side === 'left' ? b.x - 34 : b.x + b.def.diagram.width + 6)} y={cy + 4} fontSize={11}>{p.name}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Wires (colored, animated during Test) */}
        {wires.map((w, i) => (
          <g key={i}>
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={w.color || (w.label === '3V3' ? '#ef4444' : w.label === 'GND' ? '#111827' : '#64748b')} strokeWidth={2} strokeDasharray={testing ? '6 6' : undefined} strokeDashoffset={testing ? (tick % 12) : undefined} />
            {w.label && <text x={(w.x1 + w.x2) / 2 + 4} y={(w.y1 + w.y2) / 2 - 4} fontSize={10}>{w.label}</text>}
          </g>
        ))}

        <text x={20} y={height - 20} fontSize={12}>Note: All grounds common. Motors/steppers on external supply (L293D VS / ULN2003 V+). Do NOT power motors from Pico 3V3.</text>
      </svg>
    </div>
  );
}

// ---------- Validation ----------

function validate(selected: string[], links: Record<string, LinkChoice>): string[] {
  const warns: string[] = [];

  // Simple short detection (same pin assigned to both rails)
  const connectedTo3v3 = new Set<string>();
  const connectedToGnd = new Set<string>();
  Object.entries(links).forEach(([k,v]) => { if (v === '3V3') connectedTo3v3.add(k); if (v === 'GND') connectedToGnd.add(k); });
  for (const k of connectedTo3v3){ if (connectedToGnd.has(k)) warns.push(`Pin ${k} tied to both 3V3 and GND`); }

  // Output-to-output link warnings
  selected.forEach(id => {
    const mod = MODULES.find(m=>m.id===id)!;
    Object.keys(mod.pins).forEach(pin => {
      const ch = links[keyOf(id,pin)];
      if (ch && typeof ch === 'object' && ch.linkTo){
        const other = MODULES.find(m=>m.id===ch.linkTo.modId)!;
        const a = mod.pins[pin].role; const b = other.pins[ch.linkTo.pin].role;
        if ((a === 'out' && b === 'out')) warns.push(`Output ${id}.${pin} linked to output ${ch.linkTo.modId}.${ch.linkTo.pin}`);
      }
    });
  });

  // Keypad reminder
  if (selected.includes('keypad4x4')){
    const need = ['R1','R2','R3','R4','C1','C2','C3','C4'].filter(p => (links[keyOf('keypad4x4',p)] ?? 'AUTO') !== 'AUTO');
    if (need.length) warns.push('Keypad: pins not on Pico (AUTO). Scanning needs Pico control.');
  }

  return warns;
}

// ---------- Code bundle generator (skips hardware-only nets) ----------

function generateCode(selected: string[], pinMap: Record<string, Alloc>, links: Record<string, LinkChoice>){
  let py = ""; let c = ""; let js = "";
  selected.forEach(id => {
    const mod = MODULES.find(m => m.id === id)!;
    const anyPico = Object.keys(mod.pins).some(pinName => (links[keyOf(id,pinName)] ?? 'AUTO') === 'AUTO' && pinMap[id]?.[pinName] !== undefined);
    if (!anyPico){
      py += `
# === ${mod.label} (hardware wiring only) ===
# No Pico pins assigned.
`;
      c  += `
// === ${mod.label} (hardware wiring only) ===
`;
      return;
    }
    py += `
# === ${mod.label} ===
${mod.genMicroPython(pinMap[id])}
`;
    c  += `
// === ${mod.label} ===
${mod.genC(pinMap[id])}
`;
    js += `
// === ${mod.label} ===
${mod.genJS(pinMap[id])}
`;
  });

  // Optional combo: keypad unlock -> motor
  if (selected.includes('keypad4x4') && selected.includes('dc_motor_l293d')){
    py += `
# === Combo demo: keypad unlock drives motor for 3s ===
# Enter 1 2 3 4 # to unlock
from machine import Pin, PWM
import time
secret=['1','2','3','4','#']; buf=[]
while True:
  k=scan_key()
  if k:
    print('KEY',k)
    buf=(buf+[k])[-5:]
    if buf==secret:
      print('UNLOCK')
      motor(80); time.sleep(3); motor(0)
  time.sleep_ms(20)
`;
    c += `
// === Combo demo (C) – keypad unlock -> motor ===
// Combine keypad_scan() + motor(speed) in your main loop.
`;
  }

  return { py: py.trim(), c: c.trim(), js: js.trim() };
}

// ---------- Helpers: copy & download ----------

function downloadFile(name: string, contents: string){
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}

function LangButtons({ code }: { code: { py: string, c: string, js: string } }){
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <button style={btn} onClick={()=>downloadFile('pico_build.py', code.py)}>⬇ Download .py</button>
        <button style={btn} onClick={()=>downloadFile('pico_main.c', code.c)}>⬇ Download .c</button>
        <button style={btn} onClick={()=>downloadFile('host_test.js', code.js || `// Optional Web Serial reader`) }>⬇ Download .js</button>
        <button style={btn} onClick={()=>navigator.clipboard?.writeText(code.py)}>📋 Copy Python</button>
        <button style={btn} onClick={()=>navigator.clipboard?.writeText(code.c)}>📋 Copy C</button>
        <button style={btn} onClick={()=>navigator.clipboard?.writeText(code.js)}>📋 Copy JS</button>
      </div>
    </div>
  );
}

function CodeBlocks({ code }: { code: { py: string, c: string, js: string } }){
  return (
    <>
      <div style={card}>
        <div style={h2}>MicroPython</div>
        <pre style={pre}><code>{code.py}</code></pre>
      </div>
      <div style={card}>
        <div style={h2}>C (Pico SDK)</div>
        <pre style={pre}><code>{code.c}</code></pre>
      </div>
      <div style={card}>
        <div style={h2}>JavaScript (browser test via Web Serial)</div>
        <pre style={pre}><code>{code.js || `// Optional: paste the Web Serial console reader from the Keypad module.
// Serve over HTTPS (or localhost) and run to view serial logs from the Pico.`}</code></pre>
      </div>
    </>
  );
}

// ---------- Page ----------

export default function Page(){
  // View / layout
  const [zoom, setZoom] = useState(0.7);
  const [compact, setCompact] = useState(true);

  // Selection & links
  const [selected, setSelected] = useState<string[]>(['button2t','led_diode','resistor330','relay','dc_motor_l293d','keypad4x4']);
  const [links, setLinks] = useState<Record<string, LinkChoice>>({
    // Example: series LED via button
    'button2t.A': '3V3',
    'button2t.B': { linkTo: { modId: 'led_diode', pin: 'ANODE' } },
    'led_diode.CATHODE': { linkTo: { modId: 'resistor330', pin: 'A' } },
    'resistor330.B': 'GND',
    // Example logic: Button.B also drives Relay.IN
    'relay.IN': { linkTo: { modId: 'button2t', pin: 'B' } },
  });

  // Positions & dragging
  const [positions, setPositions] = useState<Record<string, {x:number,y:number}>>({});
  const [dragging, setDragging]  = useState<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Connect mode (click pin → click other pin)
  const [connectMode, setConnectMode] = useState(false);
  const [selectedPinKey, setSelectedPinKey] = useState<string | null>(null);

  // Test mode (animate wires)
  const [testing, setTesting] = useState(false);
  const [tick, setTick] = useState(0);
  React.useEffect(()=>{ if(!testing) return; const h = setInterval(()=> setTick(t=>t+1), 120); return ()=> clearInterval(h); }, [testing]);

  const pinMap = useMemo(() => allocatePins(selected, links), [selected, links]);
  const mods   = useMemo(() => MODULES.filter(m => selected.includes(m.id)), [selected]);
  const code   = useMemo(() => generateCode(selected, pinMap, links), [selected, pinMap, links]);
  const warnings = useMemo(() => validate(selected, links), [selected, links]);

  // default positions for new modules
  React.useEffect(()=>{
    setPositions(prev => {
      const next = { ...prev };
      mods.forEach((m, i) => {
        if (!next[m.id]){
          const x = 560 + (i % 2) * 160;
          const y = 60 + Math.floor(i / 2) * (compact ? 100 : 150);
          next[m.id] = { x, y };
        }
      });
      return next;
    });
  }, [mods, compact]);

  function setLinkPair(aK: string, bK: string){
    setLinks(prev => ({
      ...prev,
      [aK]: { linkTo: { modId: bK.split('.')[0], pin: bK.split('.')[1] } },
      [bK]: { linkTo: { modId: aK.split('.')[0], pin: aK.split('.')[1] } },
    }));
  }

  function onStartDrag(modId: string, clientX: number, clientY: number){
    const p = positions[modId] || { x: 560, y: 60 };
    setDragging({ id: modId, sx: clientX, sy: clientY, ox: p.x, oy: p.y });
  }
  function onMouseMove(e: React.MouseEvent){
    if (!dragging) return;
    const dx = (e.clientX - dragging.sx) / Math.max(zoom, 0.01);
    const dy = (e.clientY - dragging.sy) / Math.max(zoom, 0.01);
    setPositions(prev => ({ ...prev, [dragging.id]: { x: dragging.ox + dx, y: dragging.oy + dy } }));
  }
  function onMouseUp(){ setDragging(null); }

  function onPinClick(modId: string, pin: string){
    if (!connectMode) return;
    const k = `${modId}.${pin}`;
    if (!selectedPinKey){ setSelectedPinKey(k); return; }
    if (selectedPinKey === k){ setSelectedPinKey(null); return; }
    setLinkPair(selectedPinKey, k);
    setSelectedPinKey(null);
  }

  // stable color per link-net
  function netColors(netId: string){
    let h = 0; for (let i=0;i<netId.length;i++) h = (h*31 + netId.charCodeAt(i)) >>> 0;
    const hue = h % 360; return `hsl(${hue} 70% 45%)`;
  }

  return (
    <div style={wrap} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>Pico Wiring Configurator – Patch & Test</div>
      <div style={{ color: '#6b7280' }}>Drag modules, color-coded links, click-to-connect pins, and a simple Test mode animation.</div>

      <div style={grid}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={card}>
            <div style={h2}>1) Choose modules</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflow: 'auto' }}>
              {MODULES.map(m => (
                <label key={m.id} style={labelRow}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e)=> setSelected(s => (e.target as HTMLInputElement).checked ? [...s, m.id] : s.filter(x=>x!==m.id))}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={h2}>2) Connections (per-pin)</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflow: 'auto' }}>
              {mods.map(m => (
                <div key={m.id}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                  {Object.keys(m.pins).map(pin => {
                    const k = `${m.id}.${pin}`;
                    const choice = links[k] ?? 'AUTO';
                    const linkables: string[] = [];
                    mods.forEach(mm => { if (mm.id !== m.id) Object.keys(mm.pins).forEach(pp => linkables.push(`${mm.id}.${pp}`)); });
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 160, fontFamily: 'ui-monospace, Menlo, monospace' }}>{pin}</div>
                        <select
                          value={ typeof choice === 'string' ? choice : `LINK:${choice.linkTo.modId}.${choice.linkTo.pin}` }
                          onChange={(e)=>{
                            const v = (e.target as HTMLSelectElement).value;
                            if (v === 'AUTO' || v === '3V3' || v === 'GND') {
                              setLinks(prev => ({ ...prev, [k]: v }));
                            } else if (v.startsWith('LINK:')){
                              const target = v.replace('LINK:','');
                              setLinkPair(k, target);
                            }
                          }}
                          style={selectCss}
                        >
                          <option value="AUTO">AUTO (Pico)</option>
                          <option value="3V3">3V3 rail</option>
                          <option value="GND">GND rail</option>
                          <optgroup label="Link to module pin">
                            {linkables.map(opt => <option key={opt} value={`LINK:${opt}`}>{opt}</option>)}
                          </optgroup>
                        </select>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{typeof choice === 'string' ? choice : `LINK→ ${choice.linkTo.modId}.${choice.linkTo.pin}`}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Tip: Toggle <b>Connect mode</b> to click pins directly on the diagram and create links.</div>
          </div>

          <div style={card}>
            <div style={h2}>3) Output languages</div>
            <LangButtons code={code} />
          </div>

          <div style={{ ...card, background: '#fffbeb', borderColor: '#fef3c7' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes & Safety</div>
            <ul style={{ fontSize: 14, paddingLeft: 18, margin: 0 }}>
              <li>All grounds common. Motors/steppers on external supply (L293D VS / ULN2003 V+).</li>
              <li>Drag modules to rearrange; colored links help you trace connections.</li>
              <li>Connect mode: click Pin A, then Pin B to form a link. Use dropdowns to tie to 3V3/GND or AUTO (Pico).</li>
            </ul>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {warnings.length>0 && (
            <div style={{ ...card, borderColor: '#f59e0b', background: '#fffbeb' }}>
              <div style={h2}>Validation warnings</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.map((w,i)=>(<li key={i} style={{ fontSize: 13 }}>{w}</li>))}
              </ul>
            </div>
          )}

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={h2}>Schematic wiring</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Zoom
                  <input type="range" min={0.4} max={1} step={0.05} onChange={(e)=> setZoom(parseFloat((e.target as HTMLInputElement).value))} value={zoom} />
                  <span style={{ width: 44, textAlign: 'right', fontSize: 12 }}>{Math.round(zoom*100)}%</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Compact
                  <input type="checkbox" checked={compact} onChange={(e)=> setCompact((e.target as HTMLInputElement).checked)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Connect mode
                  <input type="checkbox" checked={connectMode} onChange={(e)=> { setConnectMode((e.target as HTMLInputElement).checked); setSelectedPinKey(null); }} />
                </label>
                <button style={{ ...btn, background: connectMode ? '#eef2ff' : '#f9fafb' }} onClick={()=> setConnectMode(v=>!v)}>{connectMode ? 'Exit connect' : 'Enter connect'}</button>
                <button style={{ ...btn, background: testing ? '#dcfce7' : '#f9fafb' }} onClick={()=> setTesting(v=>!v)}>{testing ? 'Stop test' : 'Test circuit'}</button>
                <button style={btn} onClick={()=> { setLinks({}); setSelectedPinKey(null); }}>Clear links</button>
              </div>
            </div>
            <PicoSvg
              pinMap={pinMap}
              modules={mods}
              links={links}
              zoom={zoom}
              compact={compact}
              positions={positions}
              onStartDrag={onStartDrag}
              onPinClick={onPinClick}
              connectMode={connectMode}
              highlightPin={selectedPinKey}
              testing={testing}
              tick={tick}
              netColors={netColors}
            />
          </div>

          <div style={card}>
            <div style={h2}>Pin map</div>
            <table style={tableCss}>
              <thead>
                <tr style={{ color: '#6b7280', textAlign: 'left' }}><th>Module</th><th>Signal</th><th>GPIO</th></tr>
              </thead>
              <tbody>
                {mods.map(m => (
                  Object.entries(pinMap[m.id] || {}).map(([sig, gpio]) => (
                    <tr key={m.id+sig} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '6px 8px' }}>{m.label}</td>
                      <td style={{ padding: '6px 8px' }}>{sig}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, Menlo, monospace' }}>GP{gpio}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>

          <CodeBlocks code={code} />
        </div>
      </div>
    </div>
  );
}

// ----- Suggestion for layout.tsx (server component) -----
// Create frontend/src/app/tools/iot/pico-configurator/layout.tsx with:
// import type { Metadata } from 'next';
// export const metadata: Metadata = { title: 'Pico Wiring Configurator – Patch & Test' };
// export default function Layout({ children }: { children: React.ReactNode }) { return children; }

# pico_domotic.py — MicroPython (Raspberry Pi Pico / Pico W)
# Simple JSON-lines control protocol over USB serial.

import sys, ujson as json, utime, uselect
from machine import Pin, PWM, ADC

# --- Pin map (adjust if needed)
GPIO_LED   = 2    # LED / lamp (through transistor/relay)
GPIO_RELAY = 18   # Relay input
GPIO_PWM   = 15   # PWM dimmer
GPIO_SERVO = 16   # Servo signal
GPIO_ADC   = 26   # ADC0 (potentiometer)

# --- Outputs
led = Pin(GPIO_LED, Pin.OUT, value=0)
relay = Pin(GPIO_RELAY, Pin.OUT, value=0)

pwm = PWM(Pin(GPIO_PWM))
pwm.freq(1000)           # 1 kHz dimmer
pwm.duty_u16(0)

servo = PWM(Pin(GPIO_SERVO))
servo.freq(50)           # 50 Hz for servo (20 ms period)

# --- Inputs
adc = ADC(GPIO_ADC)      # ADC0 (0..65535 raw on MicroPython builds); we map to 0..4095

def adc_read12():
    raw16 = adc.read_u16()  # 0..65535
    return int((raw16 * 4095) / 65535)

# --- Helpers
def servo_write_angle(angle):
    # Convert 0..180 deg to 500..2500 µs pulse width (common range)
    if angle < 0: angle = 0
    if angle > 180: angle = 180
    us = 500 + int((angle / 180.0) * 2000)    # 500–2500 µs
    duty = int((us / 20000.0) * 65535)        # period = 20 ms
    servo.duty_u16(duty)

def send(obj):
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except:
        pass

# --- State caches (for 'state' response)
pins_state = { GPIO_LED: 0, GPIO_RELAY: 0 }
pwm_state = { GPIO_PWM: 0 }        # percent 0..100
servo_state = { GPIO_SERVO: 90 }   # degrees
adc_state = { GPIO_ADC: 0 }

def apply_scene(name):
    global pins_state, pwm_state, servo_state
    if name == "all-off":
        led.value(0); relay.value(0); pwm.duty_u16(0)
        pins_state[GPIO_LED] = 0; pins_state[GPIO_RELAY] = 0; pwm_state[GPIO_PWM] = 0
    elif name == "evening":
        led.value(1); relay.value(0)
        pwm.duty_u16(int(0.35 * 65535))
        pins_state[GPIO_LED] = 1; pins_state[GPIO_RELAY] = 0; pwm_state[GPIO_PWM] = 35
        servo_write_angle(60); servo_state[GPIO_SERVO] = 60
    elif name == "presentation":
        led.value(0); relay.value(1)
        pwm.duty_u16(int(0.8 * 65535))
        pins_state[GPIO_LED] = 0; pins_state[GPIO_RELAY] = 1; pwm_state[GPIO_PWM] = 80
        servo_write_angle(120); servo_state[GPIO_SERVO] = 120

def handle(cmd):
    t = cmd.get("cmd")
    if t == "info":
        send({ "type": "info", "model": "Raspberry Pi Pico", "fw": "domotic-0.1" })

    elif t == "state":
        adc_state[GPIO_ADC] = adc_read12()
        send({ "type": "state", "pins": pins_state, "pwm": pwm_state, "servo": servo_state, "adc": adc_state })

    elif t == "set":
        pin = int(cmd.get("pin", -1)); val = 1 if cmd.get("value") else 0
        if pin == GPIO_LED:
            led.value(val); pins_state[GPIO_LED] = val; send({ "type": "ok", "cmd": "set" })
        elif pin == GPIO_RELAY:
            relay.value(val); pins_state[GPIO_RELAY] = val; send({ "type": "ok", "cmd": "set" })
        else:
            send({ "type": "error", "message": "unknown pin" })

    elif t == "pwm":
        pin = int(cmd.get("pin", -1)); percent = int(cmd.get("percent", 0))
        if percent < 0: percent = 0
        if percent > 100: percent = 100
        if pin == GPIO_PWM:
            duty = int((percent/100.0) * 65535)
            pwm.duty_u16(duty)
            pwm_state[GPIO_PWM] = percent
            send({ "type": "ok", "cmd": "pwm" })
        else:
            send({ "type": "error", "message": "unknown pwm pin" })

    elif t == "servo":
        pin = int(cmd.get("pin", -1)); angle = int(cmd.get("angle", 90))
        if angle < 0: angle = 0
        if angle > 180: angle = 180
        if pin == GPIO_SERVO:
            servo_write_angle(angle)
            servo_state[GPIO_SERVO] = angle
            send({ "type": "ok", "cmd": "servo" })
        else:
            send({ "type": "error", "message": "unknown servo pin" })

    elif t == "read":
        typ = cmd.get("type")
        if typ == "adc":
            pin = int(cmd.get("pin", GPIO_ADC))
            if pin == GPIO_ADC:
                val = adc_read12()
                adc_state[GPIO_ADC] = val
                send({ "type": "adc", "pin": GPIO_ADC, "value": val })
            else:
                send({ "type": "error", "message": "unknown adc pin" })
        else:
            send({ "type": "error", "message": "unknown read type" })

    elif t == "scene":
        name = cmd.get("name", "")
        apply_scene(name)
        send({ "type": "ok", "cmd": "scene" })

    else:
        send({ "type": "error", "message": "unknown cmd" })

# --- Main loop (non-blocking serial read)
poll = uselect.poll()
poll.register(sys.stdin, uselect.POLLIN)

send({ "type": "info", "model": "Raspberry Pi Pico", "fw": "domotic-0.1" })

while True:
    if poll.poll(100):  # 100 ms
        try:
            line = sys.stdin.readline()
            if not line:
                utime.sleep_ms(10)
                continue
            line = line.strip()
            if not line:
                continue
            cmd = json.loads(line)
            handle(cmd)
        except Exception as e:
            try:
                send({ "type": "error", "message": str(e) })
            except:
                pass
    # You could add periodic telemetry here if desired




Wiring quick-start (low-voltage demo):

LED / lamp via transistor + resistor from GPIO2 (or use a ready-made relay module on GPIO18).

PWM dimmer (GPIO15) → LED strip driver (logic-level MOSFET) or a small DC fan.

Servo signal on GPIO16 (servo power from 5V, common ground with Pico).

Potentiometer wiper → ADC0/GPIO26, ends to 3V3 and GND.

⚠️ Do not switch mains for a demo. If you ever do, use certified, opto-isolated relays and follow electrical codes.

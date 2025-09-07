#pragma once
#include <Arduino.h>
#include "config.h"

struct Joy {
  int  xRaw, yRaw;   // 0..4095
  int  xPct, yPct;   // -100..100 (centered)
  bool pressed;      // SW active-low
};

void joystickBegin();
Joy  joystickRead();
void joystickCalibrate();
void joystickGetCenter(int& cx, int& cy);
String joystickJson();

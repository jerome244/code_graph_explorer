#pragma once
#include <Arduino.h>
#include <WiFi.h>

void sendHeaders(WiFiClient& c, const char* type = "text/html; charset=utf-8");
void sendIndex(WiFiClient& c);
void handleFirstLine(const String& first, WiFiClient& client);

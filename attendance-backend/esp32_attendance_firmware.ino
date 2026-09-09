/*
 * Smart Attendance System — ESP32 firmware
 * -----------------------------------------
 * Ultrasonic proximity trigger + I2C LCD + LED + buzzer.
 * Talks to the laptop over USB Serial (115200 baud) using simple text commands.
 * All the camera/QR/face/liveness logic lives on the laptop — this board only
 * senses proximity and displays/signals what the laptop tells it to.
 *
 * WIRING
 * ------
 * HC-SR04 ultrasonic sensor:
 *   VCC  -> 5V
 *   GND  -> GND
 *   TRIG -> GPIO 5
 *   ECHO -> GPIO 18   *** THROUGH A VOLTAGE DIVIDER ***
 *           HC-SR04's Echo pin outputs 5V, but ESP32 GPIOs are only 3.3V
 *           tolerant. Use a simple divider: Echo -> 1kΩ -> GPIO18, and a
 *           2kΩ resistor from GPIO18 to GND. Skipping this can damage the pin.
 *
 * 16x2 I2C LCD (with PCF8574 backpack):
 *   VCC -> 5V   GND -> GND   SDA -> GPIO 21   SCL -> GPIO 22
 *
 * Green LED:  anode -> 220ohm resistor -> GPIO 25, cathode -> GND
 * Red LED:    anode -> 220ohm resistor -> GPIO 26, cathode -> GND
 * Buzzer (active buzzer, 2-pin): + -> GPIO 27, - -> GND
 *
 * REQUIRED LIBRARY
 * -----------------
 * Arduino IDE > Tools > Manage Libraries > search "LiquidCrystal I2C"
 * Install the one by Frank de Brabander.
 *
 * If your LCD doesn't light up, your I2C address might be 0x3F instead of
 * 0x27 — run an I2C scanner sketch if unsure.
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ---- Pin config ----
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int LED_GREEN = 25;
const int LED_RED = 26;
const int BUZZER_PIN = 27;

// ---- LCD config ----
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---- Behavior config ----
const float DIST_THRESHOLD_CM = 30.0;   // trigger when someone is closer than this
const unsigned long DEBOUNCE_MS = 500;  // min time between distance readings

bool busy = false;  // true while a scan cycle is in progress (waiting on the laptop)
unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  showIdle();
}

void loop() {
  // 1. Listen for commands from the laptop
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) handleCommand(cmd);
  }

  // 2. If idle, watch the ultrasonic sensor for someone approaching
  if (!busy && millis() - lastReadMs > DEBOUNCE_MS) {
    lastReadMs = millis();
    float dist = readDistanceCm();
    if (dist > 0 && dist < DIST_THRESHOLD_CM) {
      busy = true;
      Serial.println("TRIGGER");
      showMessage("Scan your", "ID card QR...");
    }
  }
}

void handleCommand(String cmd) {
  if (cmd == "STATE:SCAN_QR") {
    showMessage("Scan your", "ID card QR...");

  } else if (cmd == "STATE:BLINK") {
    showMessage("Look at camera", "and blink now");
    beep(1, 100);

  } else if (cmd == "STATE:PROCESSING") {
    showMessage("Verifying...", "Please wait");

  } else if (cmd.startsWith("RESULT:OK:")) {
    String name = cmd.substring(String("RESULT:OK:").length());
    showMessage("Welcome!", name);
    digitalWrite(LED_GREEN, HIGH);
    beep(1, 150);
    delay(2000);
    digitalWrite(LED_GREEN, LOW);

  } else if (cmd.startsWith("RESULT:FAIL:")) {
    String reason = cmd.substring(String("RESULT:FAIL:").length());
    showMessage("Not verified", reason);
    digitalWrite(LED_RED, HIGH);
    beep(2, 150);
    delay(2000);
    digitalWrite(LED_RED, LOW);

  } else if (cmd == "STATE:IDLE") {
    busy = false;
    showIdle();
  }
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);  // 30ms timeout (~5m range)
  if (duration == 0) return -1;
  return duration * 0.0343 / 2.0;
}

void beep(int times, int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(duration);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1) delay(100);
  }
}

void showIdle() {
  showMessage("Smart Attendance", "Come closer...");
}

void showMessage(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

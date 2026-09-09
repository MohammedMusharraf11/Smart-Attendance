#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const char* ssid = "SweetSpot";
const char* password = "127.0.0.1";
const char* baseUrl = "http://192.168.31.190:8000";

LiquidCrystal_I2C lcd(0x27, 16, 2);

const int trigPin = 5;
const int echoPin = 18;
const int buzzerPin = 4;

const int DETECT_THRESHOLD_CM = 15;
const unsigned long POLL_INTERVAL_MS = 1000;
const unsigned long POLL_TIMEOUT_MS = 30000;

void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);

  Wire.begin(21, 22);
  Wire.setClock(100000);
  delay(500);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());

  lcd.clear();
  lcd.print("Ready");
}

long getDistanceCM() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.034 / 2;
}

bool sendTrigger() {
  HTTPClient http;
  http.begin(String(baseUrl) + "/trigger");
  http.setTimeout(5000);
  int code = http.POST("");
  http.end();
  return code == 200;
}

bool pollLatestResult(JsonDocument& doc) {
  HTTPClient http;
  http.begin(String(baseUrl) + "/latest-result");
  http.setTimeout(5000);
  int code = http.GET();

  if (code == 200) {
    String response = http.getString();
    http.end();
    DeserializationError err = deserializeJson(doc, response);
    if (!err) {
      return doc["available"].as<bool>();
    }
  }
  http.end();
  return false;
}

void showResultOnLCD(JsonDocument& doc) {
  bool marked = doc["marked"].as<bool>();
  lcd.clear();

  if (marked) {
    String name = doc["name"].as<String>();
    lcd.setCursor(0, 0);
    lcd.print(name);
    lcd.setCursor(0, 1);
    lcd.print("Present");
    digitalWrite(buzzerPin, HIGH);
    delay(200);
    digitalWrite(buzzerPin, LOW);
  } else {
    lcd.setCursor(0, 0);
    lcd.print("No Student");
    lcd.setCursor(0, 1);
    lcd.print("Found");
    digitalWrite(buzzerPin, HIGH);
    delay(100);
    digitalWrite(buzzerPin, LOW);
    delay(100);
    digitalWrite(buzzerPin, HIGH);
    delay(100);
    digitalWrite(buzzerPin, LOW);
  }

  delay(4000);
  lcd.clear();
  lcd.print("Ready");
}

void runAttendanceCycle() {
  lcd.clear();
  lcd.print("Detected!");
  lcd.setCursor(0, 1);
  lcd.print("Upload on PC...");

  if (!sendTrigger()) {
    lcd.clear();
    lcd.print("Trigger Failed");
    delay(3000);
    lcd.clear();
    lcd.print("Ready");
    return;
  }

  unsigned long start = millis();
  StaticJsonDocument<512> doc;
  bool gotResult = false;

  while (millis() - start < POLL_TIMEOUT_MS) {
    delay(POLL_INTERVAL_MS);
    if (pollLatestResult(doc)) {
      gotResult = true;
      break;
    }
  }

  if (gotResult) {
    showResultOnLCD(doc);
  } else {
    lcd.clear();
    lcd.print("Timed Out");
    delay(3000);
    lcd.clear();
    lcd.print("Ready");
  }
}

void loop() {
  long distance = getDistanceCM();

  if (distance > 0 && distance < DETECT_THRESHOLD_CM) {
    runAttendanceCycle();
    delay(2000);
  }

  delay(300);
}
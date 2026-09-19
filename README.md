# PSD-to-HTML-CSS

A hand-coded HTML/CSS theme built from a PSD, plus a **Calculator & Unit Converter** app.

## Calculator & Unit Converter

Open `calculator.html` in any browser — no build step, no dependencies, works offline.
A compact version of the same idea is embedded in the homepage (`index.html#calc`).

### Calculator

- Full expression input with correct precedence, parentheses and powers: `(1200 + 800) * 1.15`
- Parsed with a shunting-yard parser — **never uses `eval()`**
- Desk-calculator percent: `1200+15%` → `1380`, `1200*15%` → `180`, `50%` → `0.5`
- Live result preview while typing, with thousand separators
- Memory keys (MC / MR / M+ / M−) and a sign toggle
- History of the last 30 calculations; click any entry to reuse its result
- Keyboard: digits, `+ - * / ^ % ( )`, `Enter` to calculate, `Backspace` to delete, `Esc` to clear
- Clear error messages for divide-by-zero, unbalanced parentheses and malformed input

### Unit converter

12 categories — Length, Weight/Mass, Temperature, Area, Volume, Speed, Time,
Digital storage, Pressure, Energy, Power and Angle.

- Swap units in one click, choose 0–10 decimal places, copy the raw result
- A side table shows the value in **every** unit of the category at once
- Bangladesh-specific units included: **Maund** and **Seer** (weight), **Shotok/Decimal**,
  **Katha** and **Bigha** (land area)
- Temperature is handled with proper offsets (Celsius, Fahrenheit, Kelvin, Rankine)

### Other

- Light and dark theme, remembered between visits
- History, memory, last unit selection and active tab persist via `localStorage`
- Responsive down to small phones

## Project layout

```
index.html              Theme homepage (with the compact calculator section)
calculator.html         The standalone Calculator & Unit Converter app
css/style.css           Theme styles
css/calculator-app.css  App styles (light + dark themes)
js/calculator.js        Logic for the compact homepage section
js/calculator-app.js    App logic: expression engine, units, UI
test/engine.test.js     Node tests for the expression engine and conversions
```

## Running the tests

The maths and unit tables are covered by a dependency-free Node test:

```bash
node test/engine.test.js
```

56 assertions cover operator precedence, percent rules, error handling,
number formatting and conversion accuracy in every category.

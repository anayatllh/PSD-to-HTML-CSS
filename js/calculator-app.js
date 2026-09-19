/* ============================================================
   Calculator & Unit Converter — standalone app
   Vanilla JS, no dependencies. Used by calculator.html.

   Layout of this file:
     1. Small helpers (storage, number formatting)
     2. Expression engine (tokenizer -> RPN -> evaluate)
     3. Unit tables + conversion
     4. UI wiring (calculator, converter, tabs, theme)
   ============================================================ */
(function () {
	"use strict";

	/* ---------------------------------------------------------
	   1. HELPERS
	   --------------------------------------------------------- */
	function $(id) { return document.getElementById(id); }

	var MAX_HISTORY = 30;
	var KEY = {
		theme: "cuc-theme",
		history: "cuc-history",
		memory: "cuc-memory",
		tab: "cuc-tab",
		conv: "cuc-conv"
	};

	function save(key, value) {
		try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage off */ }
	}
	function read(key, fallback) {
		try {
			var raw = localStorage.getItem(key);
			return raw === null ? fallback : JSON.parse(raw);
		} catch (e) { return fallback; }
	}

	// Group the integer part with thousand separators: 1234567.5 -> "1,234,567.5"
	function group(str) {
		var parts = String(str).split(".");
		parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		return parts.join(".");
	}

	// Format a number for display. Falls back to exponential notation for
	// values that would otherwise be unreadable.
	function formatNumber(n, digits, grouped) {
		if (n === null || n === undefined || typeof n !== "number" || isNaN(n)) return "";
		if (!isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
		if (digits === undefined || digits === null) digits = 6;
		var abs = Math.abs(n);
		if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
			return n.toExponential(Math.min(digits, 10));
		}
		var rounded = Number(n.toFixed(digits));
		if (Object.is(rounded, -0)) rounded = 0;
		return grouped ? group(rounded) : String(rounded);
	}

	/* ---------------------------------------------------------
	   2. EXPRESSION ENGINE
	   Shunting-yard parser, so precedence and parentheses work
	   without ever calling eval().
	   --------------------------------------------------------- */
	var PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
	var RIGHT_ASSOC = { "^": true };

	function tokenize(src) {
		var tokens = [];
		var i = 0;
		while (i < src.length) {
			var ch = src[i];
			if (ch === " ") { i++; continue; }

			if ((ch >= "0" && ch <= "9") || ch === ".") {
				var num = "";
				while (i < src.length && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) {
					num += src[i++];
				}
				if (num === "." || (num.match(/\./g) || []).length > 1) throw new Error("Malformed number");
				tokens.push({ t: "num", v: parseFloat(num) });
				continue;
			}

			if (PREC[ch]) {
				var prev = tokens[tokens.length - 1];
				var atStart = !prev || prev.t === "op" || (prev.t === "paren" && prev.v === "(");
				if ((ch === "-" || ch === "+") && atStart) {
					tokens.push({ t: "op", v: ch === "-" ? "neg" : "pos", unary: true });
				} else {
					tokens.push({ t: "op", v: ch });
				}
				i++;
				continue;
			}

			if (ch === "(" || ch === ")") { tokens.push({ t: "paren", v: ch }); i++; continue; }
			if (ch === "%") { tokens.push({ t: "pct" }); i++; continue; }

			throw new Error('Unexpected "' + ch + '"');
		}
		return tokens;
	}

	// Percent is contextual, the way a desk calculator behaves:
	//   1200 + 15%  -> 1200 + (1200 * 15 / 100)   (same for "-")
	//   1200 * 15%  -> 1200 * 0.15
	//   15%         -> 0.15
	// When the left operand of +/- is not a plain number we fall back to /100.
	function applyPercent(tokens) {
		var out = tokens.slice();
		for (var i = 0; i < out.length; i++) {
			if (out[i].t !== "pct") continue;
			var value = out[i - 1];
			if (!value || value.t !== "num") throw new Error("Misplaced %");
			var op = out[i - 2];
			var base = out[i - 3];
			if (op && op.t === "op" && !op.unary && (op.v === "+" || op.v === "-") &&
				base && base.t === "num") {
				value.v = base.v * value.v / 100;
			} else {
				value.v = value.v / 100;
			}
			out.splice(i, 1);
			i--;
		}
		return out;
	}

	function toRPN(tokens) {
		var out = [];
		var ops = [];
		for (var i = 0; i < tokens.length; i++) {
			var tk = tokens[i];

			if (tk.t === "num") { out.push(tk); continue; }

			if (tk.t === "op") {
				if (tk.unary) { ops.push(tk); continue; }
				while (ops.length) {
					var top = ops[ops.length - 1];
					var pops = top.t === "op" && (top.unary ||
						PREC[top.v] > PREC[tk.v] ||
						(PREC[top.v] === PREC[tk.v] && !RIGHT_ASSOC[tk.v]));
					if (!pops) break;
					out.push(ops.pop());
				}
				ops.push(tk);
				continue;
			}

			if (tk.v === "(") { ops.push(tk); continue; }

			// ")" — drain until the matching "("
			var matched = false;
			while (ops.length) {
				var t = ops.pop();
				if (t.t === "paren" && t.v === "(") { matched = true; break; }
				out.push(t);
			}
			if (!matched) throw new Error("Unbalanced parentheses");
		}
		while (ops.length) {
			var last = ops.pop();
			if (last.t === "paren") throw new Error("Unbalanced parentheses");
			out.push(last);
		}
		return out;
	}

	function evalRPN(rpn) {
		var stack = [];
		for (var i = 0; i < rpn.length; i++) {
			var tk = rpn[i];
			if (tk.t === "num") { stack.push(tk.v); continue; }

			if (tk.unary) {
				var single = stack.pop();
				if (single === undefined) throw new Error("Incomplete expression");
				stack.push(tk.v === "neg" ? -single : single);
				continue;
			}

			var b = stack.pop();
			var a = stack.pop();
			if (a === undefined || b === undefined) throw new Error("Incomplete expression");
			if (tk.v === "+") stack.push(a + b);
			else if (tk.v === "-") stack.push(a - b);
			else if (tk.v === "*") stack.push(a * b);
			else if (tk.v === "^") stack.push(Math.pow(a, b));
			else {
				if (b === 0) throw new Error("Cannot divide by zero");
				stack.push(a / b);
			}
		}
		if (stack.length !== 1) throw new Error("Incomplete expression");
		return stack[0];
	}

	function calculate(src) {
		if (!src || !src.trim()) return null;
		var value = evalRPN(toRPN(applyPercent(tokenize(src))));
		if (typeof value !== "number" || isNaN(value)) throw new Error("Invalid result");
		if (!isFinite(value)) throw new Error("Result out of range");
		// Trim binary floating point noise: 0.1 + 0.2 -> 0.3
		return Math.round(value * 1e12) / 1e12;
	}

	/* ---------------------------------------------------------
	   3. UNITS
	   Linear categories store "how many base units is 1 of this".
	   Temperature is handled separately because it has offsets.
	   --------------------------------------------------------- */
	var UNITS = {
		"Length": {
			base: "Meter",
			units: {
				"Millimeter": 0.001,
				"Centimeter": 0.01,
				"Meter": 1,
				"Kilometer": 1000,
				"Inch": 0.0254,
				"Foot": 0.3048,
				"Yard": 0.9144,
				"Mile": 1609.344,
				"Nautical mile": 1852,
				"Micrometer": 0.000001
			}
		},
		"Weight / Mass": {
			base: "Kilogram",
			units: {
				"Milligram": 0.000001,
				"Gram": 0.001,
				"Kilogram": 1,
				"Metric ton": 1000,
				"Ounce": 0.028349523125,
				"Pound": 0.45359237,
				"Stone": 6.35029318,
				"Short ton (US)": 907.18474,
				"Seer (BD)": 0.9331,
				"Maund (BD)": 37.3242
			}
		},
		"Temperature": {
			base: "Celsius",
			temperature: true,
			units: { "Celsius": 1, "Fahrenheit": 1, "Kelvin": 1, "Rankine": 1 }
		},
		"Area": {
			base: "Square meter",
			units: {
				"Square millimeter": 0.000001,
				"Square centimeter": 0.0001,
				"Square meter": 1,
				"Square kilometer": 1000000,
				"Square inch": 0.00064516,
				"Square foot": 0.09290304,
				"Square yard": 0.83612736,
				"Acre": 4046.8564224,
				"Hectare": 10000,
				"Shotok / Decimal (BD)": 40.468564224,
				"Katha (BD)": 66.8901888,
				"Bigha (BD)": 1337.803776
			}
		},
		"Volume": {
			base: "Liter",
			units: {
				"Milliliter": 0.001,
				"Liter": 1,
				"Cubic centimeter": 0.001,
				"Cubic meter": 1000,
				"Cubic inch": 0.016387064,
				"Cubic foot": 28.316846592,
				"Gallon (US)": 3.785411784,
				"Gallon (UK)": 4.54609,
				"Quart (US)": 0.946352946,
				"Pint (US)": 0.473176473,
				"Cup (US)": 0.2365882365,
				"Fluid ounce (US)": 0.0295735295625
			}
		},
		"Speed": {
			base: "Meter/second",
			units: {
				"Meter/second": 1,
				"Kilometer/hour": 0.2777777777777778,
				"Mile/hour": 0.44704,
				"Foot/second": 0.3048,
				"Knot": 0.5144444444444445
			}
		},
		"Time": {
			base: "Second",
			units: {
				"Millisecond": 0.001,
				"Second": 1,
				"Minute": 60,
				"Hour": 3600,
				"Day": 86400,
				"Week": 604800,
				"Month (30 days)": 2592000,
				"Year (365 days)": 31536000
			}
		},
		"Digital storage": {
			base: "Byte",
			units: {
				"Bit": 0.125,
				"Byte": 1,
				"Kilobyte (1000)": 1000,
				"Kibibyte (1024)": 1024,
				"Megabyte (1000)": 1000000,
				"Mebibyte (1024)": 1048576,
				"Gigabyte (1000)": 1000000000,
				"Gibibyte (1024)": 1073741824,
				"Terabyte (1000)": 1000000000000,
				"Tebibyte (1024)": 1099511627776
			}
		},
		"Pressure": {
			base: "Pascal",
			units: {
				"Pascal": 1,
				"Kilopascal": 1000,
				"Megapascal": 1000000,
				"Bar": 100000,
				"PSI": 6894.757293168,
				"Atmosphere": 101325,
				"Torr": 133.32236842105263
			}
		},
		"Energy": {
			base: "Joule",
			units: {
				"Joule": 1,
				"Kilojoule": 1000,
				"Calorie": 4.184,
				"Kilocalorie": 4184,
				"Watt-hour": 3600,
				"Kilowatt-hour": 3600000,
				"BTU": 1055.05585262,
				"Foot-pound": 1.3558179483314004
			}
		},
		"Power": {
			base: "Watt",
			units: {
				"Watt": 1,
				"Kilowatt": 1000,
				"Megawatt": 1000000,
				"Horsepower (metric)": 735.49875,
				"Horsepower (mechanical)": 745.6998715822702,
				"BTU/hour": 0.29307107017222
			}
		},
		"Angle": {
			base: "Degree",
			units: {
				"Degree": 1,
				"Radian": 57.29577951308232,
				"Gradian": 0.9,
				"Arcminute": 0.016666666666666666,
				"Arcsecond": 0.0002777777777777778,
				"Turn": 360
			}
		}
	};

	function toCelsius(value, unit) {
		if (unit === "Fahrenheit") return (value - 32) * 5 / 9;
		if (unit === "Kelvin") return value - 273.15;
		if (unit === "Rankine") return (value - 491.67) * 5 / 9;
		return value;
	}
	function fromCelsius(celsius, unit) {
		if (unit === "Fahrenheit") return celsius * 9 / 5 + 32;
		if (unit === "Kelvin") return celsius + 273.15;
		if (unit === "Rankine") return (celsius + 273.15) * 9 / 5;
		return celsius;
	}

	function convert(value, category, from, to) {
		var cat = UNITS[category];
		if (!cat) throw new Error("Unknown category: " + category);
		if (!(from in cat.units) || !(to in cat.units)) throw new Error("Unknown unit");
		if (cat.temperature) return fromCelsius(toCelsius(value, from), to);
		return value * cat.units[from] / cat.units[to];
	}

	/* ---------------------------------------------------------
	   4. UI — CALCULATOR
	   --------------------------------------------------------- */
	var expr = "";
	var memory = 0;
	var history = [];
	var lastAnswer = 0;

	var exprEl, resultEl, memEl, keysEl, historyEl;

	function openParens(s) {
		var open = 0;
		for (var i = 0; i < s.length; i++) {
			if (s[i] === "(") open++;
			else if (s[i] === ")") open--;
		}
		return open < 0 ? 0 : open;
	}

	function endsWithOperator(s) {
		var last = s.slice(-1);
		return last !== "" && PREC[last] !== undefined;
	}

	function currentNumber(s) {
		var m = s.match(/[0-9.]*$/);
		return m ? m[0] : "";
	}

	function renderCalc(message) {
		if (!exprEl) return;
		exprEl.textContent = expr || " ";
		if (message) {
			resultEl.textContent = message;
			resultEl.classList.add("is-error");
			return;
		}
		resultEl.classList.remove("is-error");
		if (!expr) { resultEl.textContent = "0"; return; }
		try {
			// Auto-close parentheses so the live preview keeps working while typing.
			var preview = expr + new Array(openParens(expr) + 1).join(")");
			var value = calculate(preview.replace(/[+\-*\/^]$/, ""));
			resultEl.textContent = value === null ? "0" : formatNumber(value, 10, true);
		} catch (e) {
			resultEl.textContent = " ";
		}
		if (memEl) memEl.classList.toggle("is-on", memory !== 0);
	}

	function push(ch) {
		if (PREC[ch]) {
			if (expr === "" && ch !== "-") return;            // no leading + * / ^
			if (endsWithOperator(expr)) expr = expr.slice(0, -1); // swap the operator
			expr += ch;
		} else if (ch === ".") {
			if (currentNumber(expr).indexOf(".") !== -1) return;
			if (expr === "" || /[^0-9.]$/.test(expr)) expr += "0.";
			else expr += ".";
		} else if (ch === "(") {
			if (/[0-9.)]$/.test(expr)) expr += "*(";           // 2(3) -> 2*(3)
			else expr += "(";
		} else if (ch === ")") {
			if (openParens(expr) === 0 || /[(+\-*\/^]$/.test(expr)) return;
			expr += ")";
		} else if (ch === "%") {
			if (!/[0-9)]$/.test(expr)) return;
			expr += "%";
		} else {
			expr += ch;
		}
		renderCalc();
	}

	function equals() {
		if (!expr) return;
		try {
			var value = calculate(expr);
			if (value === null) return;
			addHistory(expr, value);
			lastAnswer = value;
			expr = String(value);
			renderCalc();
		} catch (e) {
			renderCalc(e.message);
			expr = "";
		}
	}

	function addHistory(source, value) {
		history.unshift({ expr: source, result: value });
		if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
		save(KEY.history, history);
		renderHistory();
	}

	function renderHistory() {
		if (!historyEl) return;
		if (!history.length) {
			historyEl.innerHTML = '<li class="history-empty">No calculations yet.</li>';
			return;
		}
		var html = "";
		for (var i = 0; i < history.length; i++) {
			html += '<li><button type="button" class="history-item" data-value="' + history[i].result + '">' +
				'<span class="history-expr">' + escapeHTML(history[i].expr) + '</span>' +
				'<span class="history-result">' + formatNumber(history[i].result, 10, true) + '</span>' +
				"</button></li>";
		}
		historyEl.innerHTML = html;
	}

	function escapeHTML(s) {
		return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	function displayedValue() {
		try {
			var value = calculate(expr);
			return value === null ? 0 : value;
		} catch (e) {
			return lastAnswer;
		}
	}

	function setExpr(value) {
		expr = String(value);
		renderCalc();
	}

	function handleKeyButton(btn) {
		var d = btn.dataset;
		if (d.digit !== undefined) return push(d.digit);
		if (d.op !== undefined) return push(d.op);

		switch (d.action) {
			case "clear":
				expr = "";
				renderCalc();
				break;
			case "back":
				expr = expr.slice(0, -1);
				renderCalc();
				break;
			case "equals":
				equals();
				break;
			case "sign":
				// Flip the sign of the number being typed.
				var num = currentNumber(expr);
				var head = expr.slice(0, expr.length - num.length);
				if (head.slice(-1) === "-") expr = head.slice(0, -1) + num;
				else expr = head + "-" + num;
				renderCalc();
				break;
			case "mem-clear":
				memory = 0;
				save(KEY.memory, memory);
				renderCalc();
				break;
			case "mem-recall":
				if (memory !== 0 || expr === "") push(String(memory));
				break;
			case "mem-add":
				memory += displayedValue();
				save(KEY.memory, memory);
				renderCalc();
				break;
			case "mem-sub":
				memory -= displayedValue();
				save(KEY.memory, memory);
				renderCalc();
				break;
			case "history-clear":
				history = [];
				save(KEY.history, history);
				renderHistory();
				break;
			case "to-converter":
				setTab("converter");
				var target = $("conv-input");
				if (target) {
					target.value = displayedValue();
					runConversion();
				}
				break;
		}
	}

	function initCalculator() {
		exprEl = $("calc-expr");
		resultEl = $("calc-result");
		memEl = $("calc-memory");
		keysEl = $("calc-keys");
		historyEl = $("calc-history");
		if (!exprEl || !resultEl || !keysEl) return;

		history = read(KEY.history, []) || [];
		memory = read(KEY.memory, 0) || 0;

		keysEl.addEventListener("click", function (e) {
			var btn = e.target.closest("button");
			if (btn) handleKeyButton(btn);
		});

		var extras = document.querySelectorAll("[data-action]");
		for (var i = 0; i < extras.length; i++) {
			if (keysEl.contains(extras[i])) continue;
			extras[i].addEventListener("click", function (e) {
				handleKeyButton(e.currentTarget);
			});
		}

		if (historyEl) {
			historyEl.addEventListener("click", function (e) {
				var item = e.target.closest(".history-item");
				if (!item) return;
				if (endsWithOperator(expr) || expr === "") push(item.dataset.value);
				else setExpr(item.dataset.value);
			});
		}

		document.addEventListener("keydown", function (e) {
			if (activeTab !== "calculator") return;
			var tag = (e.target.tagName || "").toLowerCase();
			if (tag === "input" || tag === "select" || tag === "textarea") return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			var k = e.key;
			if ((k >= "0" && k <= "9") || k === "." || k === "(" || k === ")" ||
				k === "+" || k === "-" || k === "*" || k === "/" || k === "^" || k === "%") {
				e.preventDefault();
				push(k);
			} else if (k === "Enter" || k === "=") {
				e.preventDefault();
				equals();
			} else if (k === "Backspace") {
				e.preventDefault();
				expr = expr.slice(0, -1);
				renderCalc();
			} else if (k === "Escape" || k === "Delete") {
				e.preventDefault();
				expr = "";
				renderCalc();
			}
		});

		renderHistory();
		renderCalc();
	}

	/* ---------------------------------------------------------
	   4b. UI — CONVERTER
	   --------------------------------------------------------- */
	var catEl, fromEl, toEl, valueEl, outEl, tableEl, precEl, swapEl, copyEl, noteEl;

	function fillCategories() {
		var names = Object.keys(UNITS);
		var html = "";
		for (var i = 0; i < names.length; i++) {
			html += '<option value="' + escapeHTML(names[i]) + '">' + escapeHTML(names[i]) + "</option>";
		}
		catEl.innerHTML = html;
	}

	function fillUnits(fromUnit, toUnit) {
		var names = Object.keys(UNITS[catEl.value].units);
		var html = "";
		for (var i = 0; i < names.length; i++) {
			html += '<option value="' + escapeHTML(names[i]) + '">' + escapeHTML(names[i]) + "</option>";
		}
		fromEl.innerHTML = html;
		toEl.innerHTML = html;
		fromEl.value = (fromUnit && names.indexOf(fromUnit) !== -1) ? fromUnit : names[0];
		toEl.value = (toUnit && names.indexOf(toUnit) !== -1) ? toUnit : names[Math.min(1, names.length - 1)];
	}

	function precision() {
		return precEl ? parseInt(precEl.value, 10) : 6;
	}

	function runConversion() {
		if (!catEl) return;
		var raw = valueEl.value.trim();
		var value = raw === "" ? NaN : Number(raw);

		save(KEY.conv, { category: catEl.value, from: fromEl.value, to: toEl.value });

		if (isNaN(value)) {
			outEl.textContent = "—";
			if (noteEl) noteEl.textContent = "Enter a number to convert.";
			renderTable(null);
			return;
		}

		var result = convert(value, catEl.value, fromEl.value, toEl.value);
		outEl.textContent = formatNumber(result, precision(), true);
		outEl.dataset.raw = formatNumber(result, precision(), false);
		if (noteEl) {
			noteEl.textContent = formatNumber(value, precision(), true) + " " + fromEl.value +
				" = " + formatNumber(result, precision(), true) + " " + toEl.value;
		}
		renderTable(value);
	}

	function renderTable(value) {
		if (!tableEl) return;
		if (value === null) { tableEl.innerHTML = ""; return; }
		var names = Object.keys(UNITS[catEl.value].units);
		var html = "";
		for (var i = 0; i < names.length; i++) {
			var converted = convert(value, catEl.value, fromEl.value, names[i]);
			html += "<tr" + (names[i] === toEl.value ? ' class="is-active"' : "") + ">" +
				"<th>" + escapeHTML(names[i]) + "</th>" +
				"<td>" + formatNumber(converted, precision(), true) + "</td></tr>";
		}
		tableEl.innerHTML = html;
	}

	function initConverter() {
		catEl = $("conv-category");
		fromEl = $("conv-from");
		toEl = $("conv-to");
		valueEl = $("conv-input");
		outEl = $("conv-output");
		tableEl = $("conv-table-body");
		precEl = $("conv-precision");
		swapEl = $("conv-swap");
		copyEl = $("conv-copy");
		noteEl = $("conv-note");
		if (!catEl || !fromEl || !toEl || !valueEl || !outEl) return;

		fillCategories();

		var saved = read(KEY.conv, null);
		if (saved && UNITS[saved.category]) {
			catEl.value = saved.category;
			fillUnits(saved.from, saved.to);
		} else {
			fillUnits();
		}

		catEl.addEventListener("change", function () { fillUnits(); runConversion(); });
		fromEl.addEventListener("change", runConversion);
		toEl.addEventListener("change", runConversion);
		valueEl.addEventListener("input", runConversion);
		if (precEl) precEl.addEventListener("change", runConversion);

		if (swapEl) {
			swapEl.addEventListener("click", function () {
				var tmp = fromEl.value;
				fromEl.value = toEl.value;
				toEl.value = tmp;
				runConversion();
			});
		}

		if (copyEl) {
			copyEl.addEventListener("click", function () {
				var text = outEl.dataset.raw || outEl.textContent;
				var done = function () {
					copyEl.textContent = "Copied";
					setTimeout(function () { copyEl.textContent = "Copy"; }, 1200);
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).then(done, function () { });
				} else {
					var tmp = document.createElement("textarea");
					tmp.value = text;
					document.body.appendChild(tmp);
					tmp.select();
					try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
					document.body.removeChild(tmp);
				}
			});
		}

		runConversion();
	}

	/* ---------------------------------------------------------
	   4c. UI — TABS + THEME
	   --------------------------------------------------------- */
	var activeTab = "calculator";

	function setTab(name) {
		activeTab = name;
		var tabs = document.querySelectorAll("[data-tab]");
		for (var i = 0; i < tabs.length; i++) {
			tabs[i].classList.toggle("is-active", tabs[i].dataset.tab === name);
			tabs[i].setAttribute("aria-selected", tabs[i].dataset.tab === name ? "true" : "false");
		}
		var panels = document.querySelectorAll("[data-panel]");
		for (var j = 0; j < panels.length; j++) {
			panels[j].classList.toggle("is-active", panels[j].dataset.panel === name);
		}
		save(KEY.tab, name);
	}

	function initTabs() {
		var tabs = document.querySelectorAll("[data-tab]");
		if (!tabs.length) return;
		for (var i = 0; i < tabs.length; i++) {
			tabs[i].addEventListener("click", function (e) {
				setTab(e.currentTarget.dataset.tab);
			});
		}
		setTab(read(KEY.tab, "calculator") || "calculator");
	}

	function initTheme() {
		var btn = $("theme-toggle");
		var stored = read(KEY.theme, null);
		var theme = stored === "dark" || stored === "light" ? stored : "light";
		applyTheme(theme);
		if (!btn) return;
		btn.addEventListener("click", function () {
			var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
			applyTheme(next);
			save(KEY.theme, next);
		});
	}

	function applyTheme(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		var btn = $("theme-toggle");
		if (btn) btn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
	}

	function init() {
		initTheme();
		initTabs();
		initCalculator();
		initConverter();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	// Exposed so the logic can be exercised without a browser (see test/engine.test.js).
	if (typeof window !== "undefined") {
		window.CalcApp = {
			calculate: calculate,
			convert: convert,
			formatNumber: formatNumber,
			UNITS: UNITS
		};
	}
})();

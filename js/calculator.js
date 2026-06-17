/* ============================================================
   Calculator + Unit Converter
   Vanilla JS, no dependencies. Embedded in index.html.
   ============================================================ */
(function () {
	"use strict";

	/* ---------------------------------------------------------
	   CALCULATOR
	   --------------------------------------------------------- */
	var display = document.getElementById("calc-display");
	var keys = document.querySelector(".calc-keys");
	var expr = "";

	var OPS = { "+": 1, "-": 1, "*": 2, "/": 2 };

	// Tokenize an expression string into numbers and operators.
	function tokenize(s) {
		var tokens = [];
		var num = "";
		for (var i = 0; i < s.length; i++) {
			var ch = s[i];
			if ((ch >= "0" && ch <= "9") || ch === ".") {
				num += ch;
			} else if (ch in OPS) {
				// Allow a leading unary minus or a minus right after another operator.
				if (ch === "-" && num === "" &&
					(tokens.length === 0 || tokens[tokens.length - 1] in OPS)) {
					num = "-";
				} else {
					if (num === "" || num === "-") throw new Error("bad");
					tokens.push(parseFloat(num));
					num = "";
					tokens.push(ch);
				}
			} else {
				throw new Error("bad");
			}
		}
		if (num === "" || num === "-") throw new Error("bad");
		tokens.push(parseFloat(num));
		return tokens;
	}

	// Evaluate tokens with operator precedence (no eval()).
	function evaluate(tokens) {
		// First pass: handle * and /
		var pass = [tokens[0]];
		for (var i = 1; i < tokens.length; i += 2) {
			var op = tokens[i];
			var val = tokens[i + 1];
			if (op === "*" || op === "/") {
				var prev = pass.pop();
				if (op === "/") {
					if (val === 0) throw new Error("div0");
					pass.push(prev / val);
				} else {
					pass.push(prev * val);
				}
			} else {
				pass.push(op, val);
			}
		}
		// Second pass: handle + and -
		var result = pass[0];
		for (var j = 1; j < pass.length; j += 2) {
			if (pass[j] === "+") result += pass[j + 1];
			else result -= pass[j + 1];
		}
		return result;
	}

	function compute() {
		try {
			var result = evaluate(tokenize(expr));
			if (!isFinite(result)) throw new Error("inf");
			// Trim floating point noise.
			result = Math.round(result * 1e10) / 1e10;
			expr = String(result);
			render();
		} catch (e) {
			display.value = "Error";
			expr = "";
		}
	}

	function render() {
		display.value = expr || "0";
	}

	function input(ch) {
		if (display.value === "Error") expr = "";
		expr += ch;
		render();
	}

	if (keys) {
		keys.addEventListener("click", function (e) {
			var btn = e.target.closest("button");
			if (!btn) return;
			if (btn.dataset.digit !== undefined) input(btn.dataset.digit);
			else if (btn.dataset.op !== undefined) input(btn.dataset.op);
			else if (btn.dataset.action === "clear") { expr = ""; render(); }
			else if (btn.dataset.action === "back") { expr = expr.slice(0, -1); render(); }
			else if (btn.dataset.action === "equals") compute();
		});
	}

	// Keyboard support
	document.addEventListener("keydown", function (e) {
		if (!display) return;
		var k = e.key;
		if ((k >= "0" && k <= "9") || k === "." ||
			k === "+" || k === "-" || k === "*" || k === "/") {
			input(k);
		} else if (k === "Enter" || k === "=") {
			e.preventDefault();
			compute();
		} else if (k === "Backspace") {
			expr = expr.slice(0, -1);
			render();
		} else if (k === "Escape") {
			expr = "";
			render();
		}
	});

	render();

	/* ---------------------------------------------------------
	   UNIT CONVERTER
	   --------------------------------------------------------- */
	// Linear categories: value in base units = value * factor.
	var UNITS = {
		Length: {
			base: "Meter",
			units: {
				"Millimeter": 0.001, "Centimeter": 0.01, "Meter": 1,
				"Kilometer": 1000, "Inch": 0.0254, "Foot": 0.3048,
				"Yard": 0.9144, "Mile": 1609.344
			}
		},
		Weight: {
			base: "Kilogram",
			units: {
				"Milligram": 0.000001, "Gram": 0.001, "Kilogram": 1,
				"Tonne": 1000, "Ounce": 0.0283495, "Pound": 0.453592,
				"Stone": 6.35029
			}
		},
		Temperature: { base: "Celsius", units: { "Celsius": 1, "Fahrenheit": 1, "Kelvin": 1 } },
		Area: {
			base: "Square meter",
			units: {
				"Square meter": 1, "Square kilometer": 1000000,
				"Square foot": 0.092903, "Square yard": 0.836127,
				"Acre": 4046.86, "Hectare": 10000
			}
		},
		Speed: {
			base: "Meter/second",
			units: {
				"Meter/second": 1, "Kilometer/hour": 0.277778,
				"Mile/hour": 0.44704, "Knot": 0.514444, "Foot/second": 0.3048
			}
		},
		Volume: {
			base: "Liter",
			units: {
				"Milliliter": 0.001, "Liter": 1, "Cubic meter": 1000,
				"Gallon (US)": 3.78541, "Quart (US)": 0.946353,
				"Pint (US)": 0.473176, "Cup (US)": 0.236588
			}
		},
		Time: {
			base: "Second",
			units: {
				"Millisecond": 0.001, "Second": 1, "Minute": 60,
				"Hour": 3600, "Day": 86400, "Week": 604800
			}
		}
	};

	var catSel = document.getElementById("conv-category");
	var fromSel = document.getElementById("conv-from");
	var toSel = document.getElementById("conv-to");
	var inputEl = document.getElementById("conv-input");
	var resultEl = document.getElementById("conv-result");
	var swapBtn = document.getElementById("conv-swap");

	function toBaseTemp(v, unit) { // -> Celsius
		if (unit === "Fahrenheit") return (v - 32) * 5 / 9;
		if (unit === "Kelvin") return v - 273.15;
		return v;
	}
	function fromBaseTemp(c, unit) { // Celsius -> unit
		if (unit === "Fahrenheit") return c * 9 / 5 + 32;
		if (unit === "Kelvin") return c + 273.15;
		return c;
	}

	function fillUnits() {
		var cat = catSel.value;
		var names = Object.keys(UNITS[cat].units);
		fromSel.innerHTML = "";
		toSel.innerHTML = "";
		names.forEach(function (n, idx) {
			fromSel.add(new Option(n, n));
			toSel.add(new Option(n, n));
			// Default "to" to a different unit than "from".
			if (idx === 1) toSel.value = n;
		});
		fromSel.selectedIndex = 0;
		if (names.length > 1) toSel.selectedIndex = 1;
	}

	function convert() {
		var cat = catSel.value;
		var v = parseFloat(inputEl.value);
		if (isNaN(v)) { resultEl.value = ""; return; }
		var out;
		if (cat === "Temperature") {
			out = fromBaseTemp(toBaseTemp(v, fromSel.value), toSel.value);
		} else {
			var u = UNITS[cat].units;
			out = v * u[fromSel.value] / u[toSel.value];
		}
		out = Math.round(out * 1e6) / 1e6;
		resultEl.value = out;
	}

	if (catSel && fromSel && toSel && inputEl && resultEl) {
		catSel.addEventListener("change", function () { fillUnits(); convert(); });
		fromSel.addEventListener("change", convert);
		toSel.addEventListener("change", convert);
		inputEl.addEventListener("input", convert);
		if (swapBtn) {
			swapBtn.addEventListener("click", function () {
				var tmp = fromSel.value;
				fromSel.value = toSel.value;
				toSel.value = tmp;
				convert();
			});
		}
		fillUnits();
		convert();
	}
})();

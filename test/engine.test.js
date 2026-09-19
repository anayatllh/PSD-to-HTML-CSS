/* Node test for the calculator/converter engine in js/calculator-app.js.
   Run with: node test/engine.test.js
   The app file is browser-only, so we give it a minimal DOM stub and read
   the logic back off window.CalcApp. */
var fs = require("fs");
var path = require("path");
var assert = require("assert");

var noop = function () { };
var stubElement = {
	textContent: "", innerHTML: "", value: "", dataset: {}, style: {},
	classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
	addEventListener: noop, setAttribute: noop, getAttribute: function () { return null; },
	contains: function () { return false; }, appendChild: noop, removeChild: noop, select: noop
};

global.window = {};
global.navigator = {};
global.document = {
	readyState: "complete",
	documentElement: { setAttribute: noop, getAttribute: function () { return null; } },
	body: stubElement,
	getElementById: function () { return null; },
	querySelector: function () { return null; },
	querySelectorAll: function () { return []; },
	createElement: function () { return stubElement; },
	addEventListener: noop
};
global.localStorage = { getItem: function () { return null; }, setItem: noop, removeItem: noop };

var source = fs.readFileSync(path.join(__dirname, "..", "js", "calculator-app.js"), "utf8");
new Function("window", "document", "localStorage", "navigator", source)(
	global.window, global.document, global.localStorage, global.navigator
);

var app = global.window.CalcApp;
assert.ok(app, "window.CalcApp should be exposed");

var passed = 0;
var failed = 0;
function check(name, fn) {
	try { fn(); passed++; console.log("  ok   " + name); }
	catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
function near(actual, expected, tolerance, label) {
	var diff = Math.abs(actual - expected);
	assert.ok(diff <= (tolerance || 1e-9),
		(label || "value") + ": expected ~" + expected + ", got " + actual);
}

console.log("\nCalculator");
check("addition", function () { assert.strictEqual(app.calculate("2+3"), 5); });
check("operator precedence", function () { assert.strictEqual(app.calculate("2+3*4"), 14); });
check("parentheses", function () { assert.strictEqual(app.calculate("(2+3)*4"), 20); });
check("nested parentheses", function () { assert.strictEqual(app.calculate("((2+3)*(4-1))/5"), 3); });
check("division", function () { assert.strictEqual(app.calculate("7/2"), 3.5); });
check("unary minus", function () { assert.strictEqual(app.calculate("-5+8"), 3); });
check("minus after operator", function () { assert.strictEqual(app.calculate("6*-2"), -12); });
check("power is right associative", function () { assert.strictEqual(app.calculate("2^3^2"), 512); });
check("power before multiply", function () { assert.strictEqual(app.calculate("3*2^3"), 24); });
check("decimals", function () { assert.strictEqual(app.calculate("1.5+2.25"), 3.75); });
check("float noise trimmed", function () { assert.strictEqual(app.calculate("0.1+0.2"), 0.3); });
check("percent of a sum", function () { assert.strictEqual(app.calculate("1200+15%"), 1380); });
check("percent subtracted", function () { assert.strictEqual(app.calculate("5000-10%"), 4500); });
check("percent as multiplier", function () { assert.strictEqual(app.calculate("1200*15%"), 180); });
check("standalone percent", function () { assert.strictEqual(app.calculate("50%"), 0.5); });
check("VAT 15% on 8500", function () { assert.strictEqual(app.calculate("8500*15%"), 1275); });
check("empty input returns null", function () { assert.strictEqual(app.calculate("   "), null); });
check("divide by zero throws", function () {
	assert.throws(function () { app.calculate("5/0"); }, /divide by zero/i);
});
check("unbalanced parentheses throws", function () {
	assert.throws(function () { app.calculate("(2+3"); }, /parenthes/i);
});
check("dangling operator throws", function () {
	assert.throws(function () { app.calculate("2+"); }, /Incomplete/);
});
check("garbage input throws", function () {
	assert.throws(function () { app.calculate("2+a"); }, /Unexpected/);
});
check("malformed number throws", function () {
	assert.throws(function () { app.calculate("1.2.3"); }, /Malformed/);
});

console.log("\nUnit converter");
check("km to mile", function () { near(app.convert(1, "Length", "Kilometer", "Mile"), 0.621371, 1e-6, "mile"); });
check("inch to cm", function () { near(app.convert(1, "Length", "Inch", "Centimeter"), 2.54, 1e-9, "cm"); });
check("kg to pound", function () { near(app.convert(1, "Weight / Mass", "Kilogram", "Pound"), 2.20462262, 1e-8, "lb"); });
check("maund to kg (BD)", function () { near(app.convert(1, "Weight / Mass", "Maund (BD)", "Kilogram"), 37.3242, 1e-4, "kg"); });
check("40 seer = 1 maund", function () { near(app.convert(40, "Weight / Mass", "Seer (BD)", "Maund (BD)"), 1, 1e-4, "maund"); });
check("0C to F", function () { assert.strictEqual(app.convert(0, "Temperature", "Celsius", "Fahrenheit"), 32); });
check("100C to F", function () { assert.strictEqual(app.convert(100, "Temperature", "Celsius", "Fahrenheit"), 212); });
check("-40C equals -40F", function () { near(app.convert(-40, "Temperature", "Celsius", "Fahrenheit"), -40, 1e-9, "F"); });
check("C to K", function () { near(app.convert(25, "Temperature", "Celsius", "Kelvin"), 298.15, 1e-9, "K"); });
check("F to K", function () { near(app.convert(32, "Temperature", "Fahrenheit", "Kelvin"), 273.15, 1e-9, "K"); });
check("C to Rankine", function () { near(app.convert(0, "Temperature", "Celsius", "Rankine"), 491.67, 1e-9, "R"); });
check("acre to hectare", function () { near(app.convert(1, "Area", "Acre", "Hectare"), 0.40468564, 1e-8, "ha"); });
check("1 bigha = 20 katha (BD)", function () { near(app.convert(1, "Area", "Bigha (BD)", "Katha (BD)"), 20, 1e-9, "katha"); });
check("1 katha = 720 sq ft (BD)", function () { near(app.convert(1, "Area", "Katha (BD)", "Square foot"), 720, 1e-6, "sq ft"); });
check("100 shotok = 1 acre", function () { near(app.convert(100, "Area", "Shotok / Decimal (BD)", "Acre"), 1, 1e-9, "acre"); });
check("liter to gallon (US)", function () { near(app.convert(1, "Volume", "Liter", "Gallon (US)"), 0.264172052, 1e-9, "gal"); });
check("kmh to mph", function () { near(app.convert(100, "Speed", "Kilometer/hour", "Mile/hour"), 62.1371192, 1e-6, "mph"); });
check("hours to minutes", function () { assert.strictEqual(app.convert(2, "Time", "Hour", "Minute"), 120); });
check("GiB to MiB", function () { assert.strictEqual(app.convert(1, "Digital storage", "Gibibyte (1024)", "Mebibyte (1024)"), 1024); });
check("bar to psi", function () { near(app.convert(1, "Pressure", "Bar", "PSI"), 14.5037738, 1e-6, "psi"); });
check("kWh to joule", function () { assert.strictEqual(app.convert(1, "Energy", "Kilowatt-hour", "Joule"), 3600000); });
check("kW to metric hp", function () { near(app.convert(1, "Power", "Kilowatt", "Horsepower (metric)"), 1.35962162, 1e-7, "hp"); });
check("degree to radian", function () { near(app.convert(180, "Angle", "Degree", "Radian"), Math.PI, 1e-9, "rad"); });
check("round trip stays put", function () {
	var out = app.convert(app.convert(12.34, "Length", "Foot", "Meter"), "Length", "Meter", "Foot");
	near(out, 12.34, 1e-9, "foot");
});
check("same unit is identity", function () { assert.strictEqual(app.convert(7, "Length", "Meter", "Meter"), 7); });
check("unknown unit throws", function () {
	assert.throws(function () { app.convert(1, "Length", "Parsec", "Meter"); }, /Unknown unit/);
});
check("every category converts without error", function () {
	Object.keys(app.UNITS).forEach(function (cat) {
		var units = Object.keys(app.UNITS[cat].units);
		units.forEach(function (u) {
			var v = app.convert(1, cat, units[0], u);
			assert.ok(isFinite(v), cat + " -> " + u + " produced " + v);
		});
	});
});

console.log("\nNumber formatting");
check("thousand separators", function () { assert.strictEqual(app.formatNumber(1234567.891, 2, true), "1,234,567.89"); });
check("negative grouping", function () { assert.strictEqual(app.formatNumber(-1234.5, 2, true), "-1,234.5"); });
check("plain output", function () { assert.strictEqual(app.formatNumber(1234.5, 2, false), "1234.5"); });
check("zero decimals", function () { assert.strictEqual(app.formatNumber(2.7, 0, false), "3"); });
check("huge numbers go exponential", function () { assert.ok(app.formatNumber(1e18, 6, true).indexOf("e+") !== -1); });
check("tiny numbers go exponential", function () { assert.ok(app.formatNumber(1e-12, 6, true).indexOf("e-") !== -1); });
check("NaN renders empty", function () { assert.strictEqual(app.formatNumber(NaN, 2, true), ""); });

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);

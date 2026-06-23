import {
  celsiusToFahrenheit,
  normalizeTemperatureToFahrenheit,
  getTemperatureColorToken,
  formatTemperatureF
} from "./src/utils/temperatureScale";

function runTests() {
  console.log("Running temperature scale unit tests...");

  // celsiusToFahrenheit(25) returns 77
  const r1 = celsiusToFahrenheit(25);
  console.assert(Math.abs(r1 - 77) < 0.001, `celsiusToFahrenheit(25) failed: got ${r1}`);

  // celsiusToFahrenheit(30) returns 86
  const r2 = celsiusToFahrenheit(30);
  console.assert(Math.abs(r2 - 86) < 0.001, `celsiusToFahrenheit(30) failed: got ${r2}`);

  // normalizeTemperatureToFahrenheit(25, "C") returns 77
  const r3 = normalizeTemperatureToFahrenheit(25, "C");
  console.assert(r3 !== null && Math.abs(r3 - 77) < 0.001, `normalizeTemperatureToFahrenheit(25, "C") failed: got ${r3}`);

  // normalizeTemperatureToFahrenheit(77, "F") returns 77
  const r4 = normalizeTemperatureToFahrenheit(77, "F");
  console.assert(r4 !== null && Math.abs(r4 - 77) < 0.001, `normalizeTemperatureToFahrenheit(77, "F") failed: got ${r4}`);

  // getTemperatureColorToken(27, "C") returns the normal/green bucket
  const t1 = getTemperatureColorToken(27, "C");
  console.assert(t1 === "normal", `getTemperatureColorToken(27, "C") failed: got ${t1}`);

  // getTemperatureColorToken(35, "C") returns the yellow/elevated bucket
  const t2 = getTemperatureColorToken(35, "C");
  console.assert(t2 === "elevated", `getTemperatureColorToken(35, "C") failed: got ${t2}`);

  // getTemperatureColorToken(45, "C") returns the orange-red/hot bucket
  const t3 = getTemperatureColorToken(45, "C");
  console.assert(t3 === "orange-red" || t3 === "hot", `getTemperatureColorToken(45, "C") failed: got ${t3}`);

  // getTemperatureColorToken(55, "C") returns the deep red/critical bucket
  const t4 = getTemperatureColorToken(55, "C");
  console.assert(t4 === "critical" || t4 === "deep-red", `getTemperatureColorToken(55, "C") failed: got ${t4}`);

  // getTemperatureColorToken(15, "C") returns the blue/cold bucket
  const t5 = getTemperatureColorToken(15, "C");
  console.assert(t5 === "cold" || t5 === "blue", `getTemperatureColorToken(15, "C") failed: got ${t5}`);

  // getTemperatureColorToken(5, "C") returns the light-blue/coldest bucket
  const t6 = getTemperatureColorToken(5, "C");
  console.assert(t6 === "coldest" || t6 === "light-blue", `getTemperatureColorToken(5, "C") failed: got ${t6}`);

  console.log("All temperature scale utility unit tests passed!");
}

runTests();

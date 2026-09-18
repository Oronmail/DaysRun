// site/__tests__/weather-records.test.ts — how the Records page prints the weather boards.
import { describe, it, expect } from "vitest";
import { weatherLine, WEATHER_BOARDS } from "../lib/weatherRecords";
describe("the weather boards", () => {
  it("prints the strongest model wind with the gust of that same report, and when", () => {
    expect(weatherLine("wind", 30.0, "2026-09-16T08:00:00+00:00", 43.0)).toEqual({ figure: "30.0 kt", detail: "gusts 43 kt", when: "at 16 Sep 08:00 UTC" });
    expect(weatherLine("wind", 29.9, "2026-09-16T04:00:00+00:00", null).detail).toBe("");
  });
  it("prints the highest waves to a tenth of a metre", () => { expect(weatherLine("wave", 3.94, "2026-09-17T04:00:00+00:00", null)).toEqual({ figure: "3.9 m", detail: "", when: "at 17 Sep 04:00 UTC" }); });
  it("prints a calm as whole hours FROM its first report", () => { expect(weatherLine("calm", 32, "2026-09-09T12:00:00+00:00", null)).toEqual({ figure: "32 h", detail: "under 6 kt", when: "from 09 Sep 12:00 UTC" }); });
  it("names the three boards as model values and says what counts", () => {
    expect(WEATHER_BOARDS.map(b => b.kind)).toEqual(["wind", "wave", "calm"]);
    expect(WEATHER_BOARDS[0].title).toBe("Strongest model wind");                       // wind is always called model wind
    for (const b of WEATHER_BOARDS) expect(b.valid).toMatch(/model/i);                   // and every note says where the figure comes from
  });
});

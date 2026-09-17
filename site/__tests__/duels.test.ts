// site/__tests__/duels.test.ts
import { describe, it, expect } from "vitest";
import { duelStory } from "../lib/duels";
const d = (o: Record<string, unknown>) => ({ gap_nm: 1, gap24_nm: 7, gap72_nm: 9, lead_changes: 0, passed_at: null, as_of: "2026-09-17T12:00:00+00:00", ...o });
describe("duelStory", () => {
  it("tells a pass with how far back the new leader of the pair came from", () => {
    expect(duelStory(d({ gap_nm: 2, gap72_nm: -16, lead_changes: 1, passed_at: "2026-09-17T08:00:00+00:00" }), "Louis", "Guy")).toBe("Louis got ahead at 0800 on 17 Sep, after trailing by 16 nm three days ago.");
    expect(duelStory(d({ gap_nm: 3, gap72_nm: -1, lead_changes: 3, passed_at: "2026-09-16T20:00:00+00:00" }), "Daniel", "Ertan")).toBe("Daniel got ahead at 2000 on 16 Sep. The lead has changed hands 3 times in three days.");
  });
  it("tells a chase, a getaway, or a stand-off", () => {
    expect(duelStory(d({ gap_nm: 1, gap72_nm: 9 }), "Etienne", "Daniel")).toBe("Daniel has closed 8 nm in three days.");
    expect(duelStory(d({ gap_nm: 12, gap72_nm: 3 }), "Guido", "Louis")).toBe("Guido has pulled out 9 nm in three days.");
    expect(duelStory(d({ gap_nm: 6, gap72_nm: 7 }), "Henry", "Isa")).toBe("Nothing in it: the gap has moved 1 nm in three days.");
    expect(duelStory(d({ gap_nm: 6, gap72_nm: null, gap24_nm: null }), "Henry", "Isa")).toBe("Too few reports from both boats to tell the story yet.");
  });
});

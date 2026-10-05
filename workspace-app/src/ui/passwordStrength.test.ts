import { describe, expect, it } from "vitest";

import { assessPassword } from "./passwordStrength";

describe("assessPassword", () => {
  it("is empty for no input", () => {
    expect(assessPassword("")).toMatchObject({ score: 0, label: "" });
  });

  it("flags anything under the server minimum as too short", () => {
    const a = assessPassword("Ab1!xyz");
    expect(a.label).toBe("Too short");
    expect(a.checks.length).toBe(false);
    expect(a.score).toBe(1);
  });

  it("rewards length and variety", () => {
    expect(assessPassword("kettle-orbit").score).toBeGreaterThanOrEqual(2);
    expect(assessPassword("Kettle-Orbit-42").score).toBeGreaterThanOrEqual(3);
    expect(assessPassword("correct horse battery staple").score).toBe(4);
  });

  it("caps obvious passwords no matter how long", () => {
    expect(assessPassword("password123456789").score).toBe(1);
    expect(assessPassword("aaaaaaaaaaaaaaaaaaaa").score).toBe(1);
    expect(assessPassword("password123456789").checks.notObvious).toBe(false);
  });

  it("penalises passwords containing personal info", () => {
    const a = assessPassword("riley-2026-garden", ["Riley"]);
    expect(a.checks.notObvious).toBe(false);
    expect(a.score).toBe(1);
    expect(assessPassword("riley-2026-garden", ["ab"]).score).toBeGreaterThan(
      1,
    );
  });
});

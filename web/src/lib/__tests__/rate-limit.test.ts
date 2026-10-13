import { afterEach, describe, expect, it, vi } from "vitest";
import { isRateLimited } from "../rate-limit";

describe("isRateLimited", () => {
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then refuses, then recovers when the window passes", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i += 1) expect(isRateLimited("a", 3, 1000)).toBe(false);
    expect(isRateLimited("a", 3, 1000)).toBe(true);
    expect(isRateLimited("b", 3, 1000)).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(isRateLimited("a", 3, 1000)).toBe(false);
  });
});

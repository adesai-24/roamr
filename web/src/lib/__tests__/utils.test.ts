import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("merges conditional classes", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
  });

  it("lets a later utility override an earlier one in the same group", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

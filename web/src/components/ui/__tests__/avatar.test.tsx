import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initialsFrom } from "@/components/ui/avatar";

describe("initialsFrom", () => {
  it.each([
    ["Mann Talati", "MT"],
    ["mann_talati", "MT"],
    ["mann.talati", "MT"],
    ["mann-talati", "MT"],
    ["mann", "M"],
    ["  mann   talati  ", "MT"],
    ["Mann Kumar Talati", "MK"],
    ["", "?"],
    ["   ", "?"],
  ])("turns %j into %j", (input, expected) => {
    expect(initialsFrom(input)).toBe(expected);
  });

  it.each([null, undefined])("falls back for %j", (input) => {
    expect(initialsFrom(input)).toBe("?");
  });
});

describe("Avatar", () => {
  it("shows an image with the person's name as alt text when there is one", () => {
    render(<Avatar src="https://example.test/a.jpg" name="Mann Talati" />);
    expect(screen.getByRole("img", { name: "Mann Talati" })).toBeVisible();
  });

  it("falls back to initials that are hidden from assistive technology", () => {
    render(<Avatar name="Mann Talati" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("MT")).toHaveAttribute("aria-hidden", "true");
  });
});

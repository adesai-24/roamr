import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Proves the component-testing path works end to end -- JSX transform, jsdom,
 * Testing Library, and the jest-dom matchers -- so the first real component
 * test in a later PR fails for its own reasons rather than for setup reasons.
 */
describe("component test harness", () => {
  it("renders JSX and applies jest-dom matchers", () => {
    render(<p>touching grass</p>);
    expect(screen.getByText("touching grass")).toBeVisible();
  });
});

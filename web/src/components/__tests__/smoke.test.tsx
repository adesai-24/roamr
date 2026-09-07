import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/** Proves the component-testing path works end to end. */
describe("component test harness", () => {
  it("renders JSX and applies jest-dom matchers", () => {
    render(<p>touching grass</p>);
    expect(screen.getByText("touching grass")).toBeVisible();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonStyles } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children as an accessible button", () => {
    render(<Button>Claim username</Button>);
    expect(screen.getByRole("button", { name: "Claim username" })).toBeVisible();
  });

  it("defaults to type=button so it cannot submit a form by accident", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("still allows an explicit submit", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("keeps a caller class alongside the variant classes", () => {
    render(<Button className="mt-4">Go</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("mt-4");
    expect(button.className).toContain("bg-accent");
  });

  it("lets a caller override a conflicting default rather than fighting it in the cascade", () => {
    render(<Button className="bg-surface">Go</Button>);
    const button = screen.getByRole("button");
    expect(button.classList.contains("bg-surface")).toBe(true);
    expect(button.classList.contains("bg-accent")).toBe(false);
  });

  it("forwards a ref to the underlying element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Go</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("is operable from the keyboard", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole("button");
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clears a 44px tap target at every size", () => {
    // The README's platform argument is that people open this on a phone, so a
    // "small" button is small in padding, never in the area a thumb has to hit.
    for (const size of ["sm", "md", "lg"] as const) {
      expect(buttonStyles({ size })).toMatch(/min-h-1[12]/);
    }
  });

  it("spans the container only when asked to", () => {
    expect(buttonStyles({ fullWidth: true })).toContain("w-full");
    expect(buttonStyles()).not.toContain("w-full");
  });
});

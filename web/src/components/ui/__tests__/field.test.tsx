import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, fieldDescribedBy, fieldErrorId, fieldHintId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

describe("Field", () => {
  it("associates its label with the control", () => {
    render(
      <Field id="username" label="Username">
        <Input id="username" name="username" />
      </Field>,
    );
    // getByLabelText only resolves when the label/control wiring is real.
    expect(screen.getByLabelText("Username")).toBe(screen.getByRole("textbox"));
  });

  it("announces an error rather than only colouring it", () => {
    render(
      <Field id="username" label="Username" error="That username is taken.">
        <Input id="username" aria-invalid />
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("That username is taken.");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("renders a hint when there is no error, and both when there is", () => {
    const { rerender } = render(
      <Field id="username" label="Username" hint="3-30 characters.">
        <Input id="username" />
      </Field>,
    );
    expect(screen.getByText("3-30 characters.")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(
      <Field id="username" label="Username" hint="3-30 characters." error="Too short.">
        <Input id="username" />
      </Field>,
    );
    expect(screen.getByText("3-30 characters.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Too short.");
  });

  it("puts the ids fieldDescribedBy hands out on the elements it names", () => {
    render(
      <Field id="username" label="Username" hint="A hint." error="An error.">
        <Input
          id="username"
          aria-describedby={fieldDescribedBy("username", { hint: true, error: "An error." })}
        />
      </Field>,
    );

    const describedBy = screen.getByRole("textbox").getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toContain(fieldErrorId("username"));
    expect(describedBy.split(" ")).toContain(fieldHintId("username"));
    for (const id of describedBy.split(" ")) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("leaves aria-describedby off when there is nothing to describe", () => {
    expect(fieldDescribedBy("username", {})).toBeUndefined();
  });

  it("names the error first, so it is read before the hint", () => {
    expect(fieldDescribedBy("username", { hint: true, error: "nope" })).toBe(
      "username-error username-hint",
    );
  });
});

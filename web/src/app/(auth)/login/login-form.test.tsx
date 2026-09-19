import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { requestMagicLink, signInWithPassword } from "./actions";

vi.mock("./actions", () => ({
  requestMagicLink: vi.fn(async () => ({ status: "sent", email: "test@example.com" })),
  signInWithPassword: vi.fn(async () => ({ status: "error", message: "Check your password." })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("switches between password and email-link sign-in and submits the matching action", async () => {
  render(<LoginForm next="/friends" />);
  expect(screen.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Password" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with password" }));
  expect(await screen.findByText("Check your password.")).toBeVisible();
  expect(signInWithPassword).toHaveBeenCalledOnce();
  const submitted = vi.mocked(signInWithPassword).mock.calls[0][1];
  expect(submitted.get("password")).toBe("test-password");
  expect(submitted.get("next")).toBe("/friends");
  expect(requestMagicLink).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Email link" }));
  expect(screen.queryByText("Check your password.")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));
  await waitFor(() => expect(requestMagicLink).toHaveBeenCalledOnce());
  expect(await screen.findByText("Check your email")).toBeVisible();
});

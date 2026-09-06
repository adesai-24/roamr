import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FriendActionResult } from "@/lib/friends/types";
import { AddFriendForm } from "../add-friend-form";

// The form imports the server actions for its defaults. A factory keeps
// `next/headers` and the env schema out of jsdom entirely.
vi.mock("@/lib/friends/actions", () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriendship: vi.fn(),
}));

function setup(result: FriendActionResult = { ok: true, message: "Sent." }) {
  const send = vi.fn(async () => result);
  render(<AddFriendForm send={send} />);
  return { send, input: screen.getByLabelText(/their username/i) };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /send request/i }));
}

describe("AddFriendForm", () => {
  it("sends the username, trimmed and lowercased", async () => {
    const { send, input } = setup();

    fireEvent.change(input, { target: { value: "  GrassToucher " } });
    submit();

    expect(await screen.findByText("Sent.")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith("grasstoucher");
  });

  it("clears the box once the request is away", async () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: "bob" } });
    submit();

    expect(await screen.findByText("Sent.")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("shows what the action said went wrong", async () => {
    const { input } = setup({ ok: false, error: "No one here goes by @nobody." });

    fireEvent.change(input, { target: { value: "nobody" } });
    submit();

    expect(await screen.findByText("No one here goes by @nobody.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps what was typed when it was rejected, so the typo is still visible", async () => {
    const { input } = setup({ ok: false, error: "No one here goes by @bbo." });

    fireEvent.change(input, { target: { value: "bbo" } });
    submit();

    expect(await screen.findByText("No one here goes by @bbo.")).toBeInTheDocument();
    expect(input).toHaveValue("bbo");
  });

  it("sends an empty box to the action rather than guessing at a message", async () => {
    // The action owns every rule about what a username is; a second copy of
    // those rules here is how the two of them start disagreeing.
    const { send } = setup({ ok: false, error: "Type a username to send a request." });

    submit();

    expect(await screen.findByText("Type a username to send a request.")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith("");
  });
});

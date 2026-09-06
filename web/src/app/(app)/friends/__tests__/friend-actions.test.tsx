import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FriendActionResult } from "@/lib/friends/types";
import { FriendActions, type FriendRowVariant } from "../friend-actions";

vi.mock("@/lib/friends/actions", () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriendship: vi.fn(),
}));

const OTHER = "22222222-0000-4000-8000-000000000002";

function setup(variant: FriendRowVariant, result: FriendActionResult = { ok: true, message: "" }) {
  const accept = vi.fn(async () => result);
  const remove = vi.fn(async () => result);
  render(
    <FriendActions userId={OTHER} name="Bob" variant={variant} accept={accept} remove={remove} />,
  );
  return { accept, remove };
}

/**
 * Clicking starts a transition, and the action it awaits settles a microtask
 * later. Wrapping in `act` lets that settle before the assertion, rather than
 * after the test has already finished.
 */
async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("FriendActions on an incoming request", () => {
  it("accepts", async () => {
    const { accept, remove } = setup("incoming");

    await click(/^accept bob$/i);

    expect(accept).toHaveBeenCalledWith(OTHER);
    expect(remove).not.toHaveBeenCalled();
  });

  it("declines through the same call that cancels and unfriends", async () => {
    const { remove } = setup("incoming");

    await click(/^decline bob$/i);

    expect(remove).toHaveBeenCalledWith(OTHER);
  });

  it("does not ask twice before declining", async () => {
    // A request is not a relationship. Confirming every tap is what teaches
    // people to tap through the one confirmation that matters.
    setup("incoming");
    await click(/^decline bob$/i);
    expect(screen.queryByText(/remove bob\?/i)).not.toBeInTheDocument();
  });

  it("shows why an action failed", async () => {
    setup("incoming", { ok: false, error: "That request is not waiting any more." });

    await click(/^accept bob$/i);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That request is not waiting any more.",
    );
  });
});

describe("FriendActions on an outgoing request", () => {
  it("cancels", async () => {
    const { remove, accept } = setup("outgoing");

    await click(/^cancel the request to bob$/i);

    expect(remove).toHaveBeenCalledWith(OTHER);
    expect(accept).not.toHaveBeenCalled();
  });
});

describe("FriendActions on a friend", () => {
  it("asks before removing somebody", async () => {
    const { remove } = setup("friend");

    await click(/^remove bob$/i);

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText(/remove bob\?/i)).toBeInTheDocument();
  });

  it("removes once the question is answered", async () => {
    const { remove } = setup("friend");

    await click(/^remove bob$/i);
    await click(/^yes, remove bob$/i);

    expect(remove).toHaveBeenCalledWith(OTHER);
  });

  it("backs out without removing", async () => {
    const { remove } = setup("friend");

    await click(/^remove bob$/i);
    await click(/^keep$/i);

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^remove bob$/i })).toBeInTheDocument();
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestMagicLink, signInWithPassword } from "./actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }),
}));

const passwordLogin = vi.fn();
const sendLink = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  passwordLogin.mockResolvedValue({ error: null });
  sendLink.mockResolvedValue({ error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: { signInWithPassword: passwordLogin, signInWithOtp: sendLink },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

function form(password = " secret password ", next = "/friends") {
  const data = new FormData();
  data.set("email", "  Test@Example.com ");
  data.set("password", password);
  data.set("next", next);
  return data;
}

it("normalizes email, preserves the password and redirects after successful authentication", async () => {
  await expect(signInWithPassword({ status: "idle" }, form())).rejects.toThrow("redirect");
  expect(passwordLogin).toHaveBeenCalledWith({
    email: "test@example.com",
    password: " secret password ",
  });
  expect(redirect).toHaveBeenCalledWith("/friends");
  expect(sendLink).not.toHaveBeenCalled();
});

it("rejects an empty password before contacting Supabase", async () => {
  expect(await signInWithPassword({ status: "idle" }, form(""))).toEqual({
    status: "error",
    message: "Enter your password.",
  });
  expect(createClient).not.toHaveBeenCalled();
});

it("does not redirect or expose provider details on invalid credentials", async () => {
  passwordLogin.mockResolvedValue({ error: { status: 400, message: "private provider detail" } });
  const result = await signInWithPassword({ status: "idle" }, form());
  expect(result).toEqual({
    status: "error",
    message: "Could not sign in. Check your email and password, or use an email link.",
  });
  expect(redirect).not.toHaveBeenCalled();
});

it("reports password rate limits without mentioning email delivery", async () => {
  passwordLogin.mockResolvedValue({ error: { status: 429 } });
  expect(await signInWithPassword({ status: "idle" }, form())).toEqual({
    status: "error",
    message: "Too many sign-in attempts. Wait a little, then try again.",
  });
});

it("rejects external redirect destinations", async () => {
  await expect(
    signInWithPassword({ status: "idle" }, form("secret", "https://evil.example")),
  ).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledWith("/feed");
});

it("still sends magic links without requiring a password", async () => {
  expect(await requestMagicLink({ status: "idle" }, form(""))).toEqual({
    status: "sent",
    email: "test@example.com",
  });
  expect(sendLink).toHaveBeenCalledWith({
    email: "test@example.com",
    options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Ffriends" },
  });
  expect(passwordLogin).not.toHaveBeenCalled();
});

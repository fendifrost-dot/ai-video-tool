import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./SignInForm";

const auth = vi.hoisted(() => ({ google: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), otp: vi.fn(), legacy: vi.fn() }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: auth.google } } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: auth.getUser, signOut: auth.signOut, signInWithOtp: auth.otp, signInWithOAuth: auth.legacy } } }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: null } });
  auth.google.mockResolvedValue({ redirected: false });
  auth.signOut.mockResolvedValue({ error: null });
  auth.otp.mockResolvedValue({ error: null });
});

describe("Google sign-in (mocked integration)", () => {
  it("uses managed Google with a public same-origin callback, never legacy OAuth", async () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByTestId("google-sign-in"));
    await waitFor(() => expect(auth.google).toHaveBeenCalledWith("google", {
      redirect_uri: `${window.location.origin}/auth`, extraParams: { prompt: "select_account" },
    }));
    expect(auth.legacy).not.toHaveBeenCalled();
  });
  it("clears anonymous sessions before Google account sign-in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { is_anonymous: true } } });
    render(<SignInForm />);
    fireEvent.click(screen.getByTestId("google-sign-in"));
    await waitFor(() => expect(auth.google).toHaveBeenCalledOnce());
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(auth.google.mock.invocationCallOrder[0]);
  });
  it("allows retry after OAuth errors", async () => {
    auth.google.mockResolvedValue({ error: { message: "OAuth cancelled" } });
    render(<SignInForm />);
    const button = screen.getByTestId("google-sign-in");
    fireEvent.click(button);
    await waitFor(() => expect(auth.google).toHaveBeenCalledOnce());
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(auth.google).toHaveBeenCalledTimes(2));
  });
  it("releases loading once the preview session has been set", async () => {
    render(<SignInForm />);
    const button = screen.getByTestId("google-sign-in");
    fireEvent.click(button);
    await waitFor(() => expect(auth.google).toHaveBeenCalledOnce());
    await waitFor(() => expect(button).not.toBeDisabled());
  });
  it("leaves full-page navigation to the helper", async () => {
    auth.google.mockResolvedValue({ redirected: true });
    render(<SignInForm />);
    const button = screen.getByTestId("google-sign-in");
    fireEvent.click(button);
    await waitFor(() => expect(auth.google).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
  });
  it("restricts the email fallback to existing accounts", async () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Use email magic link instead" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));
    await waitFor(() => expect(auth.otp).toHaveBeenCalledWith({ email: "owner@example.com", options: {
      emailRedirectTo: `${window.location.origin}/auth`, shouldCreateUser: false,
    } }));
  });
});
"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { preparePhoto, type PreparedPhoto } from "@/lib/moments/photo-pipeline";

type TokenResponse = { access_token?: string; error?: string; scope?: string };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        include_granted_scopes: boolean;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }) => { requestAccessToken: (config: { prompt: string }) => void };
    };
  };
};
type Session = {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  expireTime: string;
  pollingConfig?: { pollInterval: string; timeoutIn: string };
};
type MediaItem = { id: string; type: string; createTime: string };
const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const duration = (value: string | undefined, fallback: number) =>
  value && /^\d+(\.\d+)?s$/.test(value) ? Number.parseFloat(value) * 1000 : fallback;

async function api(token: string, body: object, signal?: AbortSignal) {
  const response = await fetch("/api/google-photos", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || response.redirected) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error ?? "Could not import photos. Check that you are signed in and try again.",
    );
  }
  return response;
}

export function GooglePhotosPicker({
  clientId,
  disabled,
  onPhotos,
  onBusyChange,
}: {
  clientId?: string;
  disabled: boolean;
  onPhotos: (photos: PreparedPhoto[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerUri, setPickerUri] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    onBusyChange(false);
    setPickerUri(null);
    setMessage(null);
  }

  function connect() {
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!google || !clientId || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage("Connecting to Google Photos…");

    function fail(message: string) {
      if (signal.aborted) return;
      setError(message);
      cancel();
    }

    async function pick(token: string) {
      let session: Session | undefined;
      try {
        session = (await (await api(token, { operation: "create" }, signal)).json()) as Session;
        if (signal.aborted) return;
        const uri = new URL(session.pickerUri);
        if (uri.origin !== "https://photos.google.com")
          throw new Error("Google returned an invalid picker address.");
        setPickerUri(`${uri.href.replace(/\/$/, "")}/autoclose`);
        setMessage("Open Google Photos, choose up to 20 photos, then select Done.");
        const deadline = Math.min(
          Date.now() + duration(session.pollingConfig?.timeoutIn, 600_000),
          Date.parse(session.expireTime),
        );
        while (!session.mediaItemsSet) {
          if (!Number.isFinite(deadline) || Date.now() >= deadline)
            throw new Error("Photo selection timed out. Please start again.");
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(new DOMException("Cancelled", "AbortError"));
            };
            const timer = setTimeout(
              () => {
                signal.removeEventListener("abort", abort);
                resolve();
              },
              Math.min(
                Math.max(1000, duration(session?.pollingConfig?.pollInterval, 5000)),
                Math.max(0, deadline - Date.now()),
              ),
            );
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          });
          session = (await (
            await api(token, { operation: "poll", sessionId: session.id }, signal)
          ).json()) as Session;
          if (!session.mediaItemsSet && session.pollingConfig?.timeoutIn === "0s")
            throw new Error("Photo selection timed out. Please start again.");
        }
        setPickerUri(null);
        const photos: PreparedPhoto[] = [];
        let pageToken: string | undefined;
        let skipped = 0;
        do {
          const page = (await (
            await api(token, { operation: "list", sessionId: session.id, pageToken }, signal)
          ).json()) as { mediaItems?: MediaItem[]; nextPageToken?: string };
          for (const item of page.mediaItems ?? []) {
            if (item.type !== "PHOTO") {
              skipped++;
              continue;
            }
            if (photos.length >= 20) throw new Error("Choose at most 20 photos at a time.");
            setMessage(`Importing photo ${photos.length + 1}…`);
            const response = await api(
              token,
              { operation: "download", sessionId: session.id, itemId: item.id, pageToken },
              signal,
            );
            const photo = await preparePhoto(await response.blob());
            const takenAt = new Date(item.createTime);
            photos.push({
              ...photo,
              lat: null,
              lng: null,
              takenAt: Number.isNaN(takenAt.getTime()) ? photo.takenAt : takenAt,
            });
          }
          pageToken = page.nextPageToken;
        } while (pageToken);
        if (signal.aborted) return;
        if (!photos.length)
          throw new Error("No photos were selected. Videos cannot be added as moments.");
        onPhotos(photos);
        setMessage(
          `${photos.length} photo${photos.length === 1 ? "" : "s"} ready to review.${skipped ? " Videos were skipped." : ""}`,
        );
      } catch (cause) {
        if (!signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not import photos.");
      } finally {
        if (session)
          void api(token, { operation: "delete", sessionId: session.id }).catch(() => {});
        if (!signal.aborted) {
          active.current = null;
          setBusy(false);
          onBusyChange(false);
          setPickerUri(null);
        }
      }
    }

    try {
      let requestedConsent = false;
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        include_granted_scopes: false,
        callback: (response) => {
          if (signal.aborted) return;
          if (
            response.error ||
            !response.access_token ||
            !response.scope?.split(" ").includes(SCOPE)
          ) {
            if (!requestedConsent) {
              requestedConsent = true;
              setMessage("Google needs permission to read the photos you choose…");
              tokenClient.requestAccessToken({ prompt: "consent" });
              return;
            }
            fail(
              "Google Photos access was not granted. You can try again or upload from your device.",
            );
            return;
          }
          void pick(response.access_token);
        },
        error_callback: () =>
          fail("Google sign-in was closed or blocked. Allow popups and try again."),
      });
      tokenClient.requestAccessToken({ prompt: "" });
    } catch {
      fail("Could not open Google sign-in. Please try again.");
    }
  }

  if (!clientId) return null;
  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => setReady(true)}
        onError={() =>
          setError("Google Photos could not load. You can still upload from your device.")
        }
      />
      <Button variant="secondary" disabled={disabled || busy || !ready} onClick={connect}>
        Choose from Google Photos
      </Button>
      <p className="text-muted text-sm">
        Connect your Google account to select photos. Confirm each photo’s city after importing;
        Google does not share its location.
      </p>
      {pickerUri && (
        <a
          href={pickerUri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline"
        >
          Open Google Photos to select pictures
        </a>
      )}
      {message && (
        <p role="status" className="text-muted text-sm">
          {message}
        </p>
      )}
      {busy && (
        <Button variant="ghost" onClick={cancel}>
          Cancel import
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { PinField } from "@/components/moments/pin-field";
import type { Coordinates } from "@/components/moments/pin-map";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  createMomentAction,
  createPhotoUploadTargetAction,
  suggestCityAction,
} from "@/lib/moments/actions";
import { preparePhoto, type PreparedPhoto } from "@/lib/moments/photo-pipeline";
import type { CitySelection } from "@/lib/moments/types";
import { uploadPhoto } from "@/lib/moments/upload";

/**
 * The core loop, as a form: pick a photo, confirm where it was, save.
 *
 * Everything except the photo and the city is optional, and the city usually
 * fills itself in -- so for a photo taken on a phone with location on, this is
 * two taps.
 */

interface SelectedCity {
  label: string;
  /** Where the pin map opens if this is the only location we have. */
  center: Coordinates;
  /**
   * A bare place id when the city row already exists (the reverse-geocoded
   * suggestion resolved it), or the whole picker result when it may not.
   */
  value: string | CitySelection;
}

type Status = "empty" | "reading" | "ready" | "saving";

export function NewMomentForm() {
  const router = useRouter();
  const captionId = useId();

  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [city, setCity] = useState<SelectedCity | null>(null);
  const [caption, setCaption] = useState("");
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Object URLs are held by the browser until they are revoked; replacing the
  // photo three times would otherwise pin three decoded images in memory.
  const previewUrlRef = useRef<string | null>(null);
  const replacePreview = useCallback((url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const handleFile = async (file: File) => {
    setStatus("reading");
    setError(null);
    setNotice(null);
    setPin(null);

    let prepared: PreparedPhoto;
    try {
      prepared = await preparePhoto(file);
    } catch (cause) {
      replacePreview(null);
      setPhoto(null);
      setStatus("empty");
      setError(cause instanceof Error ? cause.message : "That file could not be read as a photo.");
      return;
    }

    setPhoto(prepared);
    replacePreview(URL.createObjectURL(prepared.blob));

    // The city comes from the photo's own GPS where it had any. This is the
    // whole reason EXIF is read before the re-encode strips it.
    if (prepared.lat !== null && prepared.lng !== null) {
      const suggestion = await suggestCityAction(prepared.lat, prepared.lng);
      if (suggestion.ok && suggestion.data) {
        setCity({
          label: suggestion.data.display_name,
          center: { lat: prepared.lat, lng: prepared.lng },
          value: suggestion.data.provider_place_id,
        });
        setNotice(`Looks like ${suggestion.data.display_name}. Change it below if that is wrong.`);
      } else {
        setNotice("That photo has a location, but it is not near a city we know. Pick one below.");
      }
    }

    setStatus("ready");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photo) {
      setError("Pick a photo first.");
      return;
    }
    if (!city) {
      setError("Pick the city this photo is from.");
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const target = await createPhotoUploadTargetAction();
      if (!target.ok) {
        setStatus("ready");
        setError(target.error);
        return;
      }

      await uploadPhoto(target.data, photo.blob);

      const created = await createMomentAction({
        photoPath: target.data.path,
        width: photo.width,
        height: photo.height,
        caption: caption.trim().length > 0 ? caption.trim() : null,
        takenAt: photo.takenAt ? photo.takenAt.toISOString() : null,
        pinLat: pin?.lat ?? null,
        pinLng: pin?.lng ?? null,
        city: city.value,
      });

      if (!created.ok) {
        setStatus("ready");
        setError(created.error);
        return;
      }

      router.push(`/moments/${created.data.momentId}`);
    } catch (cause) {
      setStatus("ready");
      setError(cause instanceof Error ? cause.message : "Could not save that moment.");
    }
  };

  const busy = status === "reading" || status === "saving";

  // Where the pin map opens if somebody asks for one: the photo's own fix
  // first, the city centre as a fallback, and nothing at all until one exists.
  const photoCoordinates =
    photo && photo.lat !== null && photo.lng !== null ? { lat: photo.lat, lng: photo.lng } : null;

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <label htmlFor="moment-photo" className="text-sm font-medium">
          Photo
        </label>
        <input
          id="moment-photo"
          type="file"
          // No `capture`: the camera roll is the point, and forcing the camera
          // would make posting a photo from yesterday impossible.
          accept="image/*"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="file:bg-surface-sunken file:text-foreground text-muted rounded-card file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-muted text-sm">
          Photos are resized in your browser before they upload, which also strips the location out
          of the file itself.
        </p>
      </div>

      {status === "reading" ? (
        <p role="status" className="text-muted text-sm">
          Reading that photo…
        </p>
      ) : null}

      {photo ? (
        <MomentPhoto
          url={previewUrl}
          alt="The photo you picked"
          width={photo.width}
          height={photo.height}
          className="rounded-card"
          eager
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <CityAutocomplete
          label="City"
          onSelect={(result) => {
            setCity({
              label: result.displayName,
              center: { lat: result.lat, lng: result.lng },
              value: result,
            });
            setNotice(null);
          }}
        />
        {city ? (
          <p className="text-muted text-sm" aria-live="polite">
            Filing this under <strong className="text-foreground">{city.label}</strong>.
          </p>
        ) : null}
        {notice ? (
          <p className="text-muted text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </div>

      <Field id={captionId} label="Caption" hint="Optional.">
        <Textarea
          id={captionId}
          value={caption}
          maxLength={500}
          disabled={busy}
          placeholder="Say something about it, or do not."
          onChange={(event) => setCaption(event.target.value)}
        />
      </Field>

      <PinField
        value={pin}
        onChange={setPin}
        suggested={photoCoordinates ?? city?.center ?? null}
        disabled={busy}
      />

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth disabled={busy || !photo || !city}>
        {status === "saving" ? "Saving…" : "Save moment"}
      </Button>
    </form>
  );
}

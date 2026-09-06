"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { PinField } from "@/components/moments/pin-field";
import type { Coordinates } from "@/components/moments/pin-map";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { deleteMomentAction, updateMomentAction } from "@/lib/moments/actions";
import type { CitySelection } from "@/lib/moments/types";

export interface MomentEditorProps {
  momentId: string;
  caption: string | null;
  pin: Coordinates | null;
  city: {
    id: string;
    displayName: string;
    providerPlaceId: string;
    lat: number;
    lng: number;
  };
}

interface SelectedCity {
  label: string;
  center: Coordinates;
  value: string | CitySelection;
}

export function MomentEditor({ momentId, caption, pin, city }: MomentEditorProps) {
  const router = useRouter();
  const captionId = useId();

  const [draftCaption, setDraftCaption] = useState(caption ?? "");
  const [draftPin, setDraftPin] = useState<Coordinates | null>(pin);
  const [draftCity, setDraftCity] = useState<SelectedCity>({
    label: city.displayName,
    center: { lat: city.lat, lng: city.lng },
    // The place id, not the whole record: this city is already resolved, so
    // there is nothing for the server to write.
    value: city.providerPlaceId,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Two-step rather than window.confirm: a native dialog is untestable, and
  // this puts the warning in the page where the thing being deleted is.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await updateMomentAction({
      momentId,
      caption: draftCaption.trim().length > 0 ? draftCaption.trim() : null,
      pinLat: draftPin?.lat ?? null,
      pinLng: draftPin?.lng ?? null,
      city: draftCity.value,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    // The page above is a server component, so the new values only appear once
    // its data is fetched again.
    router.refresh();
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);

    const result = await deleteMomentAction(momentId);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push(result.data.cityId ? `/places/${result.data.cityId}` : "/places");
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSave}>
      <Field id={captionId} label="Caption" hint="Optional.">
        <Textarea
          id={captionId}
          value={draftCaption}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setDraftCaption(event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <CityAutocomplete
          label="City"
          onSelect={(result) =>
            setDraftCity({
              label: result.displayName,
              center: { lat: result.lat, lng: result.lng },
              value: result,
            })
          }
        />
        <p className="text-muted text-sm" aria-live="polite">
          Filed under <strong className="text-foreground">{draftCity.label}</strong>.
        </p>
      </div>

      <PinField
        value={draftPin}
        onChange={setDraftPin}
        suggested={draftPin ?? draftCity.center}
        disabled={busy}
      />

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-muted text-sm">
          Saved.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>

        {confirmingDelete ? (
          <>
            <span className="text-muted text-sm">
              This deletes the photo too, and cannot be undone.
            </span>
            <Button variant="danger" disabled={busy} onClick={handleDelete}>
              Delete for good
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            className="text-danger ml-auto"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

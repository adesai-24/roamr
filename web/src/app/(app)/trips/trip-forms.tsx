"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createTrip, deleteTrip, setMomentTrip } from "@/lib/trips/actions";
import type { AssignableMoment } from "@/lib/trips/types";

export function CreateTripForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createTrip(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.push(`/trips/${result.data.id}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="lg">
        New trip
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="border-border bg-surface rounded-card flex flex-col gap-4 border p-4"
    >
      <Field id="name" label="Trip name" hint="Whatever you call it. “July 4th”, “Pinnacles”.">
        <Input
          id="name"
          name="name"
          required
          maxLength={100}
          autoFocus
          placeholder="July 4th trip"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="startsOn" label="Start" hint="Optional">
          <Input id="startsOn" name="startsOn" type="date" />
        </Field>
        <Field id="endsOn" label="End" hint="Optional">
          <Input id="endsOn" name="endsOn" type="date" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create trip"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeleteTripButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Delete trip
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface rounded-card flex flex-col gap-3 border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Delete “{tripName}”?</p>
        {/* Stated plainly because "delete trip" reads like it might take the
            photos with it. The column is `on delete set null`, so it does not. */}
        <p className="text-muted text-sm">
          The moments in it stay in your collection. Only the grouping goes away.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteTrip(tripId);
              if (result.ok) router.push("/trips");
            })
          }
        >
          {pending ? "Deleting…" : "Delete"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

/** Assigning moments to a trip. */
export function AssignMomentsList({
  tripId,
  moments,
}: {
  tripId: string;
  moments: AssignableMoment[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(moment: AssignableMoment) {
    setBusyId(moment.id);
    setError(null);
    const nextTripId = moment.tripId === tripId ? null : tripId;
    const result = await setMomentTrip(moment.id, nextTripId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (moments.length === 0) {
    return (
      <p className="text-muted text-sm">
        You have no moments yet. Add a photo and it will show up here to group.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {moments.map((moment) => {
          const inThisTrip = moment.tripId === tripId;
          const inAnotherTrip = moment.tripId !== null && !inThisTrip;
          return (
            <li key={moment.id}>
              <button
                type="button"
                onClick={() => toggle(moment)}
                disabled={busyId === moment.id}
                aria-pressed={inThisTrip}
                className={[
                  "border-border rounded-card flex min-h-11 w-full items-center gap-3 border p-2 text-left",
                  inThisTrip ? "border-accent bg-surface" : "bg-surface",
                ].join(" ")}
              >
                <MomentPhoto
                  url={moment.photoUrl}
                  alt=""
                  width={1}
                  height={1}
                  className="size-12 shrink-0 rounded object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{moment.caption || moment.cityName}</span>
                  <span className="text-muted truncate text-xs">
                    {moment.cityName}
                    {inAnotherTrip && " · already in another trip"}
                  </span>
                </span>
                <span className="text-muted shrink-0 text-xs">
                  {busyId === moment.id ? "…" : inThisTrip ? "Remove" : "Add"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

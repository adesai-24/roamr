"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMoment } from "@/lib/actions/moments";
import { CITY_CATALOG } from "@/lib/cities-catalog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface Friend {
  id: string;
  username: string;
}

interface Trip {
  id: string;
  name: string;
}

export function AddMomentForm({ friends, trips }: { friends: Friend[]; trips: Trip[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await createMoment(formData);
          if (result?.error) setError(result.error);
          else router.push("/feed");
        });
      }}
    >
      <div>
        <Label htmlFor="city">City</Label>
        <select
          id="city"
          name="city"
          required
          className="rounded-card border-border bg-surface w-full border px-3 py-2 text-sm"
        >
          <option value="">Pick a city...</option>
          {CITY_CATALOG.map((city) => (
            <option key={`${city.name}-${city.country}`} value={JSON.stringify(city)}>
              {city.name}
              {city.region ? `, ${city.region}` : ""} · {city.country}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="photo">Photo</Label>
        <Input id="photo" name="photo" type="file" accept="image/*" required />
      </div>

      <div>
        <Label htmlFor="caption">Caption (optional)</Label>
        <Input id="caption" name="caption" type="text" maxLength={280} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pinLat">Pin latitude (optional)</Label>
          <Input id="pinLat" name="pinLat" type="number" step="any" />
        </div>
        <div>
          <Label htmlFor="pinLng">Pin longitude (optional)</Label>
          <Input id="pinLng" name="pinLng" type="number" step="any" />
        </div>
      </div>

      <div>
        <Label htmlFor="tripId">Trip (optional)</Label>
        <select
          id="tripId"
          name="tripId"
          className="rounded-card border-border bg-surface w-full border px-3 py-2 text-sm"
        >
          <option value="">No trip</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
      </div>

      {friends.length > 0 && (
        <div>
          <Label>Tag friends who were there (optional)</Label>
          <div className="flex flex-wrap gap-3">
            {friends.map((friend) => (
              <label key={friend.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="participantIds" value={friend.id} />@{friend.username}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Posting..." : "Post moment"}
      </Button>
    </form>
  );
}

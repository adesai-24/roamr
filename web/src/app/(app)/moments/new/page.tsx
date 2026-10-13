import type { Metadata } from "next";
import { NewMomentForm } from "./new-moment-form";

export const metadata: Metadata = {
  title: "New moment · roamr",
};

export default function NewMomentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add a moment</h1>
        <p className="text-muted text-sm">
          A photo lands in your collection for the city it came from. Everything else is optional.
        </p>
      </div>

      <NewMomentForm />
    </div>
  );
}

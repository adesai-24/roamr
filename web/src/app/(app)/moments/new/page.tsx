import type { Metadata } from "next";
import { NewMomentForm } from "./new-moment-form";
import styles from "../../app.module.css";
import { clientEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "New moment · roamr",
};

export default function NewMomentPage() {
  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Add a moment</h1>
          <p className="text-muted text-sm">
            Pick a photo and its city. Add a caption or pin if you like.
          </p>
        </div>
      </div>

      <NewMomentForm googlePhotosClientId={clientEnv().NEXT_PUBLIC_GOOGLE_PHOTOS_CLIENT_ID} />
    </div>
  );
}

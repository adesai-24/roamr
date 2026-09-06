import { cn } from "@/lib/utils";

export function fieldHintId(id: string): string {
  return `${id}-hint`;
}

export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/**
 * The `aria-describedby` value for a control inside a Field.
 *
 * Callers wire this onto the control themselves rather than Field cloning its
 * child: `useId` would force Field to be a client component, and cloneElement
 * does not survive the server/client boundary. An explicit id is the version
 * that works from anywhere, and it is one prop.
 */
export function fieldDescribedBy(
  id: string,
  { hint, error }: { hint?: unknown; error?: unknown },
): string | undefined {
  const ids = [error ? fieldErrorId(id) : null, hint ? fieldHintId(id) : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export interface FieldProps {
  /** Must match the `id` of the control rendered as `children`. */
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-muted ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint ? (
        <p id={fieldHintId(id)} className="text-muted text-sm">
          {hint}
        </p>
      ) : null}

      {/*
        role="alert" rather than a plain paragraph: a validation message that
        appears after a failed submit is only useful if it is announced, and by
        then focus has usually moved away from the control.
      */}
      {error ? (
        <p id={fieldErrorId(id)} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

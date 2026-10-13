import { cn } from "@/lib/utils";

/** `text-base` is load-bearing. */
export const inputStyles =
  "min-h-11 w-full rounded-card border border-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 aria-[invalid=true]:border-danger";

export type InputProps = React.ComponentPropsWithRef<"input">;

export function Input({ className, ...props }: InputProps) {
  return <input className={cn(inputStyles, className)} {...props} />;
}

export type TextareaProps = React.ComponentPropsWithRef<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(inputStyles, "min-h-24 resize-y", className)} {...props} />;
}

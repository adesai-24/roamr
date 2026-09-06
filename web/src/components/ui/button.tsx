import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "rounded-card inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-foreground hover:opacity-90",
        variant === "secondary" && "bg-surface-sunken text-foreground hover:opacity-80",
        variant === "danger" && "bg-danger text-accent-foreground hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

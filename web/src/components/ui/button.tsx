import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE_STYLES =
  "inline-flex select-none items-center justify-center gap-2 rounded-card border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "border-oak/30 bg-surface text-foreground hover:bg-oak-soft/40",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-surface-sunken",
  // text-background rather than a literal white.
  danger: "border-transparent bg-danger text-background hover:bg-danger/90",
};

/** Every size clears 44px of height. */
const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3",
  md: "min-h-11 px-4",
  lg: "min-h-12 px-5 text-base",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** The class string on its own. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth,
}: ButtonStyleOptions = {}) {
  return cn(BASE_STYLES, VARIANT_STYLES[variant], SIZE_STYLES[size], fullWidth && "w-full");
}

export type ButtonProps = React.ComponentPropsWithRef<"button"> & ButtonStyleOptions;

export function Button({ className, variant, size, fullWidth, type, ...props }: ButtonProps) {
  return (
    <button
      // Defaulting to "button" means a button dropped into a form cannot submit it by accident.
      type={type ?? "button"}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}

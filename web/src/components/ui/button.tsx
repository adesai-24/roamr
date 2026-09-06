import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE_STYLES =
  "inline-flex select-none items-center justify-center gap-2 rounded-card border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "border-border bg-surface text-foreground hover:bg-surface-sunken",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-surface-sunken",
  // text-background rather than a literal white: the danger colour flips from a
  // dark red to a light salmon between themes, and only the background token
  // stays readable against both.
  danger: "border-transparent bg-danger text-background hover:bg-danger/90",
};

/**
 * Every size clears 44px of height. The README's platform argument is that
 * people open this on a phone, so a "small" button is small in width and
 * padding, never in the area a thumb has to hit.
 */
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

/**
 * The class string on its own, for the cases where the thing being styled has
 * to be a `<Link>` or an `<a>`. A button that navigates is a link, and swapping
 * the element for a real anchor is cheaper than reimplementing anchor behaviour
 * on a button.
 */
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
      // Defaulting to "button" means a button dropped into a form cannot submit
      // it by accident; the ones that should say so explicitly.
      type={type ?? "button"}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}

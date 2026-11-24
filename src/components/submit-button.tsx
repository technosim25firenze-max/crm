"use client";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui";

export function SubmitButton({ children, variant = "primary", size = "md" }: { children: React.ReactNode; variant?: ButtonVariant; size?: "md" | "sm" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size={size} disabled={pending}>{pending ? "…" : children}</Button>;
}

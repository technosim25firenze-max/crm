"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { X } from "lucide-react";
import { buttonClass, type ButtonVariant } from "./index";
import { t } from "@/lib/i18n/it";

/** Finestra modale con pulsante di apertura. `children` può essere una funzione per chiudere la finestra dopo il salvataggio. */
export function Modal({ trigger, title, description, variant = "primary", size = "md", triggerClassName, menu = false, children }: {
  triggerClassName?: string; menu?: boolean; trigger: React.ReactNode; title: string; description?: string; variant?: ButtonVariant; size?: "md" | "sm";
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={menu ? buttonClass("ghost", "md", `h-9 w-full justify-start rounded-md px-3 ${variant === "danger" ? "text-brand hover:text-brand" : "text-foreground"}`) : buttonClass(variant, size, triggerClassName)}>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] [animation:fade-in_var(--duration)_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal border border-border bg-surface p-7 shadow-pop [animation:pop-in_220ms_var(--ease-out)]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label={t.common.close} className="rounded-md p-1 text-muted hover:bg-background"><X size={18} /></Dialog.Close>
          </div>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

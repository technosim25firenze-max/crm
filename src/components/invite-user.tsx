"use client";
import { useActionState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { inviteUser } from "@/lib/actions/settings";
import { ROLES } from "@/lib/permissions";
import { t } from "@/lib/i18n/it";

function Form() {
  const [state, action] = useActionState(inviteUser, null);
  return (
    <form action={action} className="space-y-4">
      <Field label={t.settings.inviteEmail} error={state?.fieldErrors?.email}><Input name="email" type="email" required autoFocus /></Field>
      <Field label={t.settings.role}>
        <Select name="role" defaultValue="staff">{ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}</Select>
      </Field>
      {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">{t.settings.inviteSent}</p>}
      <div className="flex justify-end"><SubmitButton>{t.settings.invite}</SubmitButton></div>
    </form>
  );
}

export const InviteUser = () => <Modal trigger={t.settings.invite} title={t.settings.invite}><Form /></Modal>;

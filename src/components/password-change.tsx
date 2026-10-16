"use client";

import { useRef, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { changePassword } from "@/app/actions";
import { useUpdateGuard } from "./app-runtime";

export function PasswordChangeForm({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useUpdateGuard(expanded || busy);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || disabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    };
    setError("");
    setSuccess("");
    if (input.newPassword !== input.confirmPassword) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    if (input.newPassword === input.currentPassword) {
      setError("Escolha uma senha diferente da atual.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const result = await changePassword(input);
      if (!result.ok) setError(result.error);
      else {
        form.reset();
        setExpanded(false);
        setSuccess(result.value);
      }
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Segurança da conta</h3>
      <p>Altere a senha que você usa para entrar na sua conta.</p>
      {expanded ? (
        <form onSubmit={submit}>
          <label>
            Senha atual
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              placeholder="Digite sua senha atual"
              minLength={8}
              maxLength={128}
              required
              disabled={busy || disabled}
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              placeholder="De 8 a 128 caracteres"
              minLength={8}
              maxLength={128}
              required
              disabled={busy || disabled}
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Digite a nova senha novamente"
              minLength={8}
              maxLength={128}
              required
              disabled={busy || disabled}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || disabled}
              onClick={() => {
                setExpanded(false);
                setError("");
              }}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy || disabled}>
              {busy ? "Alterando…" : "Salvar nova senha"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="button secondary full"
          disabled={disabled}
          onClick={() => {
            setSuccess("");
            setExpanded(true);
          }}
        >
          <LockKeyhole size={16} /> Alterar senha
        </button>
      )}
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
    </section>
  );
}

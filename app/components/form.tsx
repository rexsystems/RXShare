import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";

/*
 * Shared form primitives. Flat surfaces, one radius (6px), one accent.
 * Control borders use --control-border so fields meet 3:1 against the panel.
 */

const controlBase =
  "block w-full min-h-11 rounded-md border border-[var(--control-border)] bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground/80 transition-colors hover:border-zinc-400 " +
  "disabled:opacity-60 aria-[invalid=true]:border-red-400";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground " +
  "transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-60";

export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--control-border)] px-5 text-sm font-medium text-foreground " +
  "transition-colors hover:bg-white/5 disabled:opacity-60";

export const linkClass = "text-primary underline underline-offset-2 hover:text-[var(--primary-hover)]";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-foreground">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "value"> {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  fieldId?: string;
}

export function TextField({ label, value, onChange, hint, error, optional, fieldId, className, ...rest }: TextFieldProps) {
  const auto = useId();
  const id = fieldId || auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, className)}
        {...rest}
      />
    </FieldShell>
  );
}

export function PasswordField({ label, value, onChange, hint, error, optional, fieldId, ...rest }: TextFieldProps) {
  const auto = useId();
  const id = fieldId || auto;
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(controlBase, "pr-16")}
          autoComplete="off"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </FieldShell>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
  fieldId?: string;
}

export function SelectField({ label, value, onChange, options, hint, fieldId }: SelectFieldProps) {
  const auto = useId();
  const id = fieldId || auto;
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(id, hint)}
        className={controlBase}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string }[];
}

/** Native radios in a bordered row: the selected state is the radio itself plus the border, never color alone. */
export function ChoiceGroup<T extends string>({ legend, name, value, onChange, options }: ChoiceGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-start gap-3 rounded-md border border-[var(--control-border)] p-4 transition-colors hover:border-zinc-400 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span className="block">
            <span className="block text-sm font-medium text-foreground">{o.label}</span>
            {o.description && <span className="mt-0.5 block text-sm text-muted-foreground">{o.description}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface CheckFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function CheckField({ label, description, checked, onChange }: CheckFieldProps) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-[var(--control-border)] p-3 transition-colors hover:border-zinc-400">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
      <span className="block">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

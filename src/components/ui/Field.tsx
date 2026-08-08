'use client';

import { forwardRef } from 'react';

interface FieldWrapperProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FieldWrapper({ label, error, required, children }: FieldWrapperProps) {
  return (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; required?: boolean }>(
  ({ label, error, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} required={required}>
      <input ref={ref} className={'input ' + (className ?? '')} {...props} />
    </FieldWrapper>
  ),
);
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; required?: boolean }>(
  ({ label, error, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} required={required}>
      <textarea ref={ref} className={'input min-h-[80px] ' + (className ?? '')} {...props} />
    </FieldWrapper>
  ),
);
TextArea.displayName = 'TextArea';

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; required?: boolean; options: { value: string; label: string }[]; placeholder?: string }
>(({ label, error, required, className, options, placeholder, ...props }, ref) => (
  <FieldWrapper label={label} error={error} required={required}>
    <select ref={ref} className={'input ' + (className ?? '')} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </FieldWrapper>
));
Select.displayName = 'Select';

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" {...props} />
      {label}
    </label>
  );
}

// 介面元件：以 Radix UI 為基礎、shadcn/ui 的寫法，樣式用 Tailwind。
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronDown, X } from 'lucide-react';
import { MARK_PATH } from '@/lib/brand';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---------- Button ----------
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-surface hover:bg-ink/90',
        marker: 'bg-marker text-[#0f1733] hover:bg-marker/85',
        outline: 'border border-line bg-surface text-ink hover:border-ink-3',
        ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink',
        danger: 'border border-line bg-surface text-stop hover:border-stop/50 hover:bg-stop-soft',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-9 rounded-md px-4 text-sm',
        lg: 'h-11 rounded-lg px-5 text-[15px]',
        icon: 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';

// ---------- Inputs ----------
const fieldBase =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none focus:ring-3 focus:ring-marker/40';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-9', className)} {...p} />
));
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-20 resize-y py-2 leading-relaxed', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

// ---------- Select ----------
export function Select({
  value,
  onValueChange,
  options,
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: React.ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-md border border-line bg-surface text-ink hover:border-ink-3 focus:outline-none focus-visible:ring-3 focus-visible:ring-marker/40 cursor-pointer',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 text-ink-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-line bg-surface p-1 shadow-[0_8px_24px_-8px_rgba(15,23,51,.25)]">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center rounded-sm py-1.5 pl-7 pr-3 text-sm text-ink outline-none data-highlighted:bg-ink/6"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ---------- Switch ----------
export function Switch(props: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-line transition-colors data-[state=checked]:bg-ink',
        props.className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[17px]" />
    </SwitchPrimitive.Root>
  );
}

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-60 rounded-md bg-[#0f1733] px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-lg">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------- Dialog（確認視窗） ----------
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0f1733]/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-2xl">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1.5 text-sm text-ink-2">{description}</DialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost">取消</Button>
            </DialogPrimitive.Close>
            <Button
              variant={danger ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 text-ink-3 hover:text-ink" aria-label="關閉">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------- 品牌標誌：黃底閃電 ----------
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="#FFC93C" />
      <path d={MARK_PATH} fill="#0F1733" stroke="#0F1733" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

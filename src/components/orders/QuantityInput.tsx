import './QuantityInput.css';

interface Props {
  label: string;
  value: string;
  max?: number;
  /** 0.1 for an item booked in tenths; whole units by default. */
  step?: number;
  onChange: (value: string) => void;
}

export function QuantityInput({ label, value, max, step = 1, onChange }: Props) {
  return (
    <input
      className="order-quantity-input"
      type="number"
      min="0"
      max={max}
      step={step}
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

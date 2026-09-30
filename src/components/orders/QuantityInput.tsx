import './QuantityInput.css';

interface Props {
  label: string;
  value: string;
  max?: number;
  onChange: (value: string) => void;
}

export function QuantityInput({ label, value, max, onChange }: Props) {
  return (
    <input
      className="order-quantity-input"
      type="number"
      min="0"
      max={max}
      step="1"
      inputMode="numeric"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

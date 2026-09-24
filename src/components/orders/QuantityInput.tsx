import './QuantityInput.css';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function QuantityInput({ label, value, onChange }: Props) {
  return (
    <input
      className="order-quantity-input"
      type="number"
      min="0"
      step="1"
      inputMode="numeric"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

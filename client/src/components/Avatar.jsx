import { initials } from '../utils/files';

const PALETTE = [['#8A9A86', '#C9D6C4'], ['#E8A0BF', '#F6D3E3'], ['#7F9680', '#BCD0B9'], ['#D98BAF', '#F1C3D6']];

export default function Avatar({ name, size = 44 }) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [a, b] = PALETTE[hash % PALETTE.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

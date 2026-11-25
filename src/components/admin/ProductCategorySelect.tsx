type Props = { value: string; onChange: (value: string) => void; existing?: string[]; className?: string };
const defaults = ["Avena Cubana", "Sevillana", "Kumis", "Yogurt frutal", "Yogurt griego", "Acompañantes", "Otros"];
export default function ProductCategorySelect({ value, onChange, existing = [], className = "" }: Props) {
  const options = [...new Set([...defaults, ...existing, value].filter(v => v && v.toLowerCase() !== "por configurar"))].sort((a,b) => a.localeCompare(b,"es"));
  return <select required value={value.toLowerCase() === "por configurar" ? "" : value} onChange={e => onChange(e.target.value)} className={className}>
    <option value="">Selecciona una categoría</option>{options.map(option => <option key={option} value={option}>{option}</option>)}
  </select>;
}

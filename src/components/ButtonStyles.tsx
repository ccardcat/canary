import {ArrowRight, Check} from "lucide-react";
import {buttonStyles, type ButtonStyle} from "../services/buttonStyles";
import GlassSelect from "./GlassSelect";
import {useVisualAppearance} from "./VisualAppearance";

const names: Record<ButtonStyle, [string, string]> = {
  classic: ["Классика", "Classic"],
  capsule: ["Капсулы", "Capsules"],
  frosted: ["Матовое стекло", "Frosted glass"],
  outline: ["Контур", "Outline"],
  retro: ["Ретро", "Retro"],
  neon: ["Неон", "Neon"],
};

export function ButtonStyles({russian}: {russian: boolean}) {
  const {value, update} = useVisualAppearance();
  const title = russian ? "Стиль кнопок" : "Button style";
  return <section className="button-style-section">
    <h3>{title}</h3>
    <div className="button-style-grid" role="group" aria-label={title}>
      {buttonStyles.map(buttonStyle => {
        const selected = value.buttonStyle === buttonStyle;
        return <button key={buttonStyle} type="button" className="button-style-option" aria-pressed={selected}
          onClick={() => update({buttonStyle})}>
          <span className="button-style-samples" data-button-style={buttonStyle} aria-hidden="true">
            <span className="button-look button-look-primary">{russian?"Играть":"Play"}</span>
            <span className={buttonStyle==="capsule"?"button-look button-look-glass":"button-look"}><ArrowRight size={13}/></span>
          </span>
          <strong>{names[buttonStyle][russian ? 0 : 1]}</strong>
          {selected && <Check size={16} className="button-style-check" aria-hidden="true"/>}
        </button>;
      })}
    </div>
    <label className="heading-font-control">{russian?"Иконки навигации":"Navigation icons"}
      <GlassSelect aria-label={russian?"Иконки навигации":"Navigation icons"} value={value.iconStyle}
        onChange={event=>update({iconStyle:event.target.value as typeof value.iconStyle})}>
        <option value="follow">{russian?"По стилю кнопок":"Follow button style"}</option>
        <option value="glass">{russian?"Стеклянные":"Glass"}</option>
        <option value="plain">{russian?"Контурные":"Outline"}</option>
      </GlassSelect>
    </label>
  </section>;
}

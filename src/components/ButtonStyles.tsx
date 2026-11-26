import {ArrowRight, Check} from "lucide-react";
import {buttonStyles, type ButtonStyle} from "../services/buttonStyles";
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
    <p className="settings-note">{russian ? "Выбери форму и отделку кнопок. Стиль можно сочетать с любой темой и материалом." : "Choose a shape and finish for the controls. Pair it with any theme or material."}</p>
    <div className="button-style-grid" role="group" aria-label={title}>
      {buttonStyles.map(buttonStyle => {
        const selected = value.buttonStyle === buttonStyle;
        return <button key={buttonStyle} type="button" className="button-style-option" aria-pressed={selected}
          onClick={() => update({buttonStyle})}>
          <span className="button-style-samples" data-button-style={buttonStyle} aria-hidden="true">
            <span className="button-look button-look-primary">{russian?"Играть":"Play"}</span>
            <span className="button-look"><ArrowRight size={13}/></span>
          </span>
          <strong>{names[buttonStyle][russian ? 0 : 1]}</strong>
          {selected && <Check size={16} className="button-style-check" aria-hidden="true"/>}
        </button>;
      })}
    </div>
  </section>;
}

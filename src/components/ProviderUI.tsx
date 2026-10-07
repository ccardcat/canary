import { Flame } from "lucide-react";
import GlassSelect from "./GlassSelect";
import { providers, providerCopy, type Provider } from "../services/providers";
import { EmptyState } from "./EmptyState";

export function ProviderSelect({ value, onChange, russian }: {
  value: Provider; onChange: (provider: Provider) => void; russian: boolean;
}) {
  return <GlassSelect className="provider-badge" aria-label={russian ? "Источник проектов" : "Provider"}
    value={value} onChange={e => onChange(e.target.value as Provider)}>
    {Object.entries(providers).map(([id, provider]) => <option key={id} value={id}>
      {provider.name}{provider.status === "comingSoon" ? (russian ? " · скоро" : " · coming soon") : ""}
    </option>)}
  </GlassSelect>;
}

export function ProviderUnavailable({ russian }: { russian: boolean }) {
  const copy = providerCopy[russian ? "ru" : "en"];
  return <EmptyState icon={Flame} title={copy.title} description={copy.description} />;
}

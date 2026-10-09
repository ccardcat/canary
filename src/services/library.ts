import type {RuntimeInstance} from "./backend";
import type {Project} from "./modrinth";
import type {Provider} from "./providers";

interface InstallationState {
  native: boolean;
  instances?: readonly Pick<RuntimeInstance, "project_id" | "provider">[];
  cachedProjects: readonly Pick<Project, "project_id" | "provider">[];
}

export function isProjectInstalled(projectId: string, provider: Provider, state: InstallationState): boolean {
  // The desktop snapshot owns installation state. The legacy browser cache can
  // outlive a deleted instance and must never block a native reinstall.
  if (state.native) {
    return state.instances?.some(instance => instance.project_id === projectId && instance.provider === provider) ?? false;
  }
  return state.cachedProjects.some(project => project.project_id === projectId && (project.provider || "modrinth") === provider);
}

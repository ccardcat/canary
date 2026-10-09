import {test, expect} from "@playwright/test";
import {isProjectInstalled} from "../src/services/library";

const cachedProjects = [{project_id: "pack", provider: "modrinth" as const}];
const instance = {project_id: "pack", provider: "modrinth"};

test("deleted native packs ignore stale browser records, including before the first snapshot", () => {
  expect(isProjectInstalled("pack", "modrinth", {native: true, instances: [], cachedProjects})).toBe(false);
  expect(isProjectInstalled("pack", "modrinth", {native: true, cachedProjects})).toBe(false);
});

test("install, delete and reinstall follow the refreshed native library", () => {
  const state = {native: true, instances: [instance], cachedProjects};
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(true);
  state.instances = [];
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(false);
  state.instances = [{...instance}];
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(true);
});

test("another installed version keeps the badge until the last instance is removed", () => {
  const state = {native: true, instances: [{...instance, version_id: "v1"}, {...instance, version_id: "v2"}], cachedProjects};
  state.instances.shift();
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(true);
  state.instances.shift();
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(false);
});

test("provider identity prevents one catalog from marking another provider's pack installed", () => {
  const state = {native: true, instances: [{...instance, provider: "curseforge"}], cachedProjects};
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(false);
  expect(isProjectInstalled("pack", "curseforge", state)).toBe(true);
  state.instances = [];
  expect(isProjectInstalled("pack", "curseforge", state)).toBe(false);
});

test("a temporarily unavailable drive does not erase a real installation", () => {
  const unavailable = {...instance, status: "unavailable"};
  expect(isProjectInstalled("pack", "modrinth", {native: true, instances: [unavailable], cachedProjects: []})).toBe(true);
});

test("browser previews retain cached projects and legacy records default to Modrinth", () => {
  const state = {native: false, instances: [], cachedProjects: [{project_id: "pack"}]};
  expect(isProjectInstalled("pack", "modrinth", state)).toBe(true);
  expect(isProjectInstalled("pack", "curseforge", state)).toBe(false);
});

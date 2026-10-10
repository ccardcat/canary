import type {AmbientEffect} from "./backgrounds";

export function resolveAmbient(selected:AmbientEffect|"automatic",appEffect:AmbientEffect="off",sidebarEffect:AmbientEffect="off"):AmbientEffect {
 if(selected!=="automatic")return selected;
 // Every wallpaper, including imports, gets an effect in Automatic mode.
 return appEffect!=="off"?appEffect:sidebarEffect!=="off"?sidebarEffect:"snow";
}

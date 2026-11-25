export const buttonStyles = ["classic", "capsule", "frosted", "outline", "retro", "neon"] as const;
export type ButtonStyle = typeof buttonStyles[number];

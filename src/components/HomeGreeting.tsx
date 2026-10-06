import { useEffect, useState } from "react";

export type TimeOfDay = "morning" | "day" | "evening" | "night";
export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}
export function useTimeOfDay() {
  const [period, setPeriod] = useState(() => timeOfDay(new Date().getHours()));
  useEffect(() => {
    const sync = () => setPeriod(timeOfDay(new Date().getHours()));
    const timer = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return period;
}
const greetings = {
  ru: {
    morning: "Доброе утро",
    day: "Добрый день",
    evening: "Добрый вечер",
    night: "Доброй ночи",
  },
  en: {
    morning: "Good morning",
    day: "Good afternoon",
    evening: "Good evening",
    night: "Good night",
  },
};
export default function HomeGreeting({
  russian,
  username,
}: {
  russian: boolean;
  username?: string;
}) {
  const period = useTimeOfDay();
  const sun = period === "morning" || period === "day";
  const name = username?.trim();
  return (
    <h1 className="home-greeting" data-period={period}>
      <span
        className={`greeting-icon ${sun ? "sun" : "moon"}`}
        aria-hidden="true"
      >
        {sun ? (
          <svg viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="7" fill="currentColor" />
            <circle cx="16" cy="16" r="3.5" fill="white" opacity=".17" />
            <path
              d="M18 3v4M18 29v4M3 18h4M29 18h4M7.4 7.4l2.8 2.8m15.6 15.6 2.8 2.8M7.4 28.6l2.8-2.8m15.6-15.6 2.8-2.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 36 36" fill="none">
            <path
              d="M26.8 24.5A11.7 11.7 0 0 1 14 5.8a12.2 12.2 0 1 0 12.8 18.7Z"
              fill="currentColor"
            />
            <path
              d="M8.5 23a10 10 0 0 0 12 6"
              stroke="white"
              opacity=".25"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle cx="28" cy="8" r="1.2" fill="currentColor" opacity=".6" />
            <circle cx="31" cy="16" r=".8" fill="currentColor" opacity=".4" />
          </svg>
        )}
      </span>
      <span>
        {greetings[russian ? "ru" : "en"][period]}
        {name && (
          <>
            , <strong>{name}</strong>
          </>
        )}
      </span>
    </h1>
  );
}

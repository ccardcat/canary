export const activityMessages = {
  en: {
    activity: "Activity",
    download: "Download",
    install: "Installation",
    update: "Update",
    repair: "Repair",
    launch: "Launching Minecraft",
    cancel: "Cancel",
    cancelling: "Cancelling…",
    finalizing: "Finishing…",
    completed: "Completed",
    cancelled: "Cancelled",
    failed: "Failed",
    details: "Details",
    files: "files",
    preparing: "Preparing",
    staging: "Preparing a safe copy",
    downloading: "Downloading files",
    verifying: "Verifying files",
    applying: "Applying files",
    java: "Preparing Java",
    loader: "Preparing loader",
    empty: "No active downloads",
    recent: "Recent activity",
  },
  ru: {
    activity: "Активность",
    download: "Загрузка",
    install: "Установка",
    update: "Обновление",
    repair: "Восстановление",
    launch: "Запускаем Minecraft",
    cancel: "Отменить",
    cancelling: "Отмена…",
    finalizing: "Завершение…",
    completed: "Готово",
    cancelled: "Отменено",
    failed: "Ошибка",
    details: "Подробнее",
    files: "файлов",
    preparing: "Подготовка",
    staging: "Подготовка безопасной копии",
    downloading: "Загрузка файлов",
    verifying: "Проверка файлов",
    applying: "Применение файлов",
    java: "Подготовка Java",
    loader: "Подготовка загрузчика",
    empty: "Нет активных загрузок",
    recent: "Недавняя активность",
  },
};
export type ActivityText = typeof activityMessages.en;
export function stageLabel(stage: string, text: ActivityText): string {
  if (/finalize|metadata|content_apply/.test(stage)) return text.finalizing;
  if (/overrides/.test(stage)) return text.applying;
  if (/hash|verify/.test(stage)) return text.verifying;
  if (stage === "staging") return text.staging;
  if (/java/.test(stage)) return text.java;
  if (/loader/.test(stage)) return text.loader;
  if (/launch/.test(stage)) return text.launch;
  if (/download|libraries|assets|mods|content_pack|mrpack/.test(stage))
    return text.downloading;
  return text.preparing;
}

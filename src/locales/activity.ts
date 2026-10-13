export const activityMessages = {
  en: {
    activity: "Activity", copy:"Copying instance", export:"Exporting modpack", backup:"World backup", import:"Importing instance", copying:"Copying files",archiving:"Creating archive",
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
    activity: "Активность", copy:"Копирование экземпляра", export:"Экспорт сборки", backup:"Копия миров", import:"Перенос экземпляра", copying:"Копирование файлов",archiving:"Создание архива",
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
  if (stage === "copying") return text.copying;
  if (stage === "archiving") return text.archiving;
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

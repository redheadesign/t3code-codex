# T3 Codex

T3 Codex — пользовательская сборка [T3 Code](https://github.com/pingdotgg/t3code) с боковой панелью в стиле Codex, доской задач и канвасом для дизайна. Приложение работает с твоими аккаунтами Codex, Claude Code и других провайдеров.

## Установка

**[Скачать T3 Code (Beta) для Windows x64](https://github.com/redheadesign/t3code-codex/releases/latest)**

В выпуске выбери установщик `.exe`. Обновление устанавливается поверх предыдущей Beta. Если в [списке выпусков](https://github.com/redheadesign/t3code-codex/releases) есть сборка для macOS Apple Silicon, скачай `.dmg` и перенеси приложение в Applications.

Для первого запуска войди хотя бы в одного провайдера. См. инструкции для [Codex](./docs/user/providers-codex.md) и [Claude Code](./docs/user/providers-claude.md).

## Документация

- [Чаты и проекты](./docs/user/thread-sidebar.md)
- [Настройки проекта](./docs/user/project-settings.md)
- [Горячие клавиши](./docs/user/keybindings.md)
- [Удалённый доступ](./docs/user/remote-access.md)
- [Подключение внешних агентов через MCP](./docs/user/outside-agents.md)
- [Все руководства](./docs)

## Сборка из исходников

Открой [Build personal desktop releases](https://github.com/redheadesign/t3code-codex/actions/workflows/personal-desktop.yml), нажми **Run workflow**, укажи версию и выбери Windows, macOS или обе платформы. GitHub Actions проверяет запуск приложения на отдельном профиле и сохраняет установщики в артефактах. Проверенные установщики публикуются отдельно в Releases.

Для локальной разработки см. [руководство разработчика](./docs/operations/development.md).

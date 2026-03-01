# Runbook: Git доступ (без пароля)

## Вариант A: SSH (рекомендуется)
1) Создать ключ на сервере: `ssh-keygen -t ed25519 -C "www.stason4ik@gmail.com"`
2) Добавить публичный ключ в GitHub/GitLab: Settings → SSH keys.
3) Проверка: `ssh -T git@github.com`

Плюсы: безопасно, удобно, без токенов.

## Вариант B: PAT (Personal Access Token)
1) Создать токен в Git провайдере (GitHub: Settings → Developer settings → Personal access tokens).
2) Права: минимум **repo** (и при необходимости workflow/packages).
3) Использовать токен вместо пароля при git push/pull.

Примечание: классические пароли часто не работают для git over https.

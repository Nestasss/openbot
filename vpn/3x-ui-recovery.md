# 3x-ui / Xray — Recovery cheat sheet (securitybots)

## Быстрые проверки

```bash
# кто слушает порты
sudo ss -ltnp | egrep ':(80|443|2053|10000)\s' || true

# контейнер 3x-ui
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

# логи (последние строки)
sudo docker logs --tail=200 3x-ui
```

## Перезапуск сервисов

```bash
# nginx
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl restart nginx

# 3x-ui контейнер
sudo docker restart 3x-ui
```

## Полное пересоздание контейнера 3x-ui (данные сохраняются)

Данные панели лежат тут (bind-mount):

- `/root/.openclaw/workspace/docker/vpn/data`  →  `/etc/x-ui`

Команды:

```bash
# 1) удалить контейнер (данные останутся)
sudo docker rm -f 3x-ui

# 2) запустить заново
sudo docker run -d \
  --name 3x-ui \
  --restart unless-stopped \
  -p 127.0.0.1:2053:2053 \
  -p 127.0.0.1:10000:10000 \
  -v /root/.openclaw/workspace/docker/vpn/data:/etc/x-ui \
  -v /etc/localtime:/etc/localtime:ro \
  ghcr.io/mhsanaei/3x-ui:latest

# 3) проверить
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo docker logs --tail=80 3x-ui
sudo ss -ltnp | egrep ':(2053|10000)\s' || true
```

## Проверка nginx-конфига для доменов

```bash
sudo sed -n '1,220p' /etc/nginx/sites-enabled/securitybots-http.conf
sudo nginx -t
```

## Проверка HTTPS сертификатов Let’s Encrypt

```bash
sudo certbot certificates
sudo systemctl status certbot.timer --no-pager || true

# тестовое продление (ничего не ломает)
sudo certbot renew --dry-run
```

## Важные URL

- Панель: `https://panel.securitybots.ru` (проксируется на `127.0.0.1:2053`)
- VPN: `vpn.securitybots.ru:443`, WS path: `/vws` (проксируется на `127.0.0.1:10000`)

## Если VPN не коннектится (быстрая диагностика)

```bash
# проверка, что локальный порт inbound доступен
nc -vz 127.0.0.1 10000

# проверить, что nginx слушает 443
sudo ss -ltnp | egrep ':(443)\s' || true

# логи nginx
sudo tail -n 200 /var/log/nginx/error.log
```

# VPN setup notes

- Domains: panel.securitybots.ru, vpn.securitybots.ru
- Nginx config: /etc/nginx/sites-enabled/securitybots-http.conf
- 3x-ui data: /root/.openclaw/workspace/docker/vpn/data (bind-mounted to /etc/x-ui)
- Inbound tag: vless-ws-10000, ws path: /vws, TLS terminated at nginx

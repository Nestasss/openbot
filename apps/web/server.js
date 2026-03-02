const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
  <html><head><meta charset="utf-8"><title>notific messenger</title></head>
  <body>
    <h1>notific messenger</h1>
    <p>Web is up. API: <a href="https://api.notificbot.ru/health">/health</a></p>
  </body></html>`);
});

app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
  console.log('WEB listening on', process.env.PORT || 8080);
});

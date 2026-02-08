# IG-MASS-BOT

**USO APENAS COM CONSENTIMENTO (OPT-IN). SPAM OU USO ILEGAL = BAN PERMANENTE E VIOLA OS TERMOS DO INSTAGRAM.**

Bot de DMs em massa para Instagram, inspirado no KHAN-MD (WhatsApp) e projetado para uso ético: campanhas opt-in, atendimento ou notificações para usuários que autorizaram. Inclui suporte multi-conta (até 150), proxies dedicados, dashboard web, PM2 e deploy no Railway.

## Avisos éticos e legais
- Use somente em contas suas ou da sua empresa com autorização explícita dos destinatários.
- Enviar mensagens não solicitadas viola os Termos do Instagram e pode gerar ban permanente.
- Criação automática de contas é experimental e também viola os termos; prefira criar contas manualmente.

## Requisitos
- Node.js 18+
- npm ou yarn
- Proxies HTTP/SOCKS5 (1 por conta recomendado)
- Contas Instagram válidas (user:pass)

## Estrutura
```
src/
  index.js          # inicializa bots, warm-up, dashboard
  auth.js           # login, sessão, criação (experimental)
  massSender.js     # módulo .massdm com anti-ban
  proxyManager.js   # valida proxies e sticky/rotação
  server.js         # dashboard Express + EJS
  settings.js       # carrega env e arquivos
  utils/
    logger.js
    uaPool.js
    consentChecker.js
    downloader.js
sessions/           # sessões JSON por conta
logs/               # logs pino
lists/              # uploads de listas (targets adicionais)
proxies.txt         # lista de proxies (1 por linha)
accounts.txt        # lista de contas (username:password:email opcional)
targets.txt         # lista padrão de destinatários
Dockerfile
Procfile
app.json            # Railway/Heroku
ecosystem.config.js # PM2
.env.example
```

## Configuração
1. Clone o repositório:
```bash
git clone <repo-url> IG-MASS-BOT
cd IG-MASS-BOT
```
2. Crie `.env` a partir do exemplo:
```bash
cp .env.example .env
```
3. Edite `proxies.txt` (um proxy por linha, http://user:pass@ip:port) e `accounts.txt` (username:password:email opcional).
4. Instale dependências:
```bash
npm install
```

## Uso local
```bash
npm start        # roda dashboard em http://localhost:3000
# ou 24/7
pm2 start ecosystem.config.js --env production
```
- Acesse `/dashboard`, escolha o bot, selecione a lista (ou faça upload) e clique em **Iniciar**.
- Template suporta variáveis `{nome}`, `{username}`, `{link}` e spintax `{"oi|olá"}`.

## Parâmetros importantes (.env)
- `MAX_DM_PER_DAY` (padrão 60) — por conta.
- `DELAY_MIN`/`DELAY_MAX` (35–95s) — distribuição gaussiana.
- `HOURLY_ACTION_LIMIT` (padrão 30) — segurança por hora.
- `USE_PROXY_ROTATION` e `PROXY_ROTATION_INTERVAL` — troca de proxy a cada N DMs.
- `CHECK_ONLINE` — se true, só envia para usuários ativos.
- `CREATE_ON_START` — se `true`, tenta criar contas da lista (experimental, viola ToS; desativado por padrão).

## Proxies
- `PROXIES_FILE=./proxies.txt` (1 por linha). O ProxyManager valida todos na inicialização e atribui sticky 1:1 por conta. Se `USE_PROXY_ROTATION=true`, rotaciona a cada N DMs.

## Criação de contas (experimental)
- Lista em `accounts.txt` (user:pass:email). Limite `MAX_CREATIONS_PER_DAY` (padrão 5).
- **Aviso:** criação automática frequentemente falha por captcha/challenge e viola os termos. Recomendamos criar manualmente em browser antidetect.

## Anti-ban
- Delays randômicos + gaussiano.
- Limite diário e horário.
- Rotação de User-Agent (50+ UAs reais).
- Sticky proxy por conta, com rotação opcional.
- Consent checker: só envia para quem já interagiu (segue/seguido ou thread prévia).
- Action block detection: entra em cooldown 24–48h.
- Blacklist persistente para evitar reenvios.
- Warm-up: likes leves após login/criação e a cada 12h para manter a conta ativa.

## Features
- `.massdm` via dashboard.
- Auto-reply em DMs recebidas.
- Downloader de mídia (story/post) para anexar ou baixar.
- `.status` via `/api/status` (JSON com contas ativas, DMs enviadas, proxies).
- Suporte a mídia em DMs (foto com caption).
- Hot add: adicione novas contas sem reiniciar via formulário no dashboard.

## Deploy no Railway
1. Fork o repositório no GitHub.
2. Conecte o fork ao Railway.
3. Configure variáveis no dashboard Railway (ou `.env`): `PROXIES_FILE`, `ACCOUNTS_FILE`, `TARGETS_FILE`, `MAX_DM_PER_DAY`, `DELAY_MIN`, `DELAY_MAX`, `PORT`.
4. Deploy: `git push` dispara build; Railway iniciará `npm start` (Procfile incluso).
5. Monte volumes persistentes para `./sessions` e `./logs` para manter sessões.

## Docker
```bash
docker build -t ig-mass-bot .
docker run -p 3000:3000 --env-file .env \
  -v $(pwd)/sessions:/app/sessions \
  -v $(pwd)/logs:/app/logs ig-mass-bot
```

## Segurança
- Sessões ficam em `sessions/`. Proteja e não compartilhe.
- Monitore logs em `logs/<bot>.log`.
- Respeite consentimento e privacidade.

## Licença
Apache 2.0 — créditos ao projeto KHAN-MD como inspiração.

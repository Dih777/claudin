# Proxy Binance — laboratório de Grid

Resolve o CORS que travou a interface e abre a porta (com segurança) para os dados da sua conta.

## A ideia em uma frase

```
Navegador (sua interface)  →  ESTE proxy (seu PC)  →  Binance
```

O CORS é uma trava do navegador. O proxy é um servidor — servidor não tem CORS. Por isso ele consegue o que a página sozinha não consegue. E a chave secreta fica só no proxy, nunca no navegador.

## Passo a passo

1. Instale o Node.js (versão 18 ou superior).
2. Neste diretório, rode:
   ```
   npm init -y
   npm install express cors dotenv
   ```
3. Crie um arquivo chamado `.env` com:
   ```
   BINANCE_KEY=sua_chave_api
   BINANCE_SECRET=sua_chave_secreta
   PORT=8787
   ```
4. Suba o proxy:
   ```
   node server.js
   ```
5. Abra `index.html` no navegador (ou via Live Server / `npx serve .`).

## Endpoints disponíveis

| Rota | Auth | Descrição |
|------|------|-----------|
| `/price?symbol=0GUSDT` | Não | Preço ao vivo |
| `/ticker24h?symbol=0GUSDT` | Não | Variação 24h, high, low, volume |
| `/klines?symbol=0GUSDT&interval=1m&limit=60` | Não | Candles OHLCV |
| `/account` | Sim (`.env`) | Saldo e posições da conta |

## Regras de segurança (inegociáveis)

- A chave entra SÓ no `.env`. Nunca no código, nunca no front.
- O `.gitignore` já ignora o `.env`. Não remova essa linha.
- Use chave com permissão de leitura. Para laboratório, NÃO habilite saque.
- Restrinja a chave por IP na Binance sempre que possível.

## Para o Claude Code lapidar depois

- Trocar o cálculo de liquidação aproximado pela fórmula oficial da Binance (tiers de margem de manutenção).
- Adicionar WebSocket da Binance para preço em streaming (em vez de polling a cada 4s).
- Adicionar autenticação local no proxy para que só `localhost` acesse `/account`.

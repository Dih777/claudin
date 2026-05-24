/**
 * ============================================================================
 *  PROXY BINANCE — esqueleto para o seu laboratório de Grid
 * ============================================================================
 *
 *  POR QUE ISTO EXISTE:
 *  - CORS é uma trava DO NAVEGADOR. Um servidor (este arquivo) não tem CORS,
 *    então ele consegue falar com a Binance sem bloqueio.
 *  - A sua interface (no navegador) fala com ESTE proxy. O proxy fala com a
 *    Binance. A chave secreta NUNCA chega ao navegador — fica só aqui.
 *
 *  COMO RODAR:
 *    1. Tenha Node.js instalado (v18+ já traz fetch nativo).
 *    2. Neste diretório:  npm init -y && npm install express cors dotenv
 *    3. Crie um arquivo .env (modelo abaixo). NÃO versione ele no git.
 *    4. node server.js
 *    5. Na sua interface, troque as URLs da Binance por http://localhost:8787/...
 *
 *  MODELO DO ARQUIVO .env  (crie um arquivo chamado exatamente ".env"):
 *  ----------------------------------------------------------------------------
 *    BINANCE_KEY=sua_chave_api_aqui
 *    BINANCE_SECRET=sua_chave_secreta_aqui
 *    PORT=8787
 *  ----------------------------------------------------------------------------
 *
 *  REGRA DE OURO: a chave entra pelo .env (variável de ambiente), JAMAIS
 *  escrita direto no código e JAMAIS enviada ao front. O .gitignore deve
 *  conter a linha:  .env
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8787;

// Serve index.html e arquivos estáticos do mesmo diretório
app.use(express.static(path.join(__dirname)));

app.use(cors());

const KEY = process.env.BINANCE_KEY;
const SECRET = process.env.BINANCE_SECRET;

// Bases da API. fapi = futuros (perpétuos como 0GUSDT). api = spot.
const FUTURES = 'https://fapi.binance.com';
const SPOT = 'https://api.binance.com';

/* ---------------------------------------------------------------------------
 *  ROTA PÚBLICA: preço ao vivo. NÃO usa chave (dado de mercado é aberto).
 *  Resolve o CORS do 0GUSDT que falhava no navegador.
 *  Uso na interface:  fetch('http://localhost:8787/price?symbol=0GUSDT')
 * ------------------------------------------------------------------------- */
app.get('/price', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  try {
    // tenta futuros primeiro, cai pra spot se não existir
    let r = await fetch(`${FUTURES}/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!r.ok) r = await fetch(`${SPOT}/api/v3/ticker/price?symbol=${symbol}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'falha ao buscar preço', detail: String(e) });
  }
});

/* ---------------------------------------------------------------------------
 *  ROTA PÚBLICA: candles (OHLCV). Usado pela interface para o gráfico real.
 *  Uso: fetch('http://localhost:8787/klines?symbol=0GUSDT&interval=1m&limit=60')
 * ------------------------------------------------------------------------- */
app.get('/klines', async (req, res) => {
  const symbol   = (req.query.symbol   || 'BTCUSDT').toUpperCase();
  const interval = req.query.interval  || '1m';
  const limit    = Math.min(parseInt(req.query.limit) || 60, 500);
  try {
    let r = await fetch(
      `${FUTURES}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!r.ok) {
      r = await fetch(
        `${SPOT}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
    }
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'falha ao buscar candles', detail: String(e) });
  }
});

/* ---------------------------------------------------------------------------
 *  ROTA PÚBLICA: ticker 24h (variação, volume, high/low).
 *  Uso: fetch('http://localhost:8787/ticker24h?symbol=0GUSDT')
 * ------------------------------------------------------------------------- */
app.get('/ticker24h', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  try {
    let r = await fetch(`${FUTURES}/fapi/v1/ticker/24hr?symbol=${symbol}`);
    if (!r.ok) r = await fetch(`${SPOT}/api/v3/ticker/24hr?symbol=${symbol}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'falha ao buscar ticker 24h', detail: String(e) });
  }
});

/* ---------------------------------------------------------------------------
 *  ASSINATURA HMAC-SHA256
 *  A API privada da Binance exige que cada requisição seja "assinada": você
 *  pega a query string, gera um hash com a sua chave SECRETA, e anexa esse
 *  hash. A Binance refaz o hash do lado dela e confere. É isso que prova que
 *  o pedido é seu sem precisar mandar o segredo pela rede.
 * ------------------------------------------------------------------------- */
function sign(queryString) {
  return crypto.createHmac('sha256', SECRET).update(queryString).digest('hex');
}

/* ---------------------------------------------------------------------------
 *  ROTA PRIVADA: saldo e posições da SUA conta (futuros).
 *  ISTO é o que o navegador NUNCA conseguiria fazer sozinho.
 *  Uso na interface:  fetch('http://localhost:8787/account')
 *
 *  Requer chave com permissão de leitura. NÃO precisa (e não deve ter)
 *  permissão de saque para um laboratório.
 * ------------------------------------------------------------------------- */
app.get('/account', async (req, res) => {
  if (!KEY || !SECRET) {
    return res.status(500).json({ error: 'configure BINANCE_KEY e BINANCE_SECRET no .env' });
  }
  try {
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}&recvWindow=5000`;
    const signature = sign(query);
    const url = `${FUTURES}/fapi/v2/account?${query}&signature=${signature}`;

    const r = await fetch(url, { headers: { 'X-MBX-APIKEY': KEY } });
    const data = await r.json();

    // Devolve só o essencial pro laboratório — não exponha o objeto inteiro.
    if (data.assets) {
      const usdt = data.assets.find(a => a.asset === 'USDT') || {};
      res.json({
        saldoDisponivel: usdt.availableBalance,
        margemUsada: usdt.initialMargin,
        posicoes: (data.positions || [])
          .filter(p => parseFloat(p.positionAmt) !== 0)
          .map(p => ({
            par: p.symbol,
            quantidade: p.positionAmt,
            precoEntrada: p.entryPrice,
            precoLiquidacao: p.liquidationPrice,
            pnlNaoRealizado: p.unrealizedProfit,
            alavancagem: p.leverage,
          })),
      });
    } else {
      // erro da Binance (ex: -2015 = chave/IP/permissão inválida)
      res.status(400).json(data);
    }
  } catch (e) {
    res.status(502).json({ error: 'falha ao buscar conta', detail: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy rodando em http://localhost:${PORT}`);
  console.log(`  Preço público:  /price?symbol=0GUSDT`);
  console.log(`  Candles:        /klines?symbol=0GUSDT&interval=1m&limit=60`);
  console.log(`  Ticker 24h:     /ticker24h?symbol=0GUSDT`);
  console.log(`  Conta privada:  /account   (precisa de chave no .env)`);
});

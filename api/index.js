'use strict';
// Função da Vercel: todas as rotas /api/* chegam aqui (ver vercel.json).
// datas (vencimentos, "hoje") sempre no horário de Brasília, nunca no UTC do servidor
process.env.TZ = 'America/Sao_Paulo';
const { handle } = require('../lib/api');
module.exports = (req, res) => handle(req, res);

'use strict';
// Função da Vercel: todas as rotas /api/* chegam aqui (ver vercel.json).
const { handle } = require('../lib/api');
module.exports = (req, res) => handle(req, res);

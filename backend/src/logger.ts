import pino from 'pino';

/**
 * Logging estruturado.
 *
 * `console.log` produz texto que ninguém consegue consultar em produção.
 * Com JSON por linha, cada campo é pesquisável — `reqId`, `userId`, `statusCode`
 * — e um erro deixa de ser uma linha perdida no meio de mil.
 *
 * Em desenvolvimento a saída é formatada para leitura humana; em produção
 * mantém-se JSON puro, que é o que os agregadores de logs esperam.
 */

const isProd = process.env.NODE_ENV === 'production';

export const log = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Nunca gravar credenciais nem tokens no log, aconteça o que acontecer.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'body.password',
    ],
    censor: '[oculto]',
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

import { Router, type IRouter, type RequestHandler } from 'express';

/**
 * Router que encaminha rejeições de handlers `async` para o middleware de erro.
 *
 * No Express 4, uma exceção dentro de um handler `async` NÃO chega ao
 * middleware de erro: a promessa rejeita, ninguém a apanha, e o pedido fica
 * pendurado até o cliente desistir. O utilizador não vê um erro — vê a
 * aplicação a bloquear. Verificado: com a base de dados a falhar, o pedido não
 * devolvia 500, devolvia *nada* (ECONNABORTED ao fim de 5 s).
 *
 * A alternativa era migrar para Express 5, que já apanha estas rejeições. Ficou
 * para depois: obriga a rever `path-to-regexp` e todo o middleware de terceiros,
 * e isto resolve o problema com uma camada fina e visível.
 *
 * Usar `asyncRouter()` em vez de `Router()` chega — os handlers não mudam.
 */

const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;

/** Envolve um handler para que qualquer rejeição siga para `next(err)`. */
export function envolverAsync(handler: RequestHandler): RequestHandler {
  // Middleware de erro tem 4 argumentos e nunca deve ser envolvido:
  // fá-lo-ia parecer um handler normal e sairia da cadeia de erros.
  if (handler.length === 4) return handler;

  return function envolvido(req, res, next) {
    try {
      const resultado = (handler as (...a: unknown[]) => unknown)(req, res, next);
      if (resultado && typeof (resultado as Promise<unknown>).then === 'function') {
        (resultado as Promise<unknown>).catch(next);
      }
    } catch (err) {
      // Handlers síncronos que lançam já eram tratados pelo Express; isto
      // mantém o comportamento igual para os dois casos.
      next(err);
    }
  };
}

export function asyncRouter(): IRouter {
  const router = Router();

  for (const metodo of METODOS) {
    const original = (router as unknown as Record<string, CallableFunction>)[metodo].bind(router);
    (router as unknown as Record<string, CallableFunction>)[metodo] = (
      caminho: unknown,
      ...handlers: unknown[]
    ) =>
      original(
        caminho,
        ...handlers.map((h) => (typeof h === 'function' ? envolverAsync(h as RequestHandler) : h)),
      );
  }

  return router;
}

-- Permite invalidar tokens antes de expirarem.
--
-- O JWT é stateless: uma vez assinado, vale as 12 horas todas. Se for roubado
-- — e o token vive em localStorage, ao alcance de qualquer XSS — não havia
-- forma de o cortar. Mudar a password não fazia diferença nenhuma.
--
-- Este contador entra no token. Incrementá-lo invalida instantaneamente tudo
-- o que foi assinado antes: é o que acontece ao mudar a password ou ao pedir
-- "terminar sessão em todos os dispositivos".

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

# CRM Vendas

CRM para equipas comerciais de terreno, com foco no problema que faz falhar a
maioria das implementações: **não adoção**. A investigação de mercado que
orientou o produto aponta 50–63% de taxa de falha e menos de 37% dos comerciais
a usar o CRM que a empresa comprou, sobretudo por fricção de registo.

As decisões daqui partem daí — registo por voz, funcionamento sem rede, e tudo
o que diz respeito a um cliente acessível sem trocar de módulo.

[![CI](https://github.com/Lowtechpt/CRM-Novo/actions/workflows/ci.yml/badge.svg)](https://github.com/Lowtechpt/CRM-Novo/actions/workflows/ci.yml)

---

## Demo online

### **[crm-demo-liart-chi.vercel.app](https://crm-demo-liart-chi.vercel.app)**

Basta o botão **"Explorar em modo demonstração"** na página de entrada — não é
preciso criar conta nem pedir credenciais a ninguém.

Os dados são fictícios (20 clientes, 47 negócios, 5 comerciais) e a conta de
visita não elimina registos nem reinicia a base, por isso a demonstração
sobrevive à visita seguinte.

---

## Arrancar

Requer **Node.js 22+** (o `jsdom` usado nos testes não corre em versões
anteriores). Produção e CI correm a 24.

```bash
npm run install:all

cp .env.example backend/.env.local     # editar: JWT_SECRET e ADMIN_EMAIL

npm run dev                            # backend :3001 · frontend :5173
```

No primeiro arranque, as migrations correm sozinhas e é criada a conta de
administração a partir do `.env.local`. Sem `ADMIN_PASSWORD` definida, é gerada
uma password aleatória e impressa **uma única vez** no log.

Para popular com dados de demonstração (20 clientes, 47 negócios, 5 comerciais):

```bash
curl -X POST http://localhost:3001/api/seed -H "Authorization: Bearer <token>"
```

### Modo demonstração

Um CRM com login é uma porta fechada para quem só quer ver o projeto. Definindo
estas variáveis, a página de login passa a oferecer **"Explorar em modo
demonstração"** e a conta é criada no arranque:

```bash
DEMO_EMAIL=demo@exemplo.pt
DEMO_PASSWORD=<escolher>
```

A conta entra com papel `user`: explora tudo, cria e edita — **não elimina
registos nem reinicia os dados**. A demonstração sobrevive à visita seguinte.

As credenciais vivem só no ambiente de quem faz o deploy. Não estão no
repositório, nem no código do frontend: a aplicação pergunta ao servidor se o
modo existe antes de desenhar o botão.

---

## Verificar

```bash
npm run verify         # tipos + lint + testes
npm run test:coverage  # cobertura com limiares que falham se descerem
npx playwright test    # 23 testes ponta a ponta em browser real
```

| | |
|---|---|
| Testes backend | 149 (rotas com base de dados a sério, via supertest) |
| Testes frontend | 88 (parser de comandos, camada offline, sessão, métricas, CSV) |
| Testes E2E | 23 (Playwright: fluxo comercial, login, mobile, temas) |
| Cobertura backend | 85% linhas |

Há mais 3 testes de instalabilidade do PWA (`e2e/pwa.spec.ts`) que exigem o
build de produção servido em `:3002` e por isso **não correm** nesta suite nem
no CI — estão contados à parte de propósito, para o número acima significar
mesmo o que é verificado a cada alteração.

---

## Stack

| Camada | Escolha | Porquê |
|---|---|---|
| Frontend | React 19 · Vite 8 · TypeScript | PWA instalável, build rápido |
| Navegação | React Router | Um URL por módulo e por cliente: partilhável, e o botão de voltar funciona |
| Backend | Express · TypeScript | Superfície pequena, sem magia |
| Base de dados | SQLite via `@libsql/client` | Ficheiro local em dev, Turso em produção — mesma API |
| Validação | Zod | Uma definição serve validação e tipos |
| Testes | Vitest · Supertest · Playwright | Unidade, rota e ponta a ponta |

As alternativas rejeitadas e os custos aceites estão em
**[`docs/decisoes.md`](docs/decisoes.md)** — 14 decisões, cada uma com o que se
escolheu, o que se pôs de lado e porquê.

---

## O que faz

**Núcleo** — clientes com hierarquia de grupo/filial, atividades, interlocutores,
pipeline kanban de 9 fases (incluindo pós-venda), agenda e follow-up, equipa,
concorrência.

**Funciona sem rede.** Leituras servidas de IndexedDB, escritas numa fila
durável com ordem causal garantida. O indicador na sidebar diz sempre o que
falta enviar — e o que o servidor recusou, em vez de o perder em silêncio.

**Registo por voz e por comando.** Web Speech API em pt-PT, e um interpretador
por regras (sem modelo de linguagem) que transforma *"registar telefonema no
cliente Móveis Alentejo sobre a garantia"* num registo. Determinístico, offline,
sem custo por utilização.

**Custo do Silêncio.** Pipeline aberto de clientes sem contacto, por escalão de
dias. Nenhum dos cinco CRM líderes mostra o dinheiro que está parado.

**Assistente IA** com contexto construído no servidor a partir da base de dados
— fichas, notas de atividade, negócios, agenda, interlocutores.

**Três temas** — dois claros e um escuro — com uma regra só: um acento, um
alarme, o resto em escala de cinzentos. A hierarquia faz-se por peso e
contraste, não por cor.

**Instalável e utilizável no telemóvel.** PWA com service worker; em ecrã
estreito a lista de clientes e a ficha passam a padrão lista-detalhe, e o botão
físico de voltar fecha a ficha em vez de sair da aplicação.

---

## Arquitetura

```
backend/
  migrations/          esquema versionado, aplicado no arranque
  src/
    server.ts          middleware, ordem de rotas, arranque
    auth.ts            JWT, papéis, revogação de sessões
    propriedade.ts     quem pode escrever em que registo
    validate.ts        schemas Zod de todas as escritas
    asyncRouter.ts     rejeições async → middleware de erro
    eliminar.ts        eliminação: papel + 404 + auditoria, num sítio
    iaContext.ts       contexto para o modelo, com texto neutralizado
    routes/

frontend/
  src/
    App.tsx            rotas (react-router) e estado partilhado
    api.ts             camada única de acesso à API
    offline.ts         cache, fila durável, política de erros
    commands.ts        interpretador de comandos por regras
    csv.ts             importação de CSV do Excel português
    themes.css         tokens de cor; zero cores fixas no resto do CSS
    components/team/   métricas em funções puras, separadas da vista
    pages/
```

Cada módulo tem o seu URL (`/clientes`, `/clientes/:id`, `/pipeline`, …), por
isso um cliente pode ser enviado por link e o botão de voltar do browser navega
como se espera.

**Regras que o código não mostra sozinho:**

- Nunca `fetch` cru no frontend — só através de `api.ts`, senão o token não segue
- `src/env.ts` é o primeiro import do `server.ts` (em ESM os imports correm antes do corpo)
- Alterar o esquema é sempre uma migration nova; nunca editar uma aplicada
- Caminhos literais montam-se antes dos parametrizados (`/clients/summary` antes de `/clients/:id`)
- Nenhuma cor fixa fora de `themes.css` — mudar de tema tem de mudar tudo de uma vez

---

## Segurança

Autenticação JWT com revogação por versão · autorização por papel em todas as
operações destrutivas · propriedade de carteira por comercial · auditoria com
autor em todas as entidades · transações nas escritas multi-passo · CORS com
lista branca · Helmet · rate limiting (login por IP, IA por utilizador) ·
tempo de resposta constante no login · defesa contra injeção indireta de prompt.

---

## Produção

A demonstração corre em **Vercel** (frontend estático + backend como função) com
**Turso** como base de dados. Cada `git push` para `main` dispara o deploy.

Como o backend serverless não tem processo de arranque próprio, as migrations e
a conta inicial correm antes do primeiro pedido ser despachado (`api/index.ts`).

A app é instalável (PWA): quem abrir o endereço no telemóvel ou no computador
pode adicioná-la ao ecrã inicial e usá-la como aplicação, incluindo sem rede.

| Variável | Obrigatória | Para quê |
|---|:---:|---|
| `JWT_SECRET` | sim, em produção | Assinatura das sessões |
| `ADMIN_EMAIL` | sim | Conta criada no primeiro arranque |
| `ADMIN_PASSWORD` | não | Se ausente, é gerada e impressa uma vez |
| `TURSO_URL` / `TURSO_AUTH_TOKEN` | não | Base remota; sem elas usa ficheiro local |
| `CORS_ORIGINS` | sim, em produção | Origens autorizadas, separadas por vírgula |
| `TRUST_PROXY_HOPS` | atrás de balanceador | Nº de hops até ao cliente |
| `KILO_API_KEY` | não | Assistente IA; sem ela as rotas devolvem 503 |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | não | Ligam o botão de demonstração no login |

---

## Licença

Projeto pessoal, sem licença de distribuição.

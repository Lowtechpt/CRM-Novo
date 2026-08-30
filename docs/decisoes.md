# Decisões de arquitetura

Registo das decisões que não são óbvias a partir do código: o que se escolheu,
o que se rejeitou, e porquê. Cada entrada fica como está — quando uma decisão
muda, acrescenta-se outra em vez de reescrever a anterior.

---

## 1. SQLite/Turso em vez de Postgres

**Decisão.** `@libsql/client`, com ficheiro local em desenvolvimento e Turso em
produção — a mesma API nos dois casos.

**Alternativas.** Postgres (Supabase/Neon); MongoDB.

**Porquê.** Os dados são inteiramente relacionais: clientes, negócios,
atividades, todos ligados por chaves estrangeiras com cascatas. Postgres seria
igualmente adequado, mas exige um serviço a correr para desenvolver, e o Turso
dá o mesmo modelo com um ficheiro local — o projeto arranca com `npm run dev`
sem qualquer infraestrutura. MongoDB foi posto de lado por não ser relacional:
metade das consultas deste CRM são junções.

**Custo aceite.** Concorrência de escrita limitada. Num CRM com poucas dezenas
de comerciais isso não se nota; com centenas de escritas por segundo, notar-se-ia
— e a migração para Postgres implicaria reescrever o SQL cru.

---

## 2. SQL escrito à mão, sem ORM

**Decisão.** Consultas SQL diretas, com parâmetros ligados.

**Alternativas.** Prisma, Drizzle, Knex.

**Porquê.** As consultas que interessam neste projeto são agregações — o resumo
por cliente, o custo do silêncio, a previsão — e é precisamente aí que os ORMs
geram SQL que se acaba por ter de contornar. O caso do `GET /clients/summary` é
o exemplo: substituiu 20 pedidos por 1, e passou de ~13,7 s para ~1,0 s. Escrever
essa consulta à mão foi direto; obtê-la através de um ORM teria sido uma luta.

**Custo aceite.** Sem tipos gerados a partir do esquema: o mapeamento entre
coluna e campo (`call_state` → `callState`) é manual e pode dessincronizar. É
mitigado por `rowToClient()` num só sítio e pelos testes de rota.

---

## 3. Paginação opt-in, não por omissão

**Decisão.** `GET /clients` devolve um array com tudo; `GET /clients?page=1`
devolve `{ data, total, limit, offset }`.

**Alternativas.** Paginar sempre, devolvendo o envelope; versionar a API (`/v2`).

**Porquê.** Aprendido a partir de um erro real: mudar a forma da resposta por
omissão partiu a aplicação em execução — o `.length` de um objeto é `undefined`
e o ecrã caiu. Uma alteração de contrato numa rota existente é uma alteração
destrutiva, mesmo com um só cliente a consumi-la. A paginação opt-in dá a
capacidade sem quebrar nada.

**Custo aceite.** A aplicação continua a carregar a carteira toda, porque filtra
e ordena do lado do cliente. Funciona bem até alguns milhares de registos; acima
disso a UI tem de passar a usar `api.clients.page()`, que já existe e está testado.

---

## 4. Offline-first com IndexedDB, não uma biblioteca de sincronização

**Decisão.** Camada própria em `offline.ts`: cache de leituras e fila durável de
escritas, com aplicação otimista ao cache.

**Alternativas.** PouchDB/CouchDB; RxDB; Replicache.

**Porquê.** A investigação (`INVESTIGACAO/top5-crms-mundiais.md`) aponta a não
adoção como a causa principal de fracasso das implementações de CRM, e no
terreno "uma visita que não sincronizou é indistinguível de uma visita que nunca
aconteceu". Nenhum dos cinco líderes resolve isto bem. As bibliotecas de
sincronização resolvem o caso geral — com resolução de conflitos, replicação
bidirecional — e impõem o seu modelo de dados ao servidor. Aqui o problema é
estreito: um utilizador, um dispositivo de cada vez, conflitos raros. Umas
duzentas linhas próprias cobrem-no sem arrastar essa complexidade.

**Custo aceite.** Sem resolução de conflitos: duas edições ao mesmo registo em
dispositivos diferentes resolvem-se por "a última a sincronizar ganha". Aceitável
enquanto cada comercial gerir a sua própria carteira.

---

## 5. Interpretação de comandos por regras, sem modelo de linguagem

**Decisão.** `commands.ts` — expressões regulares e correspondência aproximada
(distância de edição) para transformar uma frase falada num registo.

**Alternativas.** Chamar o modelo para extrair a intenção.

**Porquê.** Foi um pedido explícito: registar sem depender de IA. E é a escolha
certa por si só — funciona offline, responde de imediato, não custa nada por
utilização e é determinístico. Um erro de interpretação é reproduzível e
corrigível com um teste; num modelo, seria uma reformulação do prompt e esperança.

**Custo aceite.** Só entende as formas previstas. Cada frase nova exige uma
regra nova — e um teste que a fixe. Os 31 testes em `commands.test.ts` são o
que impede uma regra nova de partir uma antiga.

**Nota.** Foram os testes deste módulo que encontraram o bug em que `norm()`
removia os `:` e "14:30" virava "14 30", deixando a hora por interpretar.

---

## 6. JWT sem estado, em vez de sessões em servidor

**Decisão.** Token assinado, válido 12 h, guardado em `localStorage`.

**Alternativas.** Sessões com cookie e armazenamento no servidor; refresh tokens.

**Porquê.** Sem estado no servidor, qualquer instância valida qualquer pedido —
o que mantém o backend escalável na horizontal sem armazenamento partilhado de
sessões. Doze horas cobrem um dia de trabalho sem obrigar a repetir o login.

**Custo aceite.** Um token não pode ser revogado antes de expirar: despromover
alguém só produz efeito na sessão seguinte. E `localStorage` é acessível a
JavaScript, logo vulnerável a XSS — mitigado por não haver `dangerouslySetInnerHTML`
com dados de utilizador e por o React escapar o conteúdo por omissão. Um cookie
`httpOnly` seria mais seguro; exigiria proteção CSRF em troca.

---

## 7. Migrations em ficheiros, não `ensureColumn` no arranque

**Decisão.** `backend/migrations/NNN_nome.sql`, aplicadas por ordem e registadas
em `schema_migrations`.

**Alternativas.** Manter o `ensureColumn()` idempotente; usar Prisma Migrate.

**Porquê.** O `ensureColumn` funcionava, mas o esquema passava a ser o efeito
colateral de ler o código de arranque todo: não havia forma de saber quando uma
coluna entrou nem por que ordem. Com ficheiros numerados há história, e o mesmo
código produz o mesmo esquema em qualquer máquina.

**Detalhe.** Bases criadas antes deste sistema são adotadas como baseline: as
duas primeiras migrations são marcadas como aplicadas sem correr, porque
`ALTER TABLE ADD COLUMN` numa coluna existente é erro em SQLite.

---

## 8. O contexto da IA é montado no servidor

**Decisão.** `iaContext.ts` lê a base de dados e monta o texto; o browser envia
apenas `scope` e `clientId`.

**Alternativas.** O browser envia o contexto que já tem em memória.

**Porquê.** Era assim antes, e o modelo respondia que "não há detalhe de
atividades individuais por cliente no contexto fornecido" — porque o browser só
tinha agregados. Montar no servidor dá acesso ao texto das notas, aos negócios
com valores, à agenda e aos interlocutores por nome. Também impede o cliente de
manipular o contexto para obter dados a que não teria acesso.

**Custo aceite.** Cada pergunta implica ler várias tabelas. Aceitável ao ritmo
com que se fazem perguntas à IA; se crescer, o contexto passa a ser cacheado
por cliente com invalidação na escrita.

---

## 9. Repetir só o que vale a pena repetir

**Decisão.** As chamadas à IA repetem em 5xx, 429 e falha de rede; não repetem
em 4xx. Timeout de 45 s, intervalo crescente.

**Porquê.** Repetir um 401 ou um 400 é garantido falhar outra vez — só atrasa a
mensagem de erro que o utilizador precisa de ver. Repetir um 503 costuma
resolver. Sem o timeout, um serviço que aceita a ligação e nunca responde
prendia o pedido indefinidamente e o ecrã ficava bloqueado sem explicação.

---

## 10. Testes: rotas e ponta a ponta, não componentes

**Decisão.** 102 testes de backend (rotas com base de dados a sério, via
supertest) + 31 de lógica no frontend + 12 ponta a ponta. Sem testes de
componentes React isolados.

**Porquê.** Os testes de rota apanharam quatro bugs reais que estavam em
produção — campos opcionais a `null` a rejeitarem edições válidas, clientes sem
histórico a desaparecerem do resumo, JSON malformado a devolver 500, negócios
sem prazo a não poderem mudar de fase. Os E2E apanharam um quinto, o maior:
seis chamadas `fetch` cruas sem o cabeçalho de autenticação, que tinham deixado
todas as funcionalidades de IA e a página "O Meu Dia" inoperacionais desde que o
login foi introduzido. Testes de componentes isolados não teriam apanhado
nenhum destes: o erro estava sempre na fronteira entre camadas.

**Custo aceite.** A suite é mais lenta (segundos, não milissegundos) e uma
falha aponta para uma zona em vez de uma linha. Compensa pelo tipo de bug que
apanha.

---

## 11. Rejeições async tratadas por um Router próprio, não por Express 5

**Decisão.** `asyncRouter()` — um Router cujos métodos envolvem cada handler e
encaminham rejeições para `next(err)`.

**Alternativas.** Migrar para Express 5 (que já apanha rejeições de handlers
async); `try/catch` em cada rota; `express-async-errors`.

**Porquê.** O problema era real e foi medido: com a base de dados a falhar, um
`GET /clients` não devolvia 500 — não devolvia **nada**. A promessa rejeitava,
ninguém a apanhava, e o pedido ficava pendurado até o cliente desistir
(ECONNABORTED ao fim de 5 s). Todo o middleware de erro cuidadosamente escrito
nunca chegava a correr.

Express 5 é a solução de fundo e é para onde isto deve ir. Ficou para depois
porque obriga a rever `path-to-regexp` (mudou de major), todo o middleware de
terceiros, e a rota regex que serve a SPA — trabalho que merece a sua própria
sessão e a sua própria verificação. `try/catch` em cada rota resolveria, mas são
45 sítios onde alguém se pode esquecer, e o esquecimento é invisível.

O Router é uma camada de vinte linhas, aplicada num sítio por ficheiro, e os
handlers não mudaram nada.

**Custo aceite.** É uma peça própria em vez de comportamento da plataforma.
Fica marcada como ponte até à migração para Express 5.

---

## 12. Recusa do servidor não é falta de rede

**Decisão.** `ErroApi` carrega o código HTTP. A fila offline enfileira falhas de
rede, 5xx, 401, 408 e 429; recusa de imediato os restantes 4xx. O `flush`
descarta uma mutação recusada e continua, em vez de parar.

**Porquê.** O `catch` genérico tratava tudo como falta de ligação. Um 400 de
validação obtido **com** rede entrava na fila: o utilizador via "1 por
sincronizar" para sempre, com a alteração já recusada. Pior, o `flush` parava no
primeiro erro — a mutação inválida ficava à cabeça e bloqueava todas as
seguintes, indefinidamente.

O resultado era o oposto exato do argumento do produto: as visitas e notas
registadas a seguir ficavam presas atrás de um erro que ninguém via, e "uma
visita que não sincronizou é indistinguível de uma visita que nunca aconteceu".

401, 408 e 429 são a exceção dentro dos 4xx porque repetir faz mesmo sentido:
uma sessão caducada resolve-se com login, um limite de tráfego passa.

**Custo aceite.** A recusa tem de ser mostrada ao utilizador — o cache otimista
já lhe mostrou a alteração como aceite. Daí a lista `rejected` no indicador de
sincronização, que ele dispensa quando a tiver visto.

---

## 13. O prompt de sistema da IA pertence ao servidor

**Decisão.** `POST /ia-chat` ignora `system` e `context` do corpo do pedido. O
contexto é sempre montado no servidor a partir de `scope`.

**Porquê.** O código fazia `system || BASE_SYSTEM`: um `system` enviado pelo
cliente **substituía o prompt base inteiro** — incluindo a instrução que impede
o modelo de citar dados internos do CRM nos emails que sugere (uma proteção
adicionada depois de uma fuga real, em que o email gerado dizia ao cliente "com
um pipeline de 43 mil euros"). Qualquer conta podia removê-la.

E `context` aceitava 60 kB à escolha de quem chamava: o endpoint era, na
prática, um modelo de linguagem pessoal pago pela chave da empresa.

**Custo aceite.** Os campos continuam no schema para não partir clientes
antigos, mas são ignorados — o que é uma incoerência menor que fica documentada
aqui em vez de surpreender alguém.

---

## 14. Navegação por URL, não por estado

**Decisão.** Cada módulo tem uma rota (`/clientes`, `/pipeline`, `/agenda`, …) e
um cliente aberto é `/clientes/:id`, com React Router. A última página deixou de
ser guardada em `localStorage`.

**Porquê.** A aplicação vivia toda em `/`, e o módulo visível era um `tab` em
memória. Consequências: não havia forma de enviar a alguém o link de um cliente,
o botão de voltar do browser saía da aplicação em vez de recuar um ecrã, e um
recarregamento só reencontrava o sítio por acaso, através do `localStorage`.

Em telemóvel isto já tinha custado código: o padrão lista-detalhe era feito à
mão com `history.pushState` e um ouvinte de `popstate`, só para o botão físico
de voltar fechar a ficha. Com rotas reais esse comportamento é o do próprio
router, e o código manual desapareceu.

**O que se rejeitou.** Manter o `tab` e sincronizá-lo com a barra de endereço à
mão — é reescrever um router pior, e continuava sem `/clientes/:id`.

**Custo aceite.** Uma dependência nova (`react-router-dom`) e a barra lateral
passou de `<button>` a `<a>`. A mudança de elemento partiu todos os testes E2E
que localizavam a navegação por `getByRole('button')` — tipos e testes de
unidade passaram sem notar. Ver
`SESSION_LOG` (2026-08-26) e a nota de vault sobre correr a suite completa antes
de dar uma alteração estrutural por terminada.

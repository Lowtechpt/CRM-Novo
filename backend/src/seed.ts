import { randomUUID } from 'crypto';
import { db } from './db.js';
import { asyncRouter } from './asyncRouter.js';
import type { LinhaBD } from './linhas.js';

export const seedRouter = asyncRouter();

const uid = () => randomUUID();

/** Datas relativas a hoje, para a demo nunca parecer desatualizada. */
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAhead(n: number) {
  return daysAgo(-n);
}

seedRouter.post('/seed', async (_req, res) => {
  try {
    /* Limpeza numa só transação. Em sequência, uma falha a meio deixava a base
       parcialmente vazia — sem clientes mas com atividades órfãs, por exemplo —
       e o seed abortava sem forma de voltar atrás. A ordem respeita as chaves
       estrangeiras: primeiro o que depende, depois aquilo de que se depende. */
    await db.batch(
      [
        'DELETE FROM agenda',
        'DELETE FROM activities',
        'DELETE FROM deals',
        'DELETE FROM interlocutors',
        'DELETE FROM competition',
        'DELETE FROM salespeople',
        'DELETE FROM clients',
      ],
      'write',
    );

    /* ═══════════════ COMERCIAIS ═══════════════ */
    const salespeopleData = [
      {
        name: 'Luis Baptista',
        role: 'Diretor Comercial',
        email: 'luis@empresa.pt',
        phone: '+351 910 000 100',
      },
      {
        name: 'Rita Nunes',
        role: 'Account Manager',
        email: 'rita@empresa.pt',
        phone: '+351 910 000 101',
      },
      {
        name: 'Tiago Melo',
        role: 'Pré-vendas',
        email: 'tiago@empresa.pt',
        phone: '+351 910 000 102',
      },
      {
        name: 'Beatriz Alves',
        role: 'Account Manager',
        email: 'beatriz@empresa.pt',
        phone: '+351 910 000 103',
      },
      {
        name: 'Nuno Ramos',
        role: 'Key Account',
        email: 'nuno@empresa.pt',
        phone: '+351 910 000 104',
      },
    ];
    const salespeople: LinhaBD[] = [];
    for (const s of salespeopleData) {
      const id = uid();
      await db.execute({
        sql: `INSERT INTO salespeople (id,name,email,phone,role) VALUES (?,?,?,?,?)`,
        args: [id, s.name, s.email, s.phone, s.role],
      });
      salespeople.push({ id, ...s });
    }

    /* ═══════════════ CLIENTES ═══════════════ */
    const clientsData = [
      {
        name: 'Silva & Irmãos Lda',
        nif: '502345678',
        sector: 'Indústria',
        cae: '25120',
        status: 'Ativo',
        contact: 'João Silva',
        score: 92,
        email: 'geral@silva-irmaos.pt',
        phone: '+351 912 000 001',
        website: 'https://silva-irmaos.pt',
        address: 'Rua da Fábrica, 12',
        city: 'Porto',
        notes: 'Cliente estratégico com potencial de expansão para a zona norte.',
        starred: 1,
        lat: 41.14961,
        lng: -8.61099,
        callState: '',
      },
      {
        name: 'Café Costa',
        nif: '509876543',
        sector: 'Restauração',
        cae: '56101',
        status: 'Contactado',
        contact: 'Ana Costa',
        score: 74,
        email: 'ana@cafecosta.pt',
        phone: '+351 912 000 002',
        website: 'https://cafecosta.pt',
        address: 'Avenida Central, 88',
        city: 'Lisboa',
        notes: 'Interessado em automação de atendimento e fidelização.',
        starred: 0,
        lat: 38.72225,
        lng: -9.13934,
        callState: 'no-answer',
        parentName: 'Silva & Irmãos Lda',
      },
      {
        name: 'TechNova',
        nif: '515123456',
        sector: 'Tecnologia',
        cae: '62010',
        status: 'Prospeto',
        contact: 'Miguel Rocha',
        score: 88,
        email: 'miguel@technova.pt',
        phone: '+351 912 000 003',
        website: 'https://technova.pt',
        address: 'Lagoas Park, Edifício 3',
        city: 'Oeiras',
        notes: 'Startup em crescimento; possível parceiro de integração.',
        starred: 1,
        lat: 38.69368,
        lng: -9.31085,
        callState: '',
      },
      {
        name: 'Grupo Horizonte',
        nif: '507654321',
        sector: 'Consultoria',
        cae: '70207',
        status: 'Inativo',
        contact: 'Sofia Marques',
        score: 45,
        email: 'sofia@grupo-horizonte.pt',
        phone: '+351 912 000 004',
        website: 'https://grupo-horizonte.pt',
        address: 'Praça do Comércio, 45',
        city: 'Lisboa',
        notes: 'Sem interação nos últimos 6 meses. Reavaliar fit.',
        starred: 0,
        lat: 38.70757,
        lng: -9.13639,
        callState: 'vacation',
      },
      {
        name: 'Móveis Alentejo',
        nif: '503987654',
        sector: 'Retail',
        cae: '47510',
        status: 'Ativo',
        contact: 'Carlos Pereira',
        score: 81,
        email: 'carlos@moveisalentejo.pt',
        phone: '+351 912 000 005',
        website: 'https://moveisalentejo.pt',
        address: 'Zona Industrial, Lote 9',
        city: 'Évora',
        notes: 'Cliente recorrente com pedidos sazonais de orçamentação.',
        starred: 1,
        lat: 38.57139,
        lng: -7.90971,
        callState: '',
        parentName: 'Silva & Irmãos Lda',
      },
      {
        name: 'Padaria Bom Pão',
        nif: '511223344',
        sector: 'Restauração',
        cae: '10711',
        status: 'Ativo',
        contact: 'Fernanda Reis',
        score: 68,
        email: 'fernanda@bompao.pt',
        phone: '+351 913 100 001',
        website: 'https://bompao.pt',
        address: 'Rua das Flores, 22',
        city: 'Braga',
        notes: 'Cadeia de 4 lojas; interesse em gestão de stock centralizada.',
        starred: 0,
        lat: 41.55033,
        lng: -8.42005,
        callState: '',
      },
      {
        name: 'Construções Vale Verde',
        nif: '511998877',
        sector: 'Construção',
        cae: '41200',
        status: 'Contactado',
        contact: 'Rui Antunes',
        score: 59,
        email: 'rui@valeverde.pt',
        phone: '',
        website: 'https://valeverde.pt',
        address: 'EN10, km 5',
        city: 'Setúbal',
        notes: 'Ciclo de decisão longo; aguardando aprovação orçamental do dono.',
        starred: 0,
        lat: 38.52432,
        lng: -8.89094,
        callState: '',
      },
      {
        name: 'Farmácia Central',
        nif: '512345098',
        sector: 'Saúde',
        cae: '47730',
        status: 'Ativo',
        contact: 'Dra. Cristina Lopes',
        score: 85,
        email: 'cristina@farmaciacentral.pt',
        phone: '+351 913 100 003',
        website: 'https://farmaciacentral.pt',
        address: 'Praça da República, 3',
        city: 'Coimbra',
        notes: 'Muito satisfeita com o suporte; boa referência para outras farmácias.',
        starred: 1,
        lat: 40.20564,
        lng: -8.41955,
        callState: '',
      },
      {
        name: 'Auto Peças Nortenha',
        nif: '513456109',
        sector: 'Retail',
        cae: '45320',
        status: 'Prospeto',
        contact: 'Paulo Mendes',
        score: 52,
        email: 'paulo@autopecasnortenha.pt',
        phone: '+351 913 100 004',
        website: 'https://autopecasnortenha.pt',
        address: 'Zona Industrial de Braga',
        city: 'Braga',
        notes: 'Primeira reunião marcada; competitivo com a Sage.',
        starred: 0,
        lat: 41.54541,
        lng: -8.42658,
        callState: '',
      },
      {
        name: 'Estúdio Criativo Lumen',
        nif: '514567220',
        sector: 'Marketing',
        cae: '73110',
        status: 'Ativo',
        contact: 'Marta Sousa',
        score: 77,
        email: 'marta@estudiolumen.pt',
        phone: '+351 913 100 005',
        website: 'https://estudiolumen.pt',
        address: 'Rua do Comércio, 150',
        city: 'Porto',
        notes: 'Agência boutique; usa o CRM sobretudo para pipeline de propostas.',
        starred: 0,
        lat: 41.14421,
        lng: -8.61099,
        callState: '',
      },
      {
        name: 'Transportes Rápidos SA',
        nif: '515678331',
        sector: 'Logística',
        cae: '49410',
        status: 'Ativo',
        contact: 'Hugo Ferreira',
        score: 90,
        email: 'hugo@transportesrapidos.pt',
        phone: '+351 913 100 006',
        website: 'https://transportesrapidos.pt',
        address: 'Parque Logístico, Lote 3',
        city: 'Aveiro',
        notes: 'Frota de 40 viaturas; negócio de renovação anual estável.',
        starred: 1,
        lat: 40.64427,
        lng: -8.64554,
        callState: '',
      },
      {
        name: 'Clínica Vitalis',
        nif: '516789442',
        sector: 'Saúde',
        cae: '86220',
        status: 'Contactado',
        contact: 'Dr. André Pinto',
        score: 63,
        email: 'andre@clinicavitalis.pt',
        phone: '+351 913 100 007',
        website: 'https://clinicavitalis.pt',
        address: 'Avenida da Liberdade, 200',
        city: 'Lisboa',
        notes: 'Interessado em módulo de agendamento de pacientes.',
        starred: 0,
        lat: 38.72038,
        lng: -9.14548,
        callState: 'no-answer',
      },
      {
        name: 'Quinta do Rio Douro',
        nif: '517890553',
        sector: 'Agricultura',
        cae: '01210',
        status: 'Prospeto',
        contact: 'Beatriz Cardoso',
        score: 48,
        email: '',
        phone: '+351 913 100 008',
        website: 'https://quintadorio.pt',
        address: 'Estrada do Douro, km 12',
        city: 'Peso da Régua',
        notes: 'Exporta para 3 mercados; procura CRM com gestão de encomendas.',
        starred: 0,
        lat: 41.16278,
        lng: -7.78944,
        callState: '',
      },
      {
        name: 'Escritório Jurídico Fonseca',
        nif: '518901664',
        sector: 'Serviços Jurídicos',
        cae: '69101',
        status: 'Ativo',
        contact: 'Dr. Ricardo Fonseca',
        score: 71,
        email: 'ricardo@fonsecaadvogados.pt',
        phone: '+351 913 100 009',
        website: 'https://fonsecaadvogados.pt',
        address: 'Rua dos Advogados, 8',
        city: 'Lisboa',
        notes: 'Escritório de 12 advogados; renovação de licenças em Outubro.',
        starred: 0,
        lat: 38.71166,
        lng: -9.13847,
        callState: '',
      },
      {
        name: 'Hotel Vista Mar',
        nif: '519012775',
        sector: 'Turismo',
        cae: '55101',
        status: 'Ativo',
        contact: 'Isabel Nogueira',
        score: 83,
        email: 'isabel@vistamar.pt',
        phone: '+351 913 100 010',
        website: 'https://hotelvistamar.pt',
        address: 'Avenida do Mar, 300',
        city: 'Cascais',
        notes: 'Sazonalidade forte; pico de negócio em negociação para Verão 2027.',
        starred: 1,
        lat: 38.6966,
        lng: -9.4215,
        callState: '',
      },
      {
        name: 'Fábrica de Calçado Ibérico',
        nif: '520123886',
        sector: 'Indústria',
        cae: '15200',
        status: 'Contactado',
        contact: 'Manuel Vieira',
        score: 66,
        email: 'manuel@calcadoiberico.pt',
        phone: '+351 913 100 011',
        website: 'https://calcadoiberico.pt',
        address: 'Zona Industrial de Felgueiras',
        city: 'Felgueiras',
        notes: 'Concorrência forte da Primavera já instalada há anos.',
        starred: 0,
        lat: 41.35311,
        lng: -8.19588,
        callState: '',
      },
      {
        name: 'Cabeleireiro Elegance',
        nif: '',
        sector: 'Serviços',
        cae: '96021',
        status: 'Inativo',
        contact: 'Cátia Ramalho',
        score: 30,
        email: 'catia@elegance.pt',
        phone: '+351 913 100 012',
        website: 'https://elegance.pt',
        address: 'Rua Nova, 45',
        city: 'Guimarães',
        notes: 'Cancelou negociação por orçamento; retomar em 2027.',
        starred: 0,
        lat: 41.44398,
        lng: -8.29631,
        callState: '',
      },
      {
        name: 'Escola de Condução Segura',
        nif: '522345108',
        sector: 'Educação',
        cae: '85530',
        status: 'Prospeto',
        contact: 'Vítor Cunha',
        score: 55,
        email: 'vitor@conducaosegura.pt',
        phone: '+351 913 100 013',
        website: 'https://conducaosegura.pt',
        address: 'Avenida dos Aliados, 60',
        city: 'Porto',
        notes: '',
        starred: 0,
        lat: 41.14992,
        lng: -8.6115,
        callState: '',
      },
      {
        name: 'Supermercado Boa Compra',
        nif: '523456219',
        sector: 'Retail',
        cae: '47111',
        status: 'Ativo',
        contact: 'Teresa Duarte',
        score: 87,
        email: 'teresa@boacompra.pt',
        phone: '+351 913 100 014',
        website: 'https://boacompra.pt',
        address: 'Rua do Mercado, 5',
        city: 'Faro',
        notes: 'Cadeia regional de 6 lojas; contrato multi-loja assinado.',
        starred: 1,
        lat: 37.01935,
        lng: -7.93027,
        callState: '',
      },
      {
        name: 'Studio de Yoga Equilíbrio',
        nif: '524567320',
        sector: 'Bem-estar',
        cae: '93130',
        status: 'Contactado',
        contact: 'Joana Melo',
        score: 41,
        email: 'joana@equilibrio.pt',
        phone: '+351 913 100 015',
        website: 'https://equilibrio.pt',
        address: 'Rua da Paz, 18',
        city: 'Lisboa',
        notes: 'Negócio pequeno; testando o plano gratuito antes de decidir.',
        starred: 0,
        lat: 38.72684,
        lng: -9.15294,
        callState: 'vacation',
      },
    ];

    const insertedClients: LinhaBD[] = [];
    for (const c of clientsData) {
      const id = uid();
      insertedClients.push({ id, ...c });
    }
    // segunda passagem: resolver parentName -> parentId antes de inserir
    const byName = new Map(insertedClients.map((c) => [c.name, c]));
    for (const c of insertedClients) {
      const parentId = c.parentName ? (byName.get(c.parentName)?.id ?? null) : null;
      await db.execute({
        sql: `INSERT INTO clients (id,name,nif,sector,cae,status,contact,score,email,phone,website,address,city,notes,starred,lat,lng,call_state,parent_id)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          c.id,
          c.name,
          c.nif,
          c.sector,
          c.cae,
          c.status,
          c.contact,
          c.score,
          c.email,
          c.phone,
          c.website,
          c.address,
          c.city,
          c.notes,
          c.starred ? 1 : 0,
          c.lat,
          c.lng,
          c.callState,
          parentId,
        ],
      });
    }

    /* ═══════════════ INTERLOCUTORES (2-3 por cliente) ═══════════════ */
    const roleSets = [
      ['CEO', 'Diretor Financeiro', 'Responsável de Compras'],
      ['Gerente', 'Assistente Administrativo'],
      ['CTO', 'Product Manager', 'Head of Sales'],
      ['Diretor Geral', 'Assistente de Direção'],
    ];
    let interlocutorsCount = 0;
    for (const c of insertedClients) {
      const roles = roleSets[Math.floor(Math.random() * roleSets.length)];
      const firstName = c.contact.replace(/^(Dr\.|Dra\.)\s*/, '').split(' ')[0];
      for (let i = 0; i < roles.length; i++) {
        const isMain = i === 0;
        await db.execute({
          sql: `INSERT INTO interlocutors (id,client_id,name,role,phone,email) VALUES (?,?,?,?,?,?)`,
          args: [
            uid(),
            c.id,
            isMain ? c.contact : `${firstName} — ${roles[i]}`,
            roles[i],
            isMain ? c.phone : c.phone.replace(/\d{3}$/, String(100 + i).padStart(3, '0')),
            isMain
              ? c.email
              : c.email.replace('@', `.${roles[i].toLowerCase().replace(/\s/g, '')}@`),
          ],
        });
        interlocutorsCount++;
      }
    }

    /* ═══════════════ PIPELINE — vários negócios por cliente, ciclo completo ═══════════════ */
    const stagePool: { stage: string; probability: number; recurring: (v: number) => number }[] = [
      { stage: 'Prospeto', probability: 15, recurring: () => 0 },
      { stage: 'Contactado', probability: 30, recurring: () => 0 },
      { stage: 'Proposta', probability: 55, recurring: () => 0 },
      { stage: 'Negociação', probability: 75, recurring: () => 0 },
      { stage: 'Ganho', probability: 100, recurring: () => 0 },
      { stage: 'Perdido', probability: 0, recurring: () => 0 },
      { stage: 'Onboarding', probability: 100, recurring: (v) => Math.round(v * 0.03) },
      { stage: 'Em serviço', probability: 100, recurring: (v) => Math.round(v * 0.04) },
      { stage: 'Renovação', probability: 90, recurring: (v) => Math.round(v * 0.035) },
    ];
    const dealTitles = [
      'Licenciamento módulo core',
      'Implementação inicial',
      'Upgrade de plano',
      'Integração com ERP existente',
      'Consultoria de processos',
      'Renovação anual',
      'Módulo de relatórios avançados',
      'Formação de equipa',
      'Expansão para nova filial',
      'Migração de dados legados',
    ];
    const insertedDeals: LinhaBD[] = [];
    for (const c of insertedClients) {
      const nDeals = 1 + Math.floor(Math.random() * 3); // 1 a 3 negócios por cliente
      for (let i = 0; i < nDeals; i++) {
        const pick = stagePool[Math.floor(Math.random() * stagePool.length)];
        const value = 1500 + Math.floor(Math.random() * 30) * 1000;
        const title = dealTitles[Math.floor(Math.random() * dealTitles.length)];
        const id = uid();
        const dueDate = ['Ganho', 'Perdido', 'Onboarding', 'Em serviço', 'Renovação'].includes(
          pick.stage,
        )
          ? daysAgo(Math.floor(Math.random() * 60))
          : daysAhead(5 + Math.floor(Math.random() * 60));
        await db.execute({
          sql: `INSERT INTO deals (id,client_id,title,value,stage,probability,due_date,recurring_value) VALUES (?,?,?,?,?,?,?,?)`,
          args: [
            id,
            c.id,
            `${title} — ${c.name}`,
            value,
            pick.stage,
            pick.probability,
            dueDate,
            pick.recurring(value),
          ],
        });
        insertedDeals.push({ id, clientId: c.id, stage: pick.stage });
      }
    }

    /* ═══════════════ ATIVIDADES — 2 a 5 por cliente, espalhadas no tempo ═══════════════ */
    const actTemplates: { type: string; notes: string[] }[] = [
      {
        type: 'Telefonema',
        notes: [
          'Contacto de follow-up sobre a proposta enviada.',
          'Chamada de qualificação inicial.',
          'Confirmação de reunião presencial.',
          'Chamada para esclarecer dúvidas técnicas.',
        ],
      },
      {
        type: 'Email',
        notes: [
          'Enviada proposta comercial atualizada.',
          'Envio de documentação técnica solicitada.',
          'Email de agradecimento pós-reunião.',
          'Envio de fatura e condições de pagamento.',
        ],
      },
      {
        type: 'Reunião',
        notes: [
          'Reunião de apresentação da solução.',
          'Reunião de fecho de negociação.',
          'Kickoff do projeto de implementação.',
          'Reunião trimestral de acompanhamento.',
        ],
      },
      {
        type: 'Proposta',
        notes: [
          'Proposta comercial enviada com desconto de fidelização.',
          'Nova proposta após ajuste de âmbito.',
        ],
      },
      {
        type: 'Nota',
        notes: [
          'Cliente pediu mais tempo para decidir.',
          'Sinal de interesse forte após demo.',
          'Concorrência mencionada na conversa — ver módulo Concorrência.',
        ],
      },
      {
        type: 'Porta Fria',
        notes: [
          'Visita sem marcação à sede do cliente.',
          'Passagem pela zona industrial; deixado contacto na receção.',
        ],
      },
    ];
    let activitiesCount = 0;
    for (const [ci, c] of insertedClients.entries()) {
      const nActs = 2 + Math.floor(Math.random() * 4); // 2 a 5

      // Um terço da carteira fica deliberadamente "esquecida": último contacto
      // há 45-150 dias. Sem isto o Custo do Silêncio dava sempre zero e a
      // funcionalidade não se via na demo — que é exatamente o cenário real
      // que ela existe para expor.
      const coldOffset = ci % 3 === 0 ? 45 + Math.floor(Math.random() * 105) : 0;

      // Dois clientes nunca foram contactados de todo
      if (ci === 7 || ci === 13) continue;

      for (let i = 0; i < nActs; i++) {
        const tpl = actTemplates[Math.floor(Math.random() * actTemplates.length)];
        const note = tpl.notes[Math.floor(Math.random() * tpl.notes.length)];
        const daysBack = coldOffset + i * (3 + Math.floor(Math.random() * 5));
        const hour = String(8 + Math.floor(Math.random() * 9)).padStart(2, '0');
        const minute = ['00', '15', '30', '45'][Math.floor(Math.random() * 4)];
        await db.execute({
          sql: `INSERT INTO activities (id,client_id,type,date,time,notes,spoke_to) VALUES (?,?,?,?,?,?,?)`,
          args: [uid(), c.id, tpl.type, daysAgo(daysBack), `${hour}:${minute}`, note, c.contact],
        });
        activitiesCount++;
      }
    }

    /* ═══════════════ AGENDA + FOLLOW-UP — 1 a 3 por cliente ═══════════════ */
    const agendaTemplates = [
      {
        type: 'Reunião',
        titles: ['Reunião de acompanhamento', 'Apresentação de proposta', 'Reunião de fecho'],
      },
      { type: 'Demo', titles: ['Demo da plataforma', 'Demo do módulo de relatórios'] },
      {
        type: 'Follow-up',
        titles: ['Follow-up sobre proposta', 'Follow-up pós-demo', 'Confirmar decisão do cliente'],
      },
      { type: 'Telefonema', titles: ['Chamada de reativação', 'Chamada de qualificação'] },
    ];
    let agendaCount = 0;
    for (const c of insertedClients) {
      const nEvents = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nEvents; i++) {
        const tpl = agendaTemplates[Math.floor(Math.random() * agendaTemplates.length)];
        const title = tpl.titles[Math.floor(Math.random() * tpl.titles.length)];
        const future = Math.random() > 0.3;
        const date = future
          ? daysAhead(1 + Math.floor(Math.random() * 21))
          : daysAgo(1 + Math.floor(Math.random() * 10));
        const hour = String(9 + Math.floor(Math.random() * 8)).padStart(2, '0');
        await db.execute({
          sql: `INSERT INTO agenda (id,client_id,type,title,date,time,done) VALUES (?,?,?,?,?,?,?)`,
          args: [
            uid(),
            c.id,
            tpl.type,
            `${title} — ${c.name}`,
            date,
            `${hour}:00`,
            future ? 0 : Math.random() > 0.4 ? 1 : 0,
          ],
        });
        agendaCount++;
      }
    }

    /* ═══════════════ CONCORRÊNCIA — nos clientes com mais atividade comercial ═══════════════ */
    const competitors = [
      { name: 'Sage', products: ['Sage 200', 'Sage X3'] },
      { name: 'Primavera', products: ['Primavera V10', 'Primavera Elevation'] },
      { name: 'PHC', products: ['PHC CS Gestão', 'PHC CS Advanced'] },
      { name: 'Zonesoft', products: ['ZS Rest', 'ZS Retail'] },
      { name: 'Zoho CRM', products: ['Zoho One'] },
      { name: 'HubSpot', products: ['HubSpot Sales Hub'] },
    ];
    const compStatuses = ['Instalado', 'Em disputa', 'Perdido', 'Ganho'];
    let competitionCount = 0;
    // um subconjunto de clientes tem histórico de concorrência (mais realista que todos)
    const clientsWithCompetition = insertedClients.filter(() => Math.random() > 0.35);
    for (const c of clientsWithCompetition) {
      const comp = competitors[Math.floor(Math.random() * competitors.length)];
      const product = comp.products[Math.floor(Math.random() * comp.products.length)];
      const status = compStatuses[Math.floor(Math.random() * compStatuses.length)];
      const ourValue = 2000 + Math.floor(Math.random() * 15) * 1000;
      const delta = Math.round(ourValue * (0.85 + Math.random() * 0.3));
      const sp = salespeople[Math.floor(Math.random() * salespeople.length)];
      await db.execute({
        sql: `INSERT INTO competition (id,client_id,competitor,competitor_product,our_product,competitor_value,our_value,status,salesperson_id,notes,date)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          uid(),
          c.id,
          comp.name,
          product,
          'Solução CRM Pessoal',
          delta,
          ourValue,
          status,
          sp.id,
          status === 'Ganho'
            ? `Ganho a ${comp.name} pela proposta de valor no suporte local.`
            : status === 'Perdido'
              ? `Perdido para ${comp.name} por preço.`
              : status === 'Instalado'
                ? `${comp.name} já instalado; oportunidade de troca no fim do contrato.`
                : `Em avaliação direta contra ${comp.name}.`,
          daysAgo(Math.floor(Math.random() * 90)),
        ],
      });
      competitionCount++;
    }

    /* ═══════════════ ATRIBUIR COMERCIAIS AOS CLIENTES ═══════════════
       Distribuição em roda, não aleatória. Ao sortear, era possível — e
       aconteceu — um comercial ficar só com os dois clientes que nunca foram
       contactados, aparecendo com zeros em toda a tabela de Canais. Numa demo,
       uma linha morta levanta a pergunta errada: o avaliador pergunta se o
       cálculo está partido, não se o comercial trabalhou pouco.

       Os clientes sem atividade nenhuma (índices 7 e 13) são atribuídos por
       último, para não caírem todos no mesmo. */
    const semAtividade = new Set([7, 13]);
    const comAtividade = insertedClients.filter((_, i) => !semAtividade.has(i));
    const semNada = insertedClients.filter((_, i) => semAtividade.has(i));

    for (const [i, c] of [...comAtividade, ...semNada].entries()) {
      const sp = salespeople[i % salespeople.length];
      await db.execute({
        sql: `UPDATE clients SET salesperson_id=? WHERE id=?`,
        args: [sp.id, c.id],
      });
    }

    res.json({
      ok: true,
      inserted: {
        clients: insertedClients.length,
        interlocutors: interlocutorsCount,
        deals: insertedDeals.length,
        activities: activitiesCount,
        agenda: agendaCount,
        salespeople: salespeople.length,
        competition: competitionCount,
      },
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Falha ao executar seed', details: String(err) });
  }
});

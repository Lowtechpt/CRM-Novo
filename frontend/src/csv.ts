/**
 * Leitura de CSV.
 *
 * Escrito à mão em vez de trazer uma biblioteca: o formato que interessa aqui
 * é o que sai do Excel português — separador `;` ou `,`, aspas a proteger
 * campos com o separador lá dentro, e BOM no início do ficheiro.
 *
 * O BOM é a armadilha que apanha toda a gente: o Excel grava U+FEFF (um
 * carácter invisível) antes do primeiro cabeçalho, e sem o remover a coluna
 * `nome` passa a chamar-se `<BOM>nome` e nunca corresponde a nada.
 */

/** Deteta o separador pela primeira linha: o que aparecer mais vezes fora de aspas. */
function detetarSeparador(linha: string): string {
  let dentroDeAspas = false;
  let pontoEVirgula = 0;
  let virgula = 0;
  for (const ch of linha) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas && ch === ';') pontoEVirgula++;
    else if (!dentroDeAspas && ch === ',') virgula++;
  }
  return pontoEVirgula >= virgula ? ';' : ',';
}

/** Divide uma linha respeitando aspas e aspas duplicadas (`""` = `"` literal). */
function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (ch === sep && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += ch;
    }
  }
  campos.push(atual.trim());
  return campos;
}

/**
 * Cabeçalhos aceites, em português e inglês.
 * O servidor aceita as duas formas; aqui normaliza-se para reduzir surpresas.
 */
const COLUNAS: Record<string, string> = {
  nome: 'name',
  name: 'name',
  empresa: 'name',
  nif: 'nif',
  contribuinte: 'nif',
  setor: 'sector',
  sector: 'sector',
  estado: 'status',
  status: 'status',
  contacto: 'contact',
  contact: 'contact',
  email: 'email',
  telefone: 'phone',
  phone: 'phone',
  localidade: 'city',
  cidade: 'city',
  city: 'city',
  notas: 'notes',
  notes: 'notes',
  score: 'score',
};

const normalizarCabecalho = (h: string) =>
  h
    // Redundante na prática — o `.trim()` a seguir já apanha o BOM, porque a
    // spec do ECMAScript classifica U+FEFF como espaço em branco. Fica
    // explícito na mesma: a remoção passa a ser intenção declarada em vez de
    // efeito colateral de outra operação, e sobrevive a alguém trocar a ordem
    // ou tirar o `trim`.
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export interface ResultadoCsv {
  linhas: Record<string, string>[];
  /** Cabeçalhos que não correspondem a campo nenhum — avisar em vez de ignorar. */
  colunasIgnoradas: string[];
}

export function lerCsv(texto: string): ResultadoCsv {
  const linhas = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim());

  if (!linhas.length) return { linhas: [], colunasIgnoradas: [] };

  const sep = detetarSeparador(linhas[0]);
  const cabecalhos = dividirLinha(linhas[0], sep).map(normalizarCabecalho);

  const colunasIgnoradas = cabecalhos.filter((h) => h && !COLUNAS[h]);

  const registos = linhas.slice(1).map((linha) => {
    const valores = dividirLinha(linha, sep);
    const registo: Record<string, string> = {};
    cabecalhos.forEach((h, i) => {
      const campo = COLUNAS[h];
      if (campo && valores[i]) registo[campo] = valores[i];
    });
    return registo;
  });

  return {
    linhas: registos.filter((r) => Object.keys(r).length > 0),
    colunasIgnoradas,
  };
}

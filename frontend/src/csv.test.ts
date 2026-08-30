import { describe, it, expect } from 'vitest';
import { lerCsv } from './csv';

/**
 * Leitura de CSV.
 *
 * O ficheiro real vem do Excel português, não de um gerador limpo: separador
 * `;`, BOM no início, acentos nos cabeçalhos, campos com vírgulas dentro de
 * aspas. Cada um destes casos parte um parser ingénuo de forma diferente.
 */

describe('lerCsv', () => {
  it('lê o formato mais comum: ponto e vírgula', () => {
    const r = lerCsv('nome;nif;cidade\nMóveis Alentejo;501234567;Évora');
    expect(r.linhas).toEqual([{ name: 'Móveis Alentejo', nif: '501234567', city: 'Évora' }]);
  });

  it('lê separado por vírgulas', () => {
    const r = lerCsv('name,email\nTechNova,geral@technova.pt');
    expect(r.linhas[0]).toEqual({ name: 'TechNova', email: 'geral@technova.pt' });
  });

  it('remove o BOM que o Excel põe antes do primeiro cabeçalho', () => {
    // Com o BOM por remover, a coluna chama-se "<BOM>nome", não corresponde a
    // nada, e a importação corre sem erro sem importar uma única linha.
    // Isto fixa o COMPORTAMENTO, não a implementação: hoje quem remove o BOM é
    // o `trim()` (U+FEFF conta como espaço em branco na spec), e o teste passa
    // na mesma se a linha do regex desaparecer — de propósito.
    // O BOM vai como escape (`\uFEFF`) e não como carácter literal: invisível
    // no editor, seria apagado por engano e o teste passaria a passar sempre.
    const r = lerCsv('\uFEFFnome;cidade\nCafé Costa;Lisboa');
    expect(r.linhas[0].name).toBe('Café Costa');
  });

  it('respeita o separador dentro de aspas', () => {
    const r = lerCsv('nome;notas\n"Silva, Irmãos Lda";"Pediu proposta; aguarda resposta"');
    expect(r.linhas[0].name).toBe('Silva, Irmãos Lda');
    expect(r.linhas[0].notes).toBe('Pediu proposta; aguarda resposta');
  });

  it('trata aspas duplicadas como aspas literais', () => {
    const r = lerCsv('nome\n"Empresa ""A"" Lda"');
    expect(r.linhas[0].name).toBe('Empresa "A" Lda');
  });

  it('aceita cabeçalhos em português e em inglês', () => {
    const pt = lerCsv('nome;telefone;localidade\nX;911;Porto');
    const en = lerCsv('name,phone,city\nX,911,Porto');
    expect(pt.linhas[0]).toEqual(en.linhas[0]);
  });

  it('ignora acentuação e maiúsculas nos cabeçalhos', () => {
    const r = lerCsv('NOME;Localidade;NOTAS\nX;Braga;nota');
    expect(r.linhas[0]).toEqual({ name: 'X', city: 'Braga', notes: 'nota' });
  });

  it('avisa das colunas que não reconhece, em vez de as engolir', () => {
    const r = lerCsv('nome;faturacao_anual\nX;100000');
    expect(r.colunasIgnoradas).toContain('faturacao_anual');
    expect(r.linhas[0]).toEqual({ name: 'X' });
  });

  it('aceita fim de linha do Windows', () => {
    const r = lerCsv('nome;cidade\r\nX;Porto\r\nY;Braga');
    expect(r.linhas).toHaveLength(2);
  });

  it('ignora linhas vazias', () => {
    const r = lerCsv('nome\nX\n\n\nY\n');
    expect(r.linhas).toHaveLength(2);
  });

  it('devolve vazio para ficheiro vazio ou só com cabeçalho', () => {
    expect(lerCsv('').linhas).toEqual([]);
    expect(lerCsv('nome;cidade').linhas).toEqual([]);
  });

  it('não inclui campos vazios no registo', () => {
    // Um campo vazio não é o mesmo que "apagar o valor": não deve ser enviado.
    const r = lerCsv('nome;email;cidade\nX;;Porto');
    expect(r.linhas[0]).toEqual({ name: 'X', city: 'Porto' });
    expect('email' in r.linhas[0]).toBe(false);
  });
});

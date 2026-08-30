import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runMigrations = vi.hoisted(() => vi.fn());
const initAuthSchema = vi.hoisted(() => vi.fn());

vi.mock('./migrations.js', () => ({ runMigrations }));
vi.mock('./auth.js', async (original) => {
  const real = await original<typeof import('./auth.js')>();
  return { ...real, initAuthSchema };
});

const NODE_ENV = process.env.NODE_ENV;
const VERCEL = process.env.VERCEL;

describe('garantirPronta', () => {
  beforeEach(() => {
    vi.resetModules();
    runMigrations.mockReset();
    initAuthSchema.mockReset();
    // O guarda de teste é lido a cada chamada; desligado aqui para exercitar
    // o caminho real de arranque.
    process.env.NODE_ENV = 'production';
    // Como em serverless: sem isto o módulo chama `app.listen` ao ser
    // carregado e consome a primeira tentativa antes do teste lhe tocar.
    process.env.VERCEL = '1';
  });

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV;
    if (VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = VERCEL;
  });

  it('corre as migrações uma única vez quando tem sucesso', async () => {
    runMigrations.mockResolvedValue(undefined);
    initAuthSchema.mockResolvedValue(undefined);

    const { garantirPronta } = await import('./server.js');
    await garantirPronta();
    await garantirPronta();
    await garantirPronta();

    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it('volta a tentar depois de falhar, em vez de ficar preso na rejeição', async () => {
    runMigrations.mockRejectedValueOnce(new Error('rede indisponível'));
    runMigrations.mockResolvedValue(undefined);
    initAuthSchema.mockResolvedValue(undefined);

    const { garantirPronta } = await import('./server.js');

    await expect(garantirPronta()).rejects.toThrow('rede indisponível');

    // A segunda chamada tem de tentar de novo. Guardar a promessa rejeitada
    // fazia a instância devolver o mesmo erro até ser reciclada.
    await expect(garantirPronta()).resolves.toBeUndefined();
    expect(runMigrations).toHaveBeenCalledTimes(2);
  });

  it('não repete o arranque depois de recuperar', async () => {
    runMigrations.mockRejectedValueOnce(new Error('falha'));
    runMigrations.mockResolvedValue(undefined);
    initAuthSchema.mockResolvedValue(undefined);

    const { garantirPronta } = await import('./server.js');
    await expect(garantirPronta()).rejects.toThrow();
    await garantirPronta();
    await garantirPronta();

    expect(runMigrations).toHaveBeenCalledTimes(2);
  });
});

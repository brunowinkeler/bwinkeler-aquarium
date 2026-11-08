import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { drawingPhoto, tvStatus } from './support';

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

async function openTv(browser: Browser): Promise<{ tv: Page; code: string }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'pt-BR',
  });
  const tv = await context.newPage();
  await tv.goto('/tv/');
  await tv.getByRole('button', { name: 'Novo aquário' }).click();
  const code = tv.getByTestId('join-code');
  await expect(code).toHaveText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/);
  return { tv, code: (await code.textContent()) ?? '' };
}

async function openPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'pt-BR' });
  return context.newPage();
}

test('rejects a wrong join code', async ({ browser }) => {
  const phone = await openPhone(browser);
  await phone.goto('/join');
  await phone.getByLabel('Código da TV').fill('ABC');
  await phone.getByRole('button', { name: 'Entrar' }).click();
  await expect(phone.getByRole('alert')).toHaveText('Digite os 6 caracteres do código.');
  await phone.getByLabel('Código da TV').fill('ZZZ-ZZZ');
  await phone.getByRole('button', { name: 'Entrar' }).click();
  await expect(phone.getByRole('alert')).toHaveText(
    'Código inválido ou expirado. Peça um novo código na TV.',
  );
});

test('a drawing photographed on the phone swims on the TV', async ({ browser }) => {
  const { tv, code } = await openTv(browser);
  const phone = await openPhone(browser);

  await phone.goto(`/join?code=${code.replace('-', '')}`);
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Entrar' }).click();
  await expect(phone.getByTestId('tv-status')).toHaveText('TV conectada');
  await expect.poll(async () => (await tvStatus(tv)).phoneCount).toBe(1);
  await expect(tv.getByTestId('join-code')).toBeHidden();
  await expectAccessible(phone);

  await phone.getByTestId('gallery-input').setInputFiles({
    name: 'drawing.png',
    mimeType: 'image/png',
    buffer: drawingPhoto(),
  });
  await expect(phone.getByRole('heading', { name: 'Ajuste os cantos da folha' })).toBeVisible();
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Continuar' }).click();
  await expect(phone.getByRole('img', { name: 'Prévia animada da criatura' })).toBeVisible();
  await phone.getByRole('radio', { name: 'Peixe' }).check();
  await phone.getByLabel('Nome (opcional)').fill('Olivia');
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Enviar para a TV' }).click();
  await expect(phone.getByText('Já está nadando na TV!')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await tvStatus(tv)).creatures.length).toBe(1);

  await phone.getByRole('link', { name: 'Ver o aquário' }).click();
  await expect(phone.getByRole('listitem')).toHaveCount(1);
  await expect(phone.getByText('por Olivia')).toBeVisible();
  await expectAccessible(phone);

  await tv.keyboard.press('Escape');
  await tv.getByRole('button', { name: 'Encerrar aquário' }).click();
  await expect(tv.getByText('O aquário terminou.')).toBeVisible();
  await phone.goto('/');
  await expect(phone.getByText('Este aquário terminou. Crie um novo na TV.')).toBeVisible();
});

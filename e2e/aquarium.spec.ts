import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { drawingPhoto, templatePhoto, tvStatus } from './support';

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
  // Creation can wait on a cold Worker and Durable Objects when run against production.
  await expect(code).toHaveText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/, { timeout: 20_000 });
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

  await phone.goto(`/join/?code=${code.replace('-', '')}`);
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
  // The radios are visually hidden: click their chip, as a person would.
  await phone.locator('label', { hasText: 'Grande' }).click();
  await expect(phone.getByRole('radio', { name: 'Grande' })).toBeChecked();
  await phone.getByLabel('Nome (opcional)').fill('Olivia');
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Enviar para a TV' }).click();
  await expect(phone.getByText('Já está nadando na TV!')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await tvStatus(tv)).creatures.length).toBe(1);

  await phone.getByRole('link', { name: 'Ver o aquário' }).click();
  await expect(phone.getByRole('listitem')).toHaveCount(1);
  await expect(phone.getByText('por Olivia')).toBeVisible();
  await expect(phone.getByText('Peixe · Grande')).toBeVisible();
  await expectAccessible(phone);

  // A photographed printed template skips the corners and picks the kind. Phones that open the
  // site root, which used to be their app, land in /join/.
  await phone.goto('/');
  await expect(phone).toHaveURL((url) => url.pathname === '/join/');
  await phone.getByRole('link', { name: 'Modelos para imprimir' }).click();
  await expect(phone.getByRole('heading', { name: 'Modelos para imprimir' })).toBeVisible();
  await expect(phone.getByRole('link', { name: /Baixar PDF/ })).toHaveCount(5);
  await expectAccessible(phone);
  await phone.getByRole('link', { name: 'Voltar' }).click();
  await phone.getByTestId('gallery-input').setInputFiles({
    name: 'template.png',
    mimeType: 'image/png',
    buffer: await templatePhoto(phone, '/join/templates/pt-BR/walk.svg'),
  });
  await expect(
    phone.getByText('Modelo reconhecido: os cantos foram encontrados sozinhos.'),
  ).toBeVisible();
  await expect(phone.getByRole('img', { name: 'Prévia animada da criatura' })).toBeVisible();
  await expect(phone.getByRole('radio', { name: 'Caranguejo' })).toBeChecked();
  await phone.getByRole('button', { name: 'Enviar para a TV' }).click();
  await expect(phone.getByText('Já está nadando na TV!')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await tvStatus(tv)).creatures.length).toBe(2);

  // A photo is only cropped: no paper removal.
  await phone.getByRole('link', { name: 'Enviar outro desenho' }).click();
  await phone.getByTestId('gallery-input').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: drawingPhoto(),
  });
  await expect(phone.getByRole('heading', { name: 'Ajuste os cantos da folha' })).toBeVisible();
  await phone.locator('label', { hasText: 'Uma foto' }).click();
  await expect(phone.getByRole('heading', { name: 'Recorte a foto' })).toBeVisible();
  await phone.getByRole('button', { name: 'Foto inteira' }).click();
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Continuar' }).click();
  await expect(phone.getByRole('img', { name: 'Prévia animada da criatura' })).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Ajustar recorte' })).toBeVisible();
  await expect(phone.getByText('Ajustes', { exact: true })).toBeHidden();
  await phone.getByRole('button', { name: 'Enviar para a TV' }).click();
  await expect(phone.getByText('Já está nadando na TV!')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await tvStatus(tv)).creatures.length).toBe(3);

  // Removal asks inside the page; window.confirm is suppressed by some browsers.
  await phone.getByRole('link', { name: 'Ver o aquário' }).click();
  await expect(phone.getByRole('listitem')).toHaveCount(3);
  await phone.getByRole('button', { name: 'Remover' }).first().click();
  await expect(phone.getByText('Remover esta criatura do aquário?')).toBeVisible();
  await expectAccessible(phone);
  await phone.getByRole('button', { name: 'Sim, remover' }).click();
  await expect(phone.getByRole('listitem')).toHaveCount(2);
  await expect.poll(async () => (await tvStatus(tv)).creatures.length).toBe(2);

  await tv.keyboard.press('Escape');
  await tv.getByRole('button', { name: 'Encerrar aquário' }).click();
  await expect(tv.getByText('O aquário terminou.')).toBeVisible();
  await phone.goto('/join/');
  await expect(phone.getByText('Este aquário terminou. Crie um novo na TV.')).toBeVisible();
});

test('the site root is driven with clicks', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    locale: 'pt-BR',
  });
  const pc = await context.newPage();
  // /pc/ was its address before the site root.
  await pc.goto('/pc/');
  await expect(pc).toHaveURL((url) => url.pathname === '/');
  // English by default, whatever the browser's language; the switch is remembered on the device.
  await expect(pc.getByRole('button', { name: 'New aquarium' })).toBeVisible();
  await pc.getByRole('button', { name: 'Português' }).click();
  await expect(pc.getByRole('button', { name: 'English' })).toBeVisible();
  await pc.reload();
  await pc.getByRole('button', { name: 'Novo aquário' }).click();
  await expect(pc.getByRole('button', { name: 'English' })).toBeHidden();
  const code = pc.getByTestId('join-code');
  await expect(code).toHaveText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/, { timeout: 20_000 });
  expect((await tvStatus(pc)).pointer).toBe(true);

  await pc.getByRole('button', { name: 'Fechar' }).click();
  await expect(code).toBeHidden();
  await pc.getByRole('button', { name: 'Mostrar código' }).click();
  await expect(code).toBeVisible();
  await pc.getByRole('button', { name: 'Esconder código' }).click();
  await expect(code).toBeHidden();

  const sound = pc.getByRole('button', { name: 'Som: ligado' });
  await sound.click();
  await expect(pc.getByRole('button', { name: 'Som: desligado' })).toBeVisible();
  expect((await tvStatus(pc)).sound).toBe('off');

  // Light quality draws 720 lines and lets the browser scale them up.
  await pc.getByRole('button', { name: 'Menu' }).click();
  expect((await tvStatus(pc)).resolution).toBe('1600x900');
  await pc.getByRole('button', { name: 'Qualidade: alta' }).click();
  await expect(pc.getByRole('button', { name: 'Qualidade: leve (720p)' })).toBeVisible();
  expect((await tvStatus(pc)).resolution).toBe('1280x720');
  await pc.getByRole('button', { name: 'Contador de FPS: desligado' }).click();
  await expect(pc.getByRole('button', { name: 'Contador de FPS: ligado' })).toBeVisible();
  await expect(pc.getByText(/^\d+ FPS · 1280×720$/)).toBeVisible();

  // The toolbar and the phone count fade out while the mouse rests, and come back when it moves.
  await pc.getByRole('button', { name: 'Voltar ao aquário' }).click();
  const phones = pc.getByText('nenhum celular');
  await expect(phones).toHaveCSS('opacity', '0', { timeout: 10_000 });
  await pc.mouse.move(800, 450);
  await expect(phones).toHaveCSS('opacity', '1');

  await pc.getByRole('button', { name: 'Menu' }).click();
  await pc.getByRole('button', { name: 'Encerrar aquário' }).click();
  await expect(pc.getByText('O aquário terminou.')).toBeVisible();
});

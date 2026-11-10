const PT = {
  title: 'Aquário',
  tagline: 'Desenhe uma criatura do mar, fotografe com o celular e veja-a nadar aqui.',
  newAquarium: 'Novo aquário',
  creating: 'Criando o aquário…',
  joinTitle: 'Entre neste aquário!',
  joinOpen: 'Abra {host} no celular',
  joinStep2: 'Digite o código ou leia o QR code',
  joinHint: 'Voltar: fechar',
  chip: 'OK: mostrar código · {phones}',
  phonesNone: 'nenhum celular',
  phonesOne: '1 celular',
  phonesMany: '{count} celulares',
  menuTitle: 'Menu',
  menuShowCode: 'Mostrar código',
  menuDisconnect: 'Desconectar celulares',
  menuEnd: 'Encerrar aquário',
  menuClose: 'Voltar ao aquário',
  soundOn: 'Som: ligado',
  soundOff: 'Som: desligado',
  qualityFull: 'Qualidade: alta',
  qualityLight: 'Qualidade: leve (720p)',
  fpsOn: 'Contador de FPS: ligado',
  fpsOff: 'Contador de FPS: desligado',
  toolCode: 'Mostrar código',
  toolHideCode: 'Esconder código',
  toolFullscreen: 'Tela cheia',
  toolExitFullscreen: 'Sair da tela cheia',
  toolMenu: 'Menu',
  close: 'Fechar',
  languageSwitch: 'English',
  ended: 'O aquário terminou.',
  expired: 'O aquário expirou.',
  replaced: 'Este aquário foi aberto em outra tela.',
  offline: 'Sem conexão. Tentando de novo…',
  toastCreature: 'Novo desenho de {name}!',
  toastCreatureAnonymous: 'Novo desenho!',
  toastPhone: 'Um celular entrou no aquário',
  toastDisconnected: 'Celulares desconectados',
  errorCreate: 'Não foi possível criar o aquário. Tente de novo.',
  errorBusy: 'Muitos aquários abertos agora. Tente mais tarde.',
  errorLimit: 'Limite de novos aquários atingido. Tente mais tarde.',
};

export type TextKey = keyof typeof PT;

const EN: Record<TextKey, string> = {
  title: 'Aquarium',
  tagline: 'Draw a sea creature, photograph it with your phone, and watch it swim here.',
  newAquarium: 'New aquarium',
  creating: 'Creating the aquarium…',
  joinTitle: 'Join this aquarium!',
  joinOpen: 'Open {host} on your phone',
  joinStep2: 'Type the code or scan the QR code',
  joinHint: 'Back: close',
  chip: 'OK: show code · {phones}',
  phonesNone: 'no phones',
  phonesOne: '1 phone',
  phonesMany: '{count} phones',
  menuTitle: 'Menu',
  menuShowCode: 'Show code',
  menuDisconnect: 'Disconnect phones',
  menuEnd: 'End aquarium',
  menuClose: 'Back to the aquarium',
  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  qualityFull: 'Quality: high',
  qualityLight: 'Quality: light (720p)',
  fpsOn: 'FPS counter: on',
  fpsOff: 'FPS counter: off',
  toolCode: 'Show code',
  toolHideCode: 'Hide code',
  toolFullscreen: 'Full screen',
  toolExitFullscreen: 'Exit full screen',
  toolMenu: 'Menu',
  close: 'Close',
  languageSwitch: 'Português',
  ended: 'The aquarium has ended.',
  expired: 'The aquarium has expired.',
  replaced: 'This aquarium was opened on another screen.',
  offline: 'No connection. Retrying…',
  toastCreature: 'New drawing from {name}!',
  toastCreatureAnonymous: 'New drawing!',
  toastPhone: 'A phone joined the aquarium',
  toastDisconnected: 'Phones disconnected',
  errorCreate: 'The aquarium could not be created. Try again.',
  errorBusy: 'Too many aquariums are open right now. Try again later.',
  errorLimit: 'The limit of new aquariums was reached. Try again later.',
};

/** The same values as the phone app, which stores its choice under the same key. */
export type Language = 'pt-BR' | 'en';

/** `?lang=` first, then the choice saved on this device, then `fallback` or the browser. */
export function pickLanguage(saved: string | null, fallback: Language | null): Language {
  const forced = /[?&]lang=(pt|en)/.exec(window.location.search);
  if (forced) return forced[1] === 'en' ? 'en' : 'pt-BR';
  if (saved === 'pt-BR' || saved === 'en') return saved;
  if (fallback) return fallback;
  return (navigator.language || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'pt-BR';
}

let current: Language = pickLanguage(null, null);
let catalogue: Record<TextKey, string> = current === 'en' ? EN : PT;

export function currentLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = language;
  catalogue = language === 'en' ? EN : PT;
}

export function text(key: TextKey, params?: { [name: string]: string | number }): string {
  const template = catalogue[key];
  if (!params) return template;
  return template.replace(/\{([a-z]+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export function phonesText(count: number): string {
  if (count === 0) return text('phonesNone');
  return count === 1 ? text('phonesOne') : text('phonesMany', { count });
}

/** Fills every element that has a `data-text` key. */
export function applyTexts(root: ParentNode): void {
  const nodes = root.querySelectorAll('[data-text]');
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as HTMLElement;
    node.textContent = text(node.getAttribute('data-text') as TextKey);
  }
  document.documentElement.lang = current;
  document.title = text('title');
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallationState {
  installed: boolean;
  prompt: InstallPromptEvent | null;
}

const standalone = window.matchMedia('(display-mode: standalone)');
const listeners = new Set<() => void>();
let initialized = false;
let state: InstallationState = { installed: isStandalone(), prompt: null };

function isStandalone(): boolean {
  return standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function publish(next: InstallationState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function initializePwaInstallation() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    if (state.installed) return;
    event.preventDefault();
    publish({ installed: false, prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => publish({ installed: true, prompt: null }));
  standalone.addEventListener('change', () => {
    publish({ installed: isStandalone(), prompt: null });
  });
}

export function subscribePwaInstallation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPwaInstallationState() {
  return state;
}

export async function installPwa() {
  const prompt = state.prompt;
  if (!prompt) return;
  // A prompt can only be used once. Clear it before awaiting the browser dialog.
  publish({ ...state, prompt: null });
  await prompt.prompt();
  await prompt.userChoice;
}

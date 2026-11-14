// Toolbar, toasts, help and hiding the interface (PRD 6.10).
export function createToolbar(actions: Record<'undo' | 'redo' | 'save' | 'copy', () => void>) {
  const help = document.getElementById('help') as HTMLDialogElement;
  const toastElement = document.getElementById('toast')!;
  let toastTimer = 0;

  const button = (action: string) => document.querySelector<HTMLButtonElement>(`#toolbar [data-action="${action}"]`)!;
  for (const action of ['undo', 'redo', 'save', 'copy'] as const) button(action).addEventListener('click', actions[action]);
  button('help').addEventListener('click', () => help.showModal());

  return {
    help,
    setHistory(canUndo: boolean, canRedo: boolean) {
      button('undo').disabled = !canUndo;
      button('redo').disabled = !canRedo;
    },
    toast(message: string) {
      toastElement.textContent = message;
      toastElement.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastElement.classList.remove('show'), 4000);
    },
    toggleHelp() {
      if (help.open) help.close();
      else help.showModal();
    },
    toggleInterface() {
      if (document.body.classList.toggle('hud-hidden')) this.toast('Interface hidden. Press / to show it.');
    },
  };
}

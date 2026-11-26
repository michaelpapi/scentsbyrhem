// The arched "door" in the custom-order section. Full width: a small pop, nothing more (the button beside it does the asking).
// Narrow screens: the door is the way in, so a tap pops it and opens the custom-order sheet.
export function initDoor() {
  const door = document.querySelector<HTMLButtonElement>('[data-door]');
  if (!door) return;
  const narrow = matchMedia('(max-width: 55.99rem)');
  const sync = () => {
    door.tabIndex = narrow.matches ? 0 : -1;
    if (narrow.matches) door.removeAttribute('aria-hidden'); else door.setAttribute('aria-hidden', 'true');
  };
  sync(); narrow.addEventListener('change', sync);
  door.addEventListener('animationend', (e) => { if (e.animationName === 'door-pop') door.classList.remove('pop'); });
  door.addEventListener('click', () => {
    door.classList.remove('pop'); void door.offsetWidth; door.classList.add('pop');
    if (narrow.matches) setTimeout(() => document.dispatchEvent(new Event('open-custom')), 170);
  });
}

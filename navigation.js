(() => {
  const getMenu = () => document.getElementById('nav-menu');
  const getBurger = () => document.querySelector('.menu-burger');

  function setMenu(open) {
    const menu = getMenu();
    const burger = getBurger();
    if (!menu) return;
    menu.classList.toggle('active', open);
    burger?.setAttribute('aria-expanded', String(open));
    burger?.querySelector('i')?.classList.toggle('fa-bars', !open);
    burger?.querySelector('i')?.classList.toggle('fa-xmark', open);
  }

  window.toggleMenu = () => setMenu(!getMenu()?.classList.contains('active'));

  document.addEventListener('DOMContentLoaded', () => {
    const menu = getMenu();
    const burger = getBurger();
    if (!menu || !burger) return;
    burger.addEventListener('click', event => {
      event.stopPropagation();
      window.toggleMenu();
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a, button')) setMenu(false);
    });
    document.addEventListener('click', event => {
      if (!menu.classList.contains('active') || menu.contains(event.target) || burger.contains(event.target)) return;
      setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setMenu(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) setMenu(false);
    });
  });
})();

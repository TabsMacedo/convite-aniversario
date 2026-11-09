(() => {
  const countdown = document.querySelector('[data-countdown-at]');
  if (!countdown) return;
  // O deslocamento fixa o meio-dia de Araras mesmo para quem abre em outro fuso.
  const target = Date.parse(countdown.dataset.countdownAt);
  if (!Number.isFinite(target)) return;
  const timer = countdown.querySelector('.countdown-units');
  const message = countdown.querySelector('.countdown-message');
  const fields = Object.fromEntries(['days', 'hours', 'minutes', 'seconds'].map((unit) => [unit, countdown.querySelector(`[data-countdown-unit="${unit}"]`)]));
  let interval;

  function update() {
    const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    const values = {
      days: Math.floor(remaining / 86400),
      hours: Math.floor(remaining / 3600) % 24,
      minutes: Math.floor(remaining / 60) % 60,
      seconds: remaining % 60,
    };
    for (const [unit, value] of Object.entries(values)) fields[unit].textContent = String(value).padStart(2, '0');
    timer.setAttribute('aria-label', `${values.days} dias, ${values.hours} horas, ${values.minutes} minutos e ${values.seconds} segundos para a festa`);
    timer.hidden = remaining === 0;
    message.hidden = remaining !== 0;
    if (remaining === 0) {
      countdown.querySelector('#countdown-title').textContent = 'O replay começou!';
      clearInterval(interval);
    }
    return remaining;
  }

  function resume() {
    clearInterval(interval);
    if (!document.hidden && update() > 0) interval = setInterval(update, 1000);
  }

  // Recalcula pelo relógio, sem acumular atraso quando o celular suspende a aba.
  document.addEventListener('visibilitychange', resume);
  resume();
})();

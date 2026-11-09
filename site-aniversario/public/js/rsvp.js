const form = document.querySelector('#rsvp-form');
const button = document.querySelector('#submit-rsvp');
const message = document.querySelector('#rsvp-message');
let hasSavedResponse = false;
let sending = false;

function showMessage(text, error = false, focus = false) {
  message.textContent = text;
  message.classList.toggle('notice-error', error);
  message.hidden = false;
  if (focus) message.focus({ preventScroll: true });
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, credentials: 'same-origin', signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar agora. Tente novamente.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Não conseguimos confirmar o envio. Confira sua conexão e tente novamente.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function restoreResponse() {
  // Não substituir o que a pessoa já começou a escrever enquanto a consulta carrega.
  let edited = false;
  const markEdited = () => { edited = true; };
  form.addEventListener('input', markEdited);
  try {
    const { response } = await request('/api/rsvp');
    if (!response) return;
    hasSavedResponse = true;
    if (!edited) {
      form.elements.name.value = response.name;
      for (const radio of form.querySelectorAll('[name=status]')) radio.checked = radio.value === response.status;
      form.elements.note.value = response.note;
    }
    showMessage('Sua resposta já está salva. Se precisar mudar alguma coisa, é só ajustar e enviar de novo.');
  } catch {
    showMessage('Não conseguimos consultar uma resposta anterior agora. Você pode preencher e tentar enviar.', true);
  } finally {
    form.removeEventListener('input', markEdited);
    button.disabled = false;
    button.firstChild.textContent = hasSavedResponse ? 'Atualizar minha resposta ' : 'Enviar minha resposta ';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  if (!form.elements.name.value.trim()) { form.elements.name.setCustomValidity('Escreva seu nome para continuar.'); form.elements.name.reportValidity(); return; }
  sending = true;
  button.disabled = true;
  button.firstChild.textContent = 'Salvando sua resposta… ';
  message.hidden = true;
  form.setAttribute('aria-busy', 'true');
  try {
    const payload = { name: form.elements.name.value.trim(), status: new FormData(form).get('status'), note: form.elements.note.value.trim() };
    const result = await request('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    hasSavedResponse = true;
    const text = payload.status === 'yes' ? 'Já estou te esperando pra comemorar! ♡' : payload.status === 'maybe' ? 'Quando souber, volte aqui para me contar. ♡' : 'Obrigada por me avisar. Vai fazer falta! ♡';
    showMessage(`${result.message} ${text}`, false, true);
  } catch (error) { showMessage(error.message, true, true); }
  finally {
    sending = false;
    button.disabled = false;
    button.firstChild.textContent = hasSavedResponse ? 'Atualizar minha resposta ' : 'Enviar minha resposta ';
    form.removeAttribute('aria-busy');
  }
});
form.elements.name.addEventListener('input', () => form.elements.name.setCustomValidity(''));
restoreResponse();

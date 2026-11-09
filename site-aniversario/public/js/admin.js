const $ = (selector) => document.querySelector(selector);
const login = $('#login-section'), dashboard = $('#dashboard');
const labels = { yes: 'Vou', maybe: 'Talvez', no: 'Não vou' };
let responses = [];

function notify(element, text, error = false) {
  element.textContent = text;
  element.classList.toggle('notice-error', error);
  element.hidden = false;
}

function showLogin(text = '') {
  responses = [];
  $('#response-list').replaceChildren();
  for (const key of ['yes','maybe','no','total']) $(`#count-${key}`).textContent = '0';
  $('#search').value = '';
  $('#filter').value = 'all';
  dashboard.hidden = true;
  login.hidden = false;
  $('#password').value = '';
  $('#password').type = 'password';
  $('#toggle-password').textContent = 'Mostrar';
  $('#toggle-password').setAttribute('aria-pressed', 'false');
  $('#initial-loading').hidden = true;
  $('#login-message').hidden = !text;
  if (text) notify($('#login-message'), text, true);
}

async function api(url, options = {}, download = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) {
      const data = await response.json();
      const error = new Error(data.error || 'Não foi possível concluir. Tente novamente.');
      error.status = response.status;
      throw error;
    }
    return download ? await response.blob() : await response.json();
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Confira sua conexão e tente novamente.');
    throw error;
  } finally { clearTimeout(timer); }
}

function handleError(error) {
  if (error.status === 401) showLogin('Sua sessão terminou. Entre novamente para continuar.');
  else notify($('#dashboard-message'), error.message, true);
}

const formatDate = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function renderList() {
  const query = normalize($('#search').value.trim());
  const filter = $('#filter').value;
  const visible = responses.filter((row) => (filter === 'all' || row.status === filter) && normalize(`${row.name} ${row.note}`).includes(query));
  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'), status = document.createElement('td'), note = document.createElement('td'), date = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = row.name;
    name.append(strong);
    const badge = document.createElement('span');
    badge.className = `status-badge status-${row.status}`;
    badge.textContent = labels[row.status];
    status.append(badge);
    note.textContent = row.note || 'Sem observação.';
    date.textContent = formatDate(row.updated_at);
    tr.append(name, status, note, date);
    fragment.append(tr);
  }
  $('#response-list').replaceChildren(fragment);
  $('#empty-list').hidden = visible.length > 0;
  $('#empty-list').textContent = responses.length ? 'Nenhuma resposta encontrada com essa busca.' : 'Nenhuma resposta por aqui ainda. Assim que alguém responder, vai aparecer nesta lista. ♡';
  $('#list-summary').textContent = `${visible.length} de ${responses.length} ${responses.length === 1 ? 'resposta' : 'respostas'}`;
}

async function loadResponses(initial = false) {
  $('#refresh').disabled = true;
  try {
    const result = await api('/api/admin/responses');
    responses = result.responses;
    const totals = { yes: 0, maybe: 0, no: 0 };
    for (const row of responses) totals[row.status]++;
    for (const [key, count] of Object.entries(totals)) $(`#count-${key}`).textContent = String(count);
    $('#count-total').textContent = String(responses.length);
    $('#updated-at').textContent = `Atualizado em ${formatDate(new Date())}`;
    renderList();
    login.hidden = true;
    dashboard.hidden = false;
    $('#initial-loading').hidden = true;
    $('#dashboard-message').hidden = true;
    $('#password').value = '';
  } catch (error) {
    if (initial) showLogin(error.status === 401 ? '' : error.message);
    else handleError(error);
  } finally { $('#refresh').disabled = false; }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('#login-button').disabled) return;
  $('#login-button').disabled = true;
  $('#login-button').firstChild.textContent = 'Entrando… ';
  $('#login-message').hidden = true;
  try {
    await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
    await loadResponses(true);
  } catch (error) { notify($('#login-message'), error.message, true); }
  finally { $('#login-button').disabled = false; $('#login-button').firstChild.textContent = 'Entrar na minha área '; }
});

$('#toggle-password').addEventListener('click', () => {
  const visible = $('#password').type === 'password';
  $('#password').type = visible ? 'text' : 'password';
  $('#toggle-password').textContent = visible ? 'Ocultar' : 'Mostrar';
  $('#toggle-password').setAttribute('aria-pressed', String(visible));
});

$('#logout').addEventListener('click', async () => {
  $('#logout').disabled = true;
  try {
    await api('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    showLogin();
    $('#password').focus();
  } catch (error) { handleError(error); }
  finally { $('#logout').disabled = false; }
});

$('#download').addEventListener('click', async () => {
  $('#download').disabled = true;
  $('#download').firstChild.textContent = 'Preparando documento… ';
  try {
    const blob = await api('/api/admin/export.docx', {}, true);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Presencas-Tabata.docx';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    notify($('#dashboard-message'), 'Documento preparado! Confira os downloads do seu navegador.');
  } catch (error) { handleError(error); }
  finally { $('#download').disabled = false; $('#download').firstChild.textContent = 'Baixar lista em DOCX '; }
});

$('#refresh').addEventListener('click', () => loadResponses());
$('#search').addEventListener('input', renderList);
$('#filter').addEventListener('change', renderList);
loadResponses(true);

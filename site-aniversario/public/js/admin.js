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
  $('#companions-dialog').close();
  $('#companions-note').textContent = '';
  $('#companions-owner').textContent = '';
  $('#registered-companions').textContent = '';
  $('#companions-names').value = '';
  editingResponse = undefined;
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
  const visible = responses.filter((row) => (filter === 'all' || filter === 'review' && row.needs_review || row.status === filter) && normalize(`${row.name} ${row.note}`).includes(query));
  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'), status = document.createElement('td'), note = document.createElement('td'), date = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = row.name;
    name.append(strong);
    if (row.is_companion) {
      const description = document.createElement('small');
      description.className = 'companion-description';
      description.textContent = row.automatic ? 'Incluído pela observação' : 'Acompanhante';
      name.append(description);
    } else if (row.group_size) {
      const size = document.createElement('small');
      size.className = 'companion-description';
      size.textContent = `${row.group_size} ${row.group_size === 1 ? 'pessoa' : 'pessoas'} no grupo`;
      name.append(size);
    }
    const badge = document.createElement('span');
    badge.className = `status-badge status-${row.status}`;
    badge.textContent = labels[row.status];
    status.append(badge);
    note.textContent = row.note || 'Sem observação.';
    if (!row.is_companion) {
      if (row.needs_review) {
        const warning = document.createElement('p');
        warning.className = 'review-warning';
        warning.textContent = `Conferir: ${row.review_reason}`;
        note.append(warning);
      }
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'companion-edit';
      edit.textContent = 'Conferir acompanhantes';
      edit.setAttribute('aria-label', `Conferir acompanhantes de ${row.name}`);
      edit.addEventListener('click', () => openCompanions(row));
      note.append(edit);
    }
    date.textContent = formatDate(row.updated_at);
    tr.append(name, status, note, date);
    fragment.append(tr);
  }
  $('#response-list').replaceChildren(fragment);
  $('#empty-list').hidden = visible.length > 0;
  $('#empty-list').textContent = responses.length ? 'Nenhuma resposta encontrada com essa busca.' : 'Nenhuma resposta por aqui ainda. Assim que alguém responder, vai aparecer nesta lista. ♡';
  $('#list-summary').textContent = `${visible.length} de ${responses.length} ${responses.length === 1 ? 'pessoa' : 'pessoas'}`;
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
    const reviewCount = responses.filter((row) => row.needs_review).length;
    $('#review-summary').hidden = reviewCount === 0;
    if (reviewCount) $('#review-summary').textContent = `${reviewCount} ${reviewCount === 1 ? 'recado precisa' : 'recados precisam'} de conferência. O total considera as pessoas identificadas até agora; grupos sem quantidade clara ainda podem estar incompletos. Use o filtro “Observações para conferir”.`;
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
let editingResponse;
function openCompanions(row) {
  editingResponse = row.id;
  $('#companions-owner').textContent = `Convidado(a): ${row.name}`;
  $('#companions-note').textContent = row.note || 'Sem observação.';
  $('#registered-companions').textContent = row.registered_companions?.length ? `Já cadastrados e contados: ${row.registered_companions.join(', ')}.` : 'Nenhum acompanhante já cadastrado separadamente neste grupo.';
  $('#companions-names').value = (row.additional_companions || []).join('\n');
  $('#companions-message').hidden = true;
  $('#companions-dialog').showModal();
  $('#companions-names').focus();
}

async function saveCompanions(reset = false) {
  $('#save-companions').disabled = true;
  $('#reset-companions').disabled = true;
  try {
    const companions = $('#companions-names').value.split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
    const result = await api('/api/admin/companions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response_id: editingResponse, companions, reset }) });
    $('#companions-dialog').close();
    await loadResponses();
    if (!dashboard.hidden) notify($('#dashboard-message'), result.message);
  } catch (error) {
    if (error.status === 401) handleError(error);
    else notify($('#companions-message'), error.message, true);
  } finally {
    $('#save-companions').disabled = false;
    $('#reset-companions').disabled = false;
  }
}
$('#companions-form').addEventListener('submit', (event) => { event.preventDefault(); saveCompanions(); });
$('#reset-companions').addEventListener('click', () => saveCompanions(true));
$('#close-companions').addEventListener('click', () => $('#companions-dialog').close());
loadResponses(true);

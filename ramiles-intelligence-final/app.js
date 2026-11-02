/* RAMILES INTELLIGENCE — static, Vercel-ready application */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => globalThis.crypto?.randomUUID?.() || `ri-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeHttpUrl = value => { try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const safeImageUrl = value => { const raw = String(value || ''); return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(raw) ? raw : safeHttpUrl(raw); };
  const clamp = (value, min, max) => { const numeric = Number(value); return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : min)); };
  const DEFAULT_CENTER = [0, 20];
  const DB_NAME = 'ramiles-intelligence';
  const STORE_NAME = 'projects';

  const makePanel = (type = 'text') => ({ id: uid(), type, title: type === 'news' ? 'Título da notícia' : type === 'image' ? 'Imagem e contexto' : type === 'data' ? 'Indicador' : 'Novo painel', body: '', source: '', date: '', url: '', image: '', credit: '', position: 'bottom-left', value: '', unit: '', period: '' });
  const makeScene = (index, overrides = {}) => ({ id: uid(), title: `Cena ${String(index).padStart(2,'0')}`, displayTitle: '', location: 'Visão global', center: [...DEFAULT_CENTER], zoom: 1.6, transitionMs: 1800, selectedCountry: '', panels: [], markers: [], routes: [], polygons: [], presenterNotes: '', requiringReview: false, ...overrides });
  const makeDemoProject = () => {
    const scenes = [
      makeScene(1, { title: 'Contexto regional', displayTitle: 'O tabuleiro geopolítico', location: 'Visão global', center: [42, 25], zoom: 2.2, presenterNotes: 'Cena de demonstração. Apresente o contexto e a localização regional.', panels: [Object.assign(makePanel('text'), { title: 'BRIEFING / CONTEXTO', body: 'Este é um projeto de demonstração. Substitua este texto por informações verificadas e atribua as fontes antes de gravar.', position: 'top-right' })] }),
      makeScene(2, { title: 'Irã', displayTitle: 'Irã: posição geográfica', location: 'Irã', center: [53.7, 32.2], zoom: 4.1, selectedCountry: 'Iran', presenterNotes: 'Exemplo de enquadramento de país. Os destaques são visuais; acrescente contexto factual com fontes.' }),
      makeScene(3, { title: 'Estreito de Ormuz', displayTitle: 'O Estreito de Ormuz', location: 'Estreito de Ormuz', center: [56.5, 26.6], zoom: 7.2, presenterNotes: 'Ponto geográfico ilustrativo para demonstrar o zoom cinematográfico.', markers: [{ id: uid(), name: 'Estreito de Ormuz', description: 'Marcador demonstrativo — confira a posição e acrescente uma descrição factual.', coordinates: [56.5, 26.6], color: '#e2b86e' }] }),
      makeScene(4, { title: 'Rotas marítimas', displayTitle: 'Conexões e rotas', location: 'Golfo Pérsico / Golfo de Omã', center: [56.2, 25.9], zoom: 5.6, routes: [{ id: uid(), name: 'Rota ilustrativa', coordinates: [[51.5, 27.8], [54.1, 26.7], [56.5, 26.6], [59.1, 24.8]], color: '#e2b86e' }], panels: [Object.assign(makePanel('text'), { title: 'ROTA ILUSTRATIVA', body: 'Linha cenográfica para demonstrar rotas. Não representa rastreamento ou tráfego marítimo em tempo real.', position: 'bottom-left' })] }),
      makeScene(5, { title: 'Região ampliada', displayTitle: 'O entorno estratégico', location: 'Golfo Pérsico', center: [52.5, 27.5], zoom: 4.6, presenterNotes: 'Use esta cena para comparar países, cidades, portos ou pontos relevantes.' }),
      makeScene(6, { title: 'Mercados', displayTitle: 'Possíveis impactos econômicos', location: 'Região do Golfo', center: [54.5, 27], zoom: 3.8, panels: [Object.assign(makePanel('data'), { title: 'INDICADOR / EXEMPLO', value: '—', unit: 'unidade', period: 'período', body: 'Insira aqui um dado confirmado, período, unidade e fonte.' })], presenterNotes: 'Não inserir números sem fonte, data e unidade.' })
    ];
    return { id: uid(), version: 1, title: 'Demonstração — Irã e Estreito de Ormuz', updatedAt: Date.now(), scenes, activeSceneId: scenes[0].id, isDemo: true };
  };

  let project = makeDemoProject();
  let activeTab = 'scene';
  let map = null;
  let presentationMap = null;
  let mapReady = false;
  let countryGeoJSON = null;
  let mapTool = 'select';
  let draftCoordinates = [];
  let toastTimer = null;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let history = [];
  let future = [];
  let projects = [];
  let presentationMode = false;
  let currentMapSceneId = null;
  let lastCameraKey = '';
  let countryFetchPromise = null;

  function toast(message, duration = 2800) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), duration);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Este navegador não oferece armazenamento local IndexedDB.'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento local.'));
    });
  }

  async function dbPut(value) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Salvamento cancelado.'));
    });
    db.close();
  }

  async function dbAll() {
    const db = await openDatabase();
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function dbDelete(id) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function setSaveStatus(state) {
    const node = $('#saveStatus');
    node.classList.toggle('unsaved', state !== 'saved');
    node.innerHTML = `<i></i>${state === 'saved' ? 'SALVO LOCALMENTE' : state === 'saving' ? 'SALVANDO…' : 'ERRO AO SALVAR'}`;
  }

  function scheduleSave() {
    setSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snapshot = { ...clone(project), updatedAt: Date.now() };
      saveQueue = saveQueue.then(() => dbPut(snapshot)).then(async () => {
        setSaveStatus('saved');
        projects = await dbAll();
      }).catch(error => {
        console.error(error);
        setSaveStatus('error');
        toast('Não foi possível salvar. Exporte um backup JSON.');
      });
    }, 450);
  }

  function commit(mutator, options = {}) {
    if (options.history !== false) {
      history.push(clone(project));
      if (history.length > 40) history.shift();
      future = [];
    }
    const next = clone(project);
    mutator(next);
    next.updatedAt = Date.now();
    if (!next.scenes?.length) next.scenes = [makeScene(1)];
    if (!next.scenes.some(scene => scene.id === next.activeSceneId)) next.activeSceneId = next.scenes[0].id;
    project = next;
    scheduleSave();
    render();
  }

  function undo() {
    if (!history.length) return toast('Nada para desfazer.');
    future.push(clone(project));
    project = history.pop();
    scheduleSave(); render();
  }
  function redo() {
    if (!future.length) return toast('Nada para refazer.');
    history.push(clone(project));
    project = future.pop();
    scheduleSave(); render();
  }

  const activeScene = () => project.scenes.find(scene => scene.id === project.activeSceneId) || project.scenes[0];
  function updateActiveScene(patch) { commit(next => { const scene = next.scenes.find(item => item.id === next.activeSceneId); Object.assign(scene, patch); }); }
  function selectScene(id) {
    if (!project.scenes.some(scene => scene.id === id)) return;
    commit(next => { next.activeSceneId = id; }, { history: false });
  }

  function addScene() {
    const scene = makeScene(project.scenes.length + 1, { title: `Cena ${String(project.scenes.length + 1).padStart(2,'0')}`, center: [...activeScene().center], zoom: activeScene().zoom });
    commit(next => { next.scenes.push(scene); next.activeSceneId = scene.id; });
    activeTab = 'scene'; renderInspector();
    toast('Nova cena criada.');
  }
  function duplicateScene() {
    const original = activeScene();
    const copy = clone(original);
    copy.id = uid(); copy.title = `${original.title} — cópia`;
    copy.panels = copy.panels.map(panel => ({ ...panel, id: uid() }));
    copy.markers = copy.markers.map(marker => ({ ...marker, id: uid() }));
    copy.routes = copy.routes.map(route => ({ ...route, id: uid() }));
    copy.polygons = (copy.polygons || []).map(polygon => ({ ...polygon, id: uid() }));
    commit(next => { const index = next.scenes.findIndex(scene => scene.id === original.id); next.scenes.splice(index + 1, 0, copy); next.activeSceneId = copy.id; });
    toast('Cena duplicada.');
  }
  function deleteScene() {
    if (project.scenes.length === 1) return toast('O projeto precisa ter pelo menos uma cena.');
    if (!confirm(`Excluir a cena “${activeScene().title}”?`)) return;
    commit(next => { const index = next.scenes.findIndex(scene => scene.id === next.activeSceneId); next.scenes.splice(index, 1); next.activeSceneId = next.scenes[Math.max(0, index - 1)].id; });
  }
  function moveScene(id, direction) {
    commit(next => {
      const index = next.scenes.findIndex(scene => scene.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.scenes.length) return;
      [next.scenes[index], next.scenes[target]] = [next.scenes[target], next.scenes[index]];
    });
  }

  function renderSceneStrip() {
    $('#sceneCount').textContent = `${String(project.scenes.length).padStart(2,'0')} ${project.scenes.length === 1 ? 'CENA' : 'CENAS'}`;
    $('#sceneStrip').innerHTML = project.scenes.map((scene, index) => `
      <button class="scene-card ${scene.id === project.activeSceneId ? 'active' : ''}" data-scene-id="${escapeHTML(scene.id)}" title="Selecionar ${escapeHTML(scene.title)}">
        <span class="scene-card-number">${String(index + 1).padStart(2,'0')}</span><span class="scene-card-type">${scene.selectedCountry ? 'COUNTRY FOCUS' : 'SCENE'}</span>
        <strong>${escapeHTML(scene.title || `Cena ${index + 1}`)}</strong><small>${escapeHTML(scene.location || 'Local não definido')}</small>
      </button>`).join('');
  }

  function field(label, name, value, opts = {}) {
    const id = `field-${name}`;
    const type = opts.type || 'text';
    if (type === 'textarea') return `<div class="field-group"><label class="field-label" for="${id}">${label}</label><textarea id="${id}" class="field textarea" data-field="${name}" rows="${opts.rows || 3}" placeholder="${escapeHTML(opts.placeholder || '')}">${escapeHTML(value)}</textarea>${opts.help ? `<div class="field-help">${opts.help}</div>` : ''}</div>`;
    if (type === 'select') return `<div class="field-group"><label class="field-label" for="${id}">${label}</label><select id="${id}" class="field" data-field="${name}">${opts.options.map(([v, text]) => `<option value="${escapeHTML(v)}" ${String(value) === String(v) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select></div>`;
    return `<div class="field-group"><label class="field-label" for="${id}">${label}</label><input id="${id}" class="field" data-field="${name}" type="${type}" value="${escapeHTML(value)}" ${opts.min !== undefined ? `min="${opts.min}"` : ''} ${opts.max !== undefined ? `max="${opts.max}"` : ''} ${opts.step ? `step="${opts.step}"` : ''} placeholder="${escapeHTML(opts.placeholder || '')}" /></div>`;
  }

  function renderSceneTab(scene) {
    return `
      <div class="section-heading">CONFIGURAÇÃO DA CENA <span>${String(project.scenes.findIndex(item => item.id === scene.id) + 1).padStart(2,'0')} / ${String(project.scenes.length).padStart(2,'0')}</span></div>
      ${field('TÍTULO INTERNO','title',scene.title,{placeholder:'Nome para organização'})}
      ${field('MANCHETE NA APRESENTAÇÃO','displayTitle',scene.displayTitle,{placeholder:'Título que aparece no vídeo'})}
      ${field('LOCALIZAÇÃO / REGIÃO','location',scene.location,{placeholder:'País, cidade, estreito, região...'})}
      <div class="field-row">${field('LONGITUDE','longitude',scene.center[0],{type:'number',min:-180,max:180,step:'0.0001'})}${field('LATITUDE','latitude',scene.center[1],{type:'number',min:-85,max:85,step:'0.0001'})}</div>
      <div class="field-group"><label class="field-label">NÍVEL DE ZOOM</label><div class="range-row"><input data-field="zoom" type="range" min="1" max="14" step="0.1" value="${scene.zoom}"/><span class="range-value">${Number(scene.zoom).toFixed(1)}×</span></div></div>
      ${field('DURAÇÃO DA TRANSIÇÃO','transitionMs',scene.transitionMs,{type:'select',options:[[700,'Rápida · 0,7s'],[1200,'Curta · 1,2s'],[1800,'Média · 1,8s'],[2800,'Longa · 2,8s'],[4200,'Cinematográfica · 4,2s']]})}
      ${field('NOTAS DO APRESENTADOR · PRIVADAS','presenterNotes',scene.presenterNotes,{type:'textarea',rows:4,placeholder:'Notas que não aparecem na gravação...'})}
      <div class="button-row"><button class="button" data-action="overview">◎ VISÃO GLOBAL</button><button class="button" data-action="save-camera">⌖ SALVAR ENQUADRAMENTO</button></div>
      ${scene.requiringReview ? `<div class="empty-state" style="border-color:#9b7542;color:#e1bd7b;margin-bottom:13px">⚠ RASCUNHO DE IA — revise localização, coordenadas e conteúdo antes de apresentar.</div>` : ''}
      ${scene.selectedCountry ? `<div class="field-group"><label class="field-label">PAÍS DESTACADO</label><div class="element-card"><strong>${escapeHTML(scene.selectedCountry)}</strong><div class="element-actions"><button class="button" data-action="clear-country">REMOVER DESTAQUE</button></div></div></div>` : ''}
      <div class="field-help">Dica: navegue no mapa, ajuste o zoom e use “Salvar enquadramento” para gravar a câmera na cena.</div>`;
  }

  function renderPanelCard(panel, index) {
    const typeName = ({ text: 'PAINEL DE TEXTO', news: 'CARTÃO DE NOTÍCIA', image: 'CARTÃO DE IMAGEM', data: 'INDICADOR / DADO' })[panel.type] || 'PAINEL';
    return `<article class="element-card" data-panel-card="${escapeHTML(panel.id)}"><div class="element-card-head"><span>${String(index + 1).padStart(2,'0')} / ${typeName}</span><button class="text-button" data-action="delete-panel" data-id="${escapeHTML(panel.id)}">REMOVER ×</button></div>
      <div class="field-group"><label class="field-label">TÍTULO</label><input class="field" data-panel-field="title" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.title)}" /></div>
      ${panel.type === 'data' ? `<div class="field-row"><div class="field-group"><label class="field-label">VALOR</label><input class="field" data-panel-field="value" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.value)}" placeholder="Ex.: 12,4" /></div><div class="field-group"><label class="field-label">UNIDADE</label><input class="field" data-panel-field="unit" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.unit)}" placeholder="% / USD" /></div></div><div class="field-group"><label class="field-label">PERÍODO</label><input class="field" data-panel-field="period" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.period)}" placeholder="Ex.: 2026 / 3º trimestre" /></div>` : ''}
      ${panel.type !== 'image' ? `<div class="field-group"><label class="field-label">${panel.type === 'news' ? 'RESUMO / CONTEXTO' : 'TEXTO'}</label><textarea class="field textarea" data-panel-field="body" data-id="${escapeHTML(panel.id)}" rows="3" placeholder="Adicione o conteúdo...">${escapeHTML(panel.body)}</textarea></div>` : ''}
      ${panel.type === 'news' ? `<div class="field-row"><div class="field-group"><label class="field-label">FONTE</label><input class="field" data-panel-field="source" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.source)}" placeholder="Veículo / instituição" /></div><div class="field-group"><label class="field-label">DATA</label><input class="field" data-panel-field="date" data-id="${escapeHTML(panel.id)}" type="date" value="${escapeHTML(panel.date)}" /></div></div><div class="field-group"><label class="field-label">URL DA FONTE</label><input class="field" data-panel-field="url" data-id="${escapeHTML(panel.id)}" type="url" value="${escapeHTML(panel.url)}" placeholder="https://..." /></div>` : ''}
      ${(panel.type === 'image' || panel.type === 'news') ? `<div class="field-group"><label class="field-label">IMAGEM · URL</label><input class="field" data-panel-field="image" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.image)}" placeholder="https://..." /></div><label class="button file-label">＋ <span>CARREGAR IMAGEM LOCAL</span><input type="file" accept="image/*" hidden data-panel-upload="${escapeHTML(panel.id)}" /></label><div class="field-group"><label class="field-label">LEGENDA / CRÉDITO</label><input class="field" data-panel-field="credit" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.credit)}" placeholder="Crédito e contexto da imagem" /></div>` : ''}
      ${panel.type !== 'news' ? `<div class="field-group"><label class="field-label">FONTE / CRÉDITO</label><input class="field" data-panel-field="source" data-id="${escapeHTML(panel.id)}" value="${escapeHTML(panel.source)}" placeholder="Fonte do dado ou conteúdo" /></div>` : ''}
      <div class="field-group"><label class="field-label">POSIÇÃO NA APRESENTAÇÃO</label><select class="field" data-panel-field="position" data-id="${escapeHTML(panel.id)}">${[['top-left','Superior esquerdo'],['top-right','Superior direito'],['bottom-left','Inferior esquerdo'],['bottom-right','Inferior direito'],['center','Centro']].map(([value,label])=>`<option value="${value}" ${panel.position===value?'selected':''}>${label}</option>`).join('')}</select></div>
      ${safeHttpUrl(panel.url) ? `<a class="field-help" href="${escapeHTML(safeHttpUrl(panel.url))}" target="_blank" rel="noopener noreferrer">ABRIR FONTE ORIGINAL ↗</a>` : ''}
      ${panel.image ? `<div class="field-help">Imagem adicionada. Ela será exibida no cartão da apresentação.</div>` : ''}
    </article>`;
  }

  function renderElementsTab(scene) {
    const markers = (scene.markers || []).map((marker, index) => `<article class="element-card"><div class="element-card-head"><span>${String(index+1).padStart(2,'0')} / MARCADOR</span><button class="text-button" data-action="delete-marker" data-id="${escapeHTML(marker.id)}">REMOVER ×</button></div><div class="field-group"><label class="field-label">NOME</label><input class="field" data-marker-field="name" data-id="${escapeHTML(marker.id)}" value="${escapeHTML(marker.name)}" /></div><div class="field-group"><label class="field-label">DESCRIÇÃO</label><textarea class="field textarea" data-marker-field="description" data-id="${escapeHTML(marker.id)}" rows="2">${escapeHTML(marker.description)}</textarea></div><div class="field-row"><div class="field-group"><label class="field-label">LONGITUDE</label><input class="field" type="number" step="0.0001" data-marker-coordinate="0" data-id="${escapeHTML(marker.id)}" value="${marker.coordinates[0]}" /></div><div class="field-group"><label class="field-label">LATITUDE</label><input class="field" type="number" step="0.0001" data-marker-coordinate="1" data-id="${escapeHTML(marker.id)}" value="${marker.coordinates[1]}" /></div></div><div class="field-group"><label class="field-label">COR</label><input class="field" type="color" data-marker-field="color" data-id="${escapeHTML(marker.id)}" value="${escapeHTML(marker.color)}" /></div></article>`).join('');
    const routes = (scene.routes || []).map((route, index) => `<article class="element-card"><div class="element-card-head"><span>${String(index+1).padStart(2,'0')} / ROTA ILUSTRATIVA</span><button class="text-button" data-action="delete-route" data-id="${escapeHTML(route.id)}">REMOVER ×</button></div><div class="field-group"><label class="field-label">NOME DA ROTA</label><input class="field" data-route-field="name" data-id="${escapeHTML(route.id)}" value="${escapeHTML(route.name)}" /></div><div class="field-group"><label class="field-label">COR</label><input class="field" type="color" data-route-field="color" data-id="${escapeHTML(route.id)}" value="${escapeHTML(route.color)}" /></div><div class="field-help">${route.coordinates.length} pontos · elemento gráfico ilustrativo, não é rastreamento em tempo real.</div></article>`).join('');
    const polygons = (scene.polygons || []).map((polygon, index) => `<article class="element-card"><div class="element-card-head"><span>${String(index+1).padStart(2,'0')} / ÁREA / POLÍGONO</span><button class="text-button" data-action="delete-polygon" data-id="${escapeHTML(polygon.id)}">REMOVER ×</button></div><input class="field" data-polygon-field="name" data-id="${escapeHTML(polygon.id)}" value="${escapeHTML(polygon.name)}" /><div class="field-help">${polygon.coordinates.length} vértices · área ilustrativa.</div></article>`).join('');
    return `<div class="section-heading">BIBLIOTECA DE ELEMENTOS <span>EDITORIAL</span></div>
      <div class="add-element-grid"><button class="add-element" data-add-panel="text">＋<strong>Texto</strong><small>Contexto e narrativa</small></button><button class="add-element" data-add-panel="news">＋<strong>Notícia</strong><small>Fonte, data e link</small></button><button class="add-element" data-add-panel="image">＋<strong>Imagem</strong><small>URL ou upload local</small></button><button class="add-element" data-add-panel="data">＋<strong>Indicador</strong><small>Valor, unidade e fonte</small></button></div>
      <div class="section-heading" style="margin-top:20px">PAINÉIS <span>${scene.panels.length}</span></div>${scene.panels.length ? scene.panels.map(renderPanelCard).join('') : '<div class="empty-state">Nenhum painel nesta cena. Adicione texto, notícia, imagem ou indicador para compor a narrativa.</div>'}
      <div class="section-heading" style="margin-top:20px">MARCADORES <span>${scene.markers.length}</span></div>${markers || '<div class="empty-state">Use a ferramenta de marcador no mapa e clique no local desejado.</div>'}
      <div class="section-heading" style="margin-top:20px">ROTAS <span>${scene.routes.length}</span></div>${routes || '<div class="empty-state">Selecione a ferramenta de rota e clique em dois ou mais pontos do mapa.</div>'}
      <div class="section-heading" style="margin-top:20px">ÁREAS / POLÍGONOS <span>${(scene.polygons||[]).length}</span></div>${polygons || '<div class="empty-state">Selecione a ferramenta de área e clique nos vértices; dê duplo clique para concluir.</div>'}`;
  }

  function renderProjectTab() {
    const list = projects.map(item => `<div class="project-list-item"><div><strong>${escapeHTML(item.title)}</strong><small>${item.scenes?.length || 0} cenas · ${new Date(item.updatedAt || Date.now()).toLocaleDateString('pt-BR')}</small></div><div class="element-actions"><button class="button" data-action="open-project" data-id="${escapeHTML(item.id)}">ABRIR</button><button class="button" data-action="delete-project" data-id="${escapeHTML(item.id)}">×</button></div></div>`).join('');
    return `<div class="section-heading">GESTÃO DO PROJETO <span>LOCAL</span></div><div class="empty-state">Os projetos e imagens são armazenados neste navegador. Exporte um JSON regularmente para manter uma cópia de segurança. Limpar os dados do navegador pode apagar os projetos.</div><div class="button-row"><button class="button" data-action="new-project">＋ NOVO PROJETO</button><button class="button" data-action="export">⇩ EXPORTAR JSON</button></div><div class="button-row"><button class="button" data-action="import">⇧ IMPORTAR JSON</button><button class="button" data-action="reset-demo">↺ RESTAURAR DEMO</button></div><div class="section-heading" style="margin-top:18px">PROJETOS SALVOS <span>${projects.length}</span></div>${list || '<div class="empty-state">Ainda não há outros projetos salvos neste navegador.</div>'}`;
  }

  function renderInspector() {
    const scene = activeScene();
    $('#projectTitle').value = project.title;
    $$('.inspector-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === activeTab));
    const content = $('#inspectorContent');
    content.innerHTML = activeTab === 'scene' ? renderSceneTab(scene) : activeTab === 'elements' ? renderElementsTab(scene) : renderProjectTab();
    $('#undoBtn').disabled = history.length === 0;
    $('#redoBtn').disabled = future.length === 0;
  }

  function render() {
    renderSceneStrip();
    renderInspector();
    renderMapForScene();
  }

  function loadCountries() {
    if (countryFetchPromise) return countryFetchPromise;
    countryFetchPromise = fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(response => { if (!response.ok) throw new Error('Não foi possível carregar a camada de países.'); return response.json(); })
      .then(data => { countryGeoJSON = data; return data; })
      .catch(error => { countryFetchPromise = null; console.warn(error); toast('Camada de países indisponível. O mapa base continua funcionando.'); return null; });
    return countryFetchPromise;
  }

  function emptyFeatureCollection() { return { type: 'FeatureCollection', features: [] }; }
  function sceneGeoJSON(scene, key) {
    const features = [];
    if (key === 'markers') (scene.markers || []).forEach(marker => features.push({ type:'Feature', geometry:{type:'Point',coordinates:marker.coordinates}, properties:{id:marker.id,name:marker.name,description:marker.description,color:marker.color || '#e2b86e'} }));
    if (key === 'routes') (scene.routes || []).forEach(route => { if (route.coordinates?.length >= 2) features.push({ type:'Feature', geometry:{type:'LineString',coordinates:route.coordinates}, properties:{id:route.id,name:route.name,color:route.color || '#e2b86e'} }); });
    if (key === 'polygons') (scene.polygons || []).forEach(polygon => { if (polygon.coordinates?.length >= 3) { const coords = [...polygon.coordinates]; if (JSON.stringify(coords[0]) !== JSON.stringify(coords[coords.length-1])) coords.push(coords[0]); features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[coords]},properties:{id:polygon.id,name:polygon.name,color:polygon.color || '#d94b58'}}); } });
    return { type:'FeatureCollection', features };
  }

  function addMapLayers(target, scene) {
    if (target.getSource('ri-countries')) return;
    target.addSource('ri-countries', { type:'geojson', data: emptyFeatureCollection() });
    const firstSymbolLayer = target.getStyle()?.layers?.find(layer => layer.type === 'symbol')?.id;
    target.addLayer({ id:'ri-country-fill', type:'fill', source:'ri-countries', paint:{ 'fill-color':['case',['boolean',['get','riSelected'],false],'#d6384b','#9eacb8'], 'fill-opacity':['case',['boolean',['get','riSelected'],false],0.34,0.015] } }, firstSymbolLayer);
    target.addLayer({ id:'ri-country-outline', type:'line', source:'ri-countries', paint:{ 'line-color':['case',['boolean',['get','riSelected'],false],'#f15b68','#a88a5a'], 'line-width':['case',['boolean',['get','riSelected'],false],2.4,0.45], 'line-opacity':['case',['boolean',['get','riSelected'],false],1,0.28] } }, firstSymbolLayer);
    target.addLayer({ id:'ri-country-labels', type:'symbol', source:'ri-countries', minzoom:3.1, layout:{'text-field':['get','ADMIN'],'text-font':['Open Sans Regular'],'text-size':10,'text-letter-spacing':0.08,'text-allow-overlap':false}, paint:{'text-color':'#d3dce3','text-halo-color':'#111923','text-halo-width':1.2,'text-opacity':0.78} });
    target.addSource('ri-markers', { type:'geojson', data:emptyFeatureCollection() });
    target.addLayer({id:'ri-marker-circles',type:'circle',source:'ri-markers',paint:{'circle-radius':8,'circle-color':['get','color'],'circle-stroke-color':'#f4e6c9','circle-stroke-width':1.5,'circle-opacity':0.96}});
    target.addLayer({id:'ri-marker-labels',type:'symbol',source:'ri-markers',layout:{'text-field':['get','name'],'text-font':['Open Sans Semibold'],'text-size':11,'text-offset':[0,1.35],'text-anchor':'top','text-allow-overlap':true},paint:{'text-color':'#f0e4cc','text-halo-color':'#0b121b','text-halo-width':1.5}});
    target.addSource('ri-routes', {type:'geojson',data:emptyFeatureCollection()});
    target.addLayer({id:'ri-route-lines',type:'line',source:'ri-routes',paint:{'line-color':['get','color'],'line-width':2.8,'line-opacity':0.95,'line-dasharray':[1.5,1]}});
    target.addLayer({id:'ri-route-arrows',type:'symbol',source:'ri-routes',layout:{'symbol-placement':'line','text-field':'➤','text-font':['Open Sans Regular'],'text-size':15,'text-keep-upright':true,'symbol-spacing':110},paint:{'text-color':['get','color'],'text-halo-color':'#101923','text-halo-width':1.3}});
    target.addSource('ri-polygons', {type:'geojson',data:emptyFeatureCollection()});
    target.addLayer({id:'ri-polygon-fill',type:'fill',source:'ri-polygons',paint:{'fill-color':['get','color'],'fill-opacity':0.18}});
    target.addLayer({id:'ri-polygon-line',type:'line',source:'ri-polygons',paint:{'line-color':['get','color'],'line-width':2,'line-dasharray':[2,1]}});
    target.on('click','ri-country-fill', event => {
      const feature = event.features?.[0];
      const name = feature?.properties?.ADMIN;
      if (name && target === map) {
        updateActiveScene({ selectedCountry: name, location: name });
        $('#countryToast').textContent = `PAÍS EM DESTAQUE · ${name.toUpperCase()}`;
        $('#countryToast').classList.remove('hidden');
        toast(`${name} destacado na cena.`);
      }
    });
    target.on('mousemove','ri-country-fill', event => {
      if (target !== map) return;
      const name = event.features?.[0]?.properties?.ADMIN;
      if (name) { $('#countryToast').textContent = `PAÍS · ${name.toUpperCase()}`; $('#countryToast').classList.remove('hidden'); }
      if (mapTool === 'select') target.getCanvas().style.cursor = 'pointer';
    });
    target.on('mouseleave','ri-country-fill',() => {
      if (target !== map) return;
      target.getCanvas().style.cursor = mapTool === 'select' ? '' : 'crosshair';
      const selected = activeScene().selectedCountry;
      $('#countryToast').classList.toggle('hidden', !selected);
      if (selected) $('#countryToast').textContent = `PAÍS EM DESTAQUE · ${selected.toUpperCase()}`;
    });
    target.on('click','ri-marker-circles', event => {
      const props = event.features?.[0]?.properties;
      if (props?.name && target === map) toast(`${props.name}${props.description ? ` — ${props.description}` : ''}`);
    });
    loadCountries().then(data => { if (data && target.getSource('ri-countries')) { target.getSource('ri-countries').setData(data); const liveScene = (target === map || target === presentationMap) ? activeScene() : scene; updateMapLayers(target, liveScene); } });
    updateMapLayers(target, scene);
  }

  function updateMapLayers(target, scene) {
    if (!target || !target.isStyleLoaded()) return;
    const countrySource = target.getSource('ri-countries');
    if (countrySource && countryGeoJSON) {
      const selected = (scene.selectedCountry || '').toLowerCase();
      const data = clone(countryGeoJSON);
      data.features = data.features.map(feature => ({ ...feature, properties:{...feature.properties,riSelected:String(feature.properties?.ADMIN || '').toLowerCase() === selected} }));
      countrySource.setData(data);
    }
    const markerSource = target.getSource('ri-markers'); if (markerSource) markerSource.setData(sceneGeoJSON(scene,'markers'));
    const routeSource = target.getSource('ri-routes'); if (routeSource) routeSource.setData(sceneGeoJSON(scene,'routes'));
    const polygonSource = target.getSource('ri-polygons'); if (polygonSource) polygonSource.setData(sceneGeoJSON(scene,'polygons'));
  }

  function createMap(container, scene, onClick, isPresentation = false) {
    if (!window.maplibregl) {
      toast('A biblioteca do mapa não carregou. Verifique a conexão e recarregue a página.');
      return null;
    }
    const target = new maplibregl.Map({ container, style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', center:scene.center || DEFAULT_CENTER, zoom:scene.zoom || 1.6, pitch:0, bearing:0, attributionControl:true, renderWorldCopies:true, cooperativeGestures:true });
    target.addControl(new maplibregl.NavigationControl({showCompass:true,visualizePitch:true}), 'bottom-right');
    target.doubleClickZoom.disable();
    if (!isPresentation) target.on('moveend', () => updateMapReadouts());
    target.on('load', () => {
      const liveScene = (isPresentation || target === map) ? activeScene() : scene;
      addMapLayers(target, liveScene);
      if (!isPresentation) { mapReady = true; updateMapReadouts(); }
      else if (liveScene.id !== scene.id) target.flyTo({center:liveScene.center,zoom:liveScene.zoom,duration:liveScene.transitionMs || 1800,essential:true});
    });
    if (onClick) target.on('click', event => onClick([Number(event.lngLat.lng.toFixed(5)), Number(event.lngLat.lat.toFixed(5))], event));
    target.on('dblclick', () => { if (!isPresentation && mapTool === 'polygon') finishPolygon(); });
    target.on('error', event => { if (event?.error) console.warn('MapLibre:', event.error.message || event.error); });
    return target;
  }

  function renderMapForScene() {
    const scene = activeScene();
    $('#mapSceneTitle').textContent = (scene.displayTitle || scene.title || 'GLOBAL SITUATION').toUpperCase();
    $('#mapLocation').textContent = (scene.location || 'LOCAL NÃO DEFINIDO').toUpperCase();
    $('#countryToast').classList.toggle('hidden', !scene.selectedCountry);
    if (scene.selectedCountry) $('#countryToast').textContent = `PAÍS EM DESTAQUE · ${scene.selectedCountry.toUpperCase()}`;
    if (!map) {
      map = createMap($('#map'), scene, handleMapClick);
      return;
    }
    if (!mapReady || !map.isStyleLoaded()) return;
    const cameraKey = `${scene.id}:${scene.center[0]}:${scene.center[1]}:${scene.zoom}:${scene.transitionMs}`;
    if (cameraKey !== lastCameraKey) {
      lastCameraKey = cameraKey;
      map.flyTo({center:scene.center,zoom:scene.zoom,duration:scene.id === currentMapSceneId ? 500 : scene.transitionMs || 1800,essential:true,curve:1.35});
      currentMapSceneId = scene.id;
    }
    updateMapLayers(map, scene);
    updateMapReadouts();
  }

  function updateMapReadouts(coords) {
    if (coords) $('#coordinateReadout').textContent = `${Math.abs(coords[1]).toFixed(4)}° ${coords[1] >= 0 ? 'N' : 'S'}  /  ${Math.abs(coords[0]).toFixed(4)}° ${coords[0] >= 0 ? 'E' : 'W'}`;
    else if (map) { const center = map.getCenter(); $('#coordinateReadout').textContent = `${Math.abs(center.lat).toFixed(4)}° ${center.lat >= 0 ? 'N' : 'S'}  /  ${Math.abs(center.lng).toFixed(4)}° ${center.lng >= 0 ? 'E' : 'W'}`; }
    if (map) $('#zoomReadout').textContent = `ZOOM ${map.getZoom().toFixed(1)}×`;
  }

  function setMapTool(tool) {
    mapTool = tool; draftCoordinates = [];
    $$('[data-map-action]').forEach(button => button.classList.toggle('active', button.dataset.mapAction === tool));
    const hints = {select:'Clique em um país para destacá-lo · Arraste para navegar',marker:'Clique no mapa para adicionar um marcador',route:'Clique em dois pontos para criar uma rota ilustrativa',polygon:'Clique nos vértices; dê duplo clique para fechar a área'};
    $('#mapHint').textContent = hints[tool] || hints.select;
    if (map) map.getCanvas().style.cursor = tool === 'select' ? '' : 'crosshair';
  }

  function handleMapClick(coords, event) {
    updateMapReadouts(coords);
    if (mapTool === 'select') return;
    if (mapTool === 'marker') {
      const marker = {id:uid(),name:'Novo marcador',description:'',coordinates:coords,color:'#e2b86e'};
      updateActiveScene({markers:[...activeScene().markers,marker]});
      activeTab = 'elements'; renderInspector(); setMapTool('select'); toast('Marcador adicionado. Edite o nome e a descrição em Elementos.');
    } else if (mapTool === 'route' || mapTool === 'polygon') {
      if (mapTool === 'polygon' && draftCoordinates.length && Math.hypot(draftCoordinates[draftCoordinates.length-1][0]-coords[0], draftCoordinates[draftCoordinates.length-1][1]-coords[1]) < 0.0005) return;
      draftCoordinates.push(coords);
      if (mapTool === 'route' && draftCoordinates.length >= 2) {
        const route = {id:uid(),name:'Nova rota ilustrativa',coordinates:[...draftCoordinates],color:'#e2b86e'};
        updateActiveScene({routes:[...activeScene().routes,route]});
        activeTab = 'elements'; renderInspector(); setMapTool('select'); toast('Rota adicionada.');
      } else toast(`${draftCoordinates.length} ponto(s) registrados.`);
    }
  }

  function finishPolygon() {
    if (draftCoordinates.length < 3) return toast('Uma área precisa de pelo menos três vértices.');
    const polygon = {id:uid(),name:'Nova área ilustrativa',coordinates:[...draftCoordinates],color:'#d94b58'};
    updateActiveScene({polygons:[...(activeScene().polygons || []),polygon]});
    activeTab = 'elements'; renderInspector(); setMapTool('select'); toast('Área adicionada.');
  }

  function addPanel(type) {
    const panel = makePanel(type);
    updateActiveScene({panels:[...activeScene().panels,panel]});
    activeTab = 'elements'; renderInspector();
    toast('Elemento adicionado.');
  }

  function exportProject() {
    const payload = { ...clone(project), version:1, exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${(project.title || 'ramiles-project').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'ramiles-project'}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup JSON exportado.');
  }

  function validateProject(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.scenes) || !data.scenes.length) throw new Error('O arquivo não contém uma lista válida de cenas.');
    if (data.scenes.length > 300) throw new Error('O projeto excede o limite de 300 cenas.');
    const scenes = data.scenes.map((scene, index) => {
      if (!scene || typeof scene !== 'object') throw new Error(`Cena ${index + 1} inválida.`);
      const center = Array.isArray(scene.center) && scene.center.length === 2 ? [clamp(scene.center[0],-180,180),clamp(scene.center[1],-85,85)] : [...DEFAULT_CENTER];
      const safeList = key => Array.isArray(scene[key]) ? scene[key].filter(item => item && typeof item === 'object') : [];
      const panels = safeList('panels').map(panel => ({
        ...makePanel(['text','news','image','data'].includes(panel.type) ? panel.type : 'text'), ...panel,
        id:typeof panel.id === 'string' ? panel.id : uid(), title:String(panel.title || '').slice(0,180), body:String(panel.body || '').slice(0,3000),
        source:String(panel.source || '').slice(0,180), date:String(panel.date || '').slice(0,40), url:safeHttpUrl(panel.url),
        image:safeImageUrl(panel.image), credit:String(panel.credit || '').slice(0,240), value:String(panel.value || '').slice(0,80),
        unit:String(panel.unit || '').slice(0,40), period:String(panel.period || '').slice(0,80),
        position:['top-left','top-right','bottom-left','bottom-right','center'].includes(panel.position) ? panel.position : 'bottom-left'
      }));
      const markers = safeList('markers').map(marker => ({
        id:typeof marker.id === 'string' ? marker.id : uid(), name:String(marker.name || 'Marcador').slice(0,120),
        description:String(marker.description || '').slice(0,600), coordinates:Array.isArray(marker.coordinates) && marker.coordinates.length === 2 ? [clamp(marker.coordinates[0],-180,180),clamp(marker.coordinates[1],-85,85)] : [...center],
        color:/^#[0-9a-f]{6}$/i.test(marker.color || '') ? marker.color : '#e2b86e', icon:String(marker.icon || '●').slice(0,8)
      }));
      const routes = safeList('routes').map(route => ({
        id:typeof route.id === 'string' ? route.id : uid(), name:String(route.name || 'Rota ilustrativa').slice(0,120),
        coordinates:(Array.isArray(route.coordinates) ? route.coordinates : []).filter(point => Array.isArray(point) && point.length === 2).map(point => [clamp(point[0],-180,180),clamp(point[1],-85,85)]).slice(0,100),
        color:/^#[0-9a-f]{6}$/i.test(route.color || '') ? route.color : '#e2b86e'
      })).filter(route => route.coordinates.length >= 2);
      const polygons = safeList('polygons').map(polygon => ({
        id:typeof polygon.id === 'string' ? polygon.id : uid(), name:String(polygon.name || 'Área ilustrativa').slice(0,120),
        coordinates:(Array.isArray(polygon.coordinates) ? polygon.coordinates : []).filter(point => Array.isArray(point) && point.length === 2).map(point => [clamp(point[0],-180,180),clamp(point[1],-85,85)]).slice(0,100),
        color:/^#[0-9a-f]{6}$/i.test(polygon.color || '') ? polygon.color : '#d94b58'
      })).filter(polygon => polygon.coordinates.length >= 3);
      return { ...makeScene(index + 1), ...scene, id:typeof scene.id === 'string' ? scene.id : uid(), title:String(scene.title || `Cena ${index+1}`).slice(0,120), displayTitle:String(scene.displayTitle || '').slice(0,160), location:String(scene.location || 'Local não definido').slice(0,160), center, zoom:clamp(scene.zoom,1,18), transitionMs:clamp(scene.transitionMs,200,10000), selectedCountry:String(scene.selectedCountry || '').slice(0,120), presenterNotes:String(scene.presenterNotes || '').slice(0,5000), panels, markers, routes, polygons };
    });
    return { id:typeof data.id === 'string' ? data.id : uid(), version:1, title:String(data.title || 'Projeto importado').slice(0,90), updatedAt:Date.now(), scenes, activeSceneId:scenes.some(scene => scene.id === data.activeSceneId) ? data.activeSceneId : scenes[0].id, isDemo:false };
  }

  async function importProjectFile(file) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast('O arquivo excede o limite de 30 MB.');
    try {
      const data = JSON.parse(await file.text());
      const imported = validateProject(data);
      history.push(clone(project)); future = [];
      project = imported; activeTab = 'scene';
      await dbPut(project); projects = await dbAll();
      render(); setSaveStatus('saved'); toast('Projeto importado e salvo localmente.');
    } catch (error) { toast(`Falha na importação: ${error.message || 'arquivo inválido'}`, 5000); }
  }

  async function newProject() {
    const title = prompt('Nome da nova apresentação:', 'Nova apresentação');
    if (!title?.trim()) return;
    const scene = makeScene(1);
    history.push(clone(project)); future = [];
    project = {id:uid(),version:1,title:title.trim().slice(0,90),updatedAt:Date.now(),scenes:[scene],activeSceneId:scene.id};
    activeTab = 'scene'; await dbPut(project); projects = await dbAll(); render(); toast('Novo projeto criado.');
  }

  async function loadProject(id) {
    const found = projects.find(item => item.id === id);
    if (!found) return;
    history.push(clone(project)); future = [];
    project = validateProject(found); activeTab = 'scene'; render(); toast('Projeto aberto.');
  }

  async function removeProject(id) {
    if (id === project.id) return toast('O projeto aberto não pode ser excluído.');
    const found = projects.find(item => item.id === id);
    if (!found || !confirm(`Excluir permanentemente “${found.title}” deste navegador?`)) return;
    await dbDelete(id); projects = await dbAll(); renderInspector(); toast('Projeto excluído.');
  }

  function renderPresentationPanels(scene) {
    return (scene.panels || []).map(panel => {
      const pos = ({'top-left':'pos-top-left','top-right':'pos-top-right','bottom-left':'pos-bottom-left','bottom-right':'pos-bottom-right','center':'pos-center'})[panel.position] || 'pos-bottom-left';
      const body = panel.type === 'data' ? `<p><strong style="font:700 34px var(--display);color:#e4c080">${escapeHTML(panel.value || '—')} ${escapeHTML(panel.unit || '')}</strong><br>${escapeHTML(panel.body || panel.period || '')}</p>` : `<p>${escapeHTML(panel.body || '')}</p>`;
      const imageUrl = safeImageUrl(panel.image);
      const image = imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(panel.credit || panel.title)}" />` : '';
      const source = [panel.source, panel.date, panel.credit].filter(Boolean).map(escapeHTML).join(' · ');
      const link = panel.url && /^https?:\/\//i.test(panel.url) ? `<footer><a href="${escapeHTML(panel.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">ABRIR FONTE ORIGINAL ↗</a></footer>` : '';
      return `<article class="presentation-panel ${pos}"><span class="panel-kicker">${panel.type === 'news' ? 'INTELLIGENCE UPDATE' : panel.type === 'data' ? 'DATA BRIEF' : panel.type === 'image' ? 'VISUAL REFERENCE' : 'FIELD NOTES'}</span><h2>${escapeHTML(panel.title)}</h2>${body}${image}${source ? `<footer>${source}</footer>` : ''}${link}</article>`;
    }).join('');
  }

  function startPresentation() {
    if (presentationMode) return;
    presentationMode = true;
    const root = $('#presentation'); root.classList.remove('hidden');
    $('#presentationHeadline').textContent = activeScene().displayTitle || '';
    renderPresentation();
    presentationMap = createMap($('#presentationMap'), activeScene(), null, true);
    document.body.style.overflow = 'hidden';
    if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }

  function renderPresentation() {
    const scene = activeScene();
    $('#presentationHeadline').textContent = scene.displayTitle || '';
    $('#presentationPanels').innerHTML = renderPresentationPanels(scene);
    $('#presentationCountry').textContent = scene.selectedCountry ? `TERRITÓRIO EM DESTAQUE · ${scene.selectedCountry.toUpperCase()}` : '';
    $('#presentationCountry').classList.toggle('hidden', !scene.selectedCountry);
    const index = project.scenes.findIndex(item => item.id === scene.id);
    $('#presentationCounter').textContent = `${String(index+1).padStart(2,'0')} / ${String(project.scenes.length).padStart(2,'0')}`;
    $('#presentationProgress').style.width = `${((index+1)/project.scenes.length)*100}%`;
    if (presentationMap && presentationMap.isStyleLoaded()) {
      presentationMap.flyTo({center:scene.center,zoom:scene.zoom,duration:scene.transitionMs || 1800,essential:true,curve:1.35});
      updateMapLayers(presentationMap, scene);
    }
  }

  function presentationStep(direction) {
    const index = project.scenes.findIndex(scene => scene.id === project.activeSceneId);
    const target = clamp(index + direction, 0, project.scenes.length - 1);
    if (target === index) return;
    project.activeSceneId = project.scenes[target].id;
    renderPresentation();
  }

  function stopPresentation() {
    presentationMode = false;
    $('#presentation').classList.add('hidden');
    if (presentationMap) { presentationMap.remove(); presentationMap = null; }
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  async function generateScenesWithAI() {
    const script = $('#scriptInput').value.trim();
    if (!script) return toast('Cole um roteiro antes de gerar.');
    const button = $('#generateAiBtn'); button.disabled = true; button.textContent = 'GERANDO…';
    $('#aiStatus').textContent = 'Enviando roteiro para a função segura do servidor…';
    try {
      const response = await fetch('/api/generate-scenes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({script}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
      if (!Array.isArray(data.scenes) || !data.scenes.length) throw new Error('A resposta não trouxe cenas válidas.');
      const scenes = data.scenes.slice(0,20).map((item,index) => {
        const camera = item.camera || {};
        const center = Array.isArray(camera.center) && camera.center.length === 2 ? [clamp(camera.center[0],-180,180),clamp(camera.center[1],-85,85)] : [...DEFAULT_CENTER];
        return makeScene(index+1,{title:String(item.title || `Cena ${index+1}`),displayTitle:String(item.displayTitle || ''),location:String(item.location?.name || 'Localização a revisar'),center,zoom:clamp(camera.zoom || 2,1,12),transitionMs:1800,requiringReview:item.requiringReview !== false,presenterNotes:`${String(item.presenterNotes || '')}${item.requiringReview !== false ? '\n\nREVISÃO OBRIGATÓRIA: confira localização, coordenadas e afirmações com fontes independentes.' : ''}`,panels:(item.panels || []).slice(0,5).map(panel=>({...makePanel(panel.type === 'news' ? 'news' : 'text'),title:String(panel.title || panel.headline || ''),body:String(panel.body || panel.summary || ''),source:String(panel.source || ''),url:String(panel.url || ''),date:String(panel.date || ''),position:'bottom-right'}))});
      });
      commit(next => { next.title = String(data.presentationTitle || next.title).slice(0,90); next.scenes = scenes; next.activeSceneId = scenes[0].id; next.isDemo = false; });
      $('#aiDialog').close(); $('#scriptInput').value = '';
      toast('Rascunho criado. Revise locais, fontes e fatos antes de apresentar.', 4500);
    } catch (error) {
      $('#aiStatus').textContent = error.message || 'Não foi possível gerar cenas.';
      toast(error.message || 'Falha na geração por IA.', 5000);
    } finally { button.disabled = false; button.textContent = '✧ GERAR RASCUNHO'; }
  }

  function handleInspectorChange(event) {
    const target = event.target;
    if (target.matches('[data-field]')) {
      const key = target.dataset.field;
      if (key === 'longitude' || key === 'latitude') {
        const center = [...activeScene().center]; center[key === 'longitude' ? 0 : 1] = clamp(target.value, key === 'longitude' ? -180 : -85, key === 'longitude' ? 180 : 85); updateActiveScene({center});
      } else if (key === 'zoom') updateActiveScene({zoom:clamp(target.value,1,14)});
      else if (key === 'transitionMs') updateActiveScene({transitionMs:clamp(target.value,200,10000)});
      else updateActiveScene({[key]:target.value});
    } else if (target.matches('[data-panel-field]')) {
      const {id} = target.dataset; const key = target.dataset.panelField;
      updateActiveScene({panels:activeScene().panels.map(panel=>panel.id===id?{...panel,[key]:target.value}:panel)});
    } else if (target.matches('[data-marker-field]')) {
      const {id} = target.dataset; const key = target.dataset.markerField;
      updateActiveScene({markers:activeScene().markers.map(marker=>marker.id===id?{...marker,[key]:target.value}:marker)});
    } else if (target.matches('[data-marker-coordinate]')) {
      const {id} = target.dataset; const index = Number(target.dataset.markerCoordinate);
      updateActiveScene({markers:activeScene().markers.map(marker=>{if(marker.id!==id)return marker;const coordinates=[...marker.coordinates];coordinates[index]=clamp(target.value,index===0?-180:-85,index===0?180:85);return {...marker,coordinates};})});
    } else if (target.matches('[data-route-field]')) {
      const {id} = target.dataset; const key = target.dataset.routeField;
      updateActiveScene({routes:activeScene().routes.map(route=>route.id===id?{...route,[key]:target.value}:route)});
    } else if (target.matches('[data-polygon-field]')) {
      const {id} = target.dataset; const key = target.dataset.polygonField;
      updateActiveScene({polygons:activeScene().polygons.map(polygon=>polygon.id===id?{...polygon,[key]:target.value}:polygon)});
    } else if (target.id === 'projectTitle') {
      commit(next => { next.title = target.value.slice(0,90); });
    }
  }

  async function handleInspectorUpload(event) {
    const input = event.target;
    if (!input.matches('[data-panel-upload]') || !input.files?.[0]) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) return toast('Selecione um arquivo de imagem.');
    if (file.size > 8 * 1024 * 1024) return toast('A imagem deve ter no máximo 8 MB.');
    const id = input.dataset.panelUpload;
    const reader = new FileReader();
    reader.onload = () => {
      updateActiveScene({panels:activeScene().panels.map(panel=>panel.id===id?{...panel,image:String(reader.result)}:panel)});
      toast('Imagem armazenada no projeto local.');
    };
    reader.onerror = () => toast('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }

  function handleInspectorClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action) {
      const action = button.dataset.action, id = button.dataset.id;
      if (action === 'overview') updateActiveScene({center:[...DEFAULT_CENTER],zoom:1.6,selectedCountry:''});
      if (action === 'save-camera' && map) { const center=map.getCenter(); updateActiveScene({center:[Number(center.lng.toFixed(5)),Number(center.lat.toFixed(5))],zoom:Number(map.getZoom().toFixed(2))}); toast('Enquadramento do mapa salvo na cena.'); }
      if (action === 'clear-country') updateActiveScene({selectedCountry:''});
      if (action === 'delete-panel') updateActiveScene({panels:activeScene().panels.filter(panel=>panel.id!==id)});
      if (action === 'delete-marker') updateActiveScene({markers:activeScene().markers.filter(marker=>marker.id!==id)});
      if (action === 'delete-route') updateActiveScene({routes:activeScene().routes.filter(route=>route.id!==id)});
      if (action === 'delete-polygon') updateActiveScene({polygons:activeScene().polygons.filter(polygon=>polygon.id!==id)});
      if (action === 'open-project') loadProject(id);
      if (action === 'delete-project') removeProject(id);
      if (action === 'new-project') newProject();
      if (action === 'export') exportProject();
      if (action === 'import') $('#importInput').click();
      if (action === 'reset-demo') { if (confirm('Substituir a apresentação atual pela demonstração original?')) { project=makeDemoProject(); activeTab='scene'; scheduleSave(); render(); } }
    }
    if (button.dataset.addPanel) addPanel(button.dataset.addPanel);
  }

  function bindEvents() {
    $('#inspectorContent').addEventListener('change', handleInspectorChange);
    $('#inspectorContent').addEventListener('click', handleInspectorClick);
    $('#inspectorContent').addEventListener('change', handleInspectorUpload);
    $('#inspectorContent').addEventListener('input', event => {
      if (event.target.matches('[data-field="zoom"]')) { const value=Number(event.target.value); const output=event.target.parentElement.querySelector('.range-value'); if(output)output.textContent=`${value.toFixed(1)}×`; }
    });
    $('#projectTitle').addEventListener('change', handleInspectorChange);
    $('.inspector-tabs').addEventListener('click', event => { const button=event.target.closest('[data-tab]'); if (!button)return; activeTab=button.dataset.tab; renderInspector(); });
    $('#sceneStrip').addEventListener('click', event => { const card=event.target.closest('[data-scene-id]'); if(card)selectScene(card.dataset.sceneId); });
    $('#addSceneBtn').addEventListener('click',addScene);
    $('#duplicateSceneBtn').addEventListener('click',duplicateScene);
    $('#deleteSceneBtn').addEventListener('click',deleteScene);
    $('#moveSceneLeftBtn').addEventListener('click',()=>moveScene(project.activeSceneId,-1));
    $('#moveSceneRightBtn').addEventListener('click',()=>moveScene(project.activeSceneId,1));
    $('#exportBtn').addEventListener('click',exportProject);
    $('#importInput').addEventListener('change',event=>{importProjectFile(event.target.files?.[0]);event.target.value='';});
    $('#presentBtn').addEventListener('click',startPresentation);
    $('#exitPresentation').addEventListener('click',stopPresentation);
    $('#presentationPrev').addEventListener('click',()=>presentationStep(-1));
    $('#presentationNext').addEventListener('click',()=>presentationStep(1));
    $('#undoBtn').addEventListener('click',undo);
    $('#redoBtn').addEventListener('click',redo);
    $('#aiBtn').addEventListener('click',()=>$('#aiDialog').showModal());
    $('#generateAiBtn').addEventListener('click',generateScenesWithAI);
    $$('[data-map-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.mapAction;
      if(action==='reset'){if(map)map.flyTo({center:DEFAULT_CENTER,zoom:1.6,duration:1200});setMapTool('select');}
      else setMapTool(action);
    }));
    window.addEventListener('keydown',event=>{
      if (presentationMode) {
        if(event.key==='Escape'){event.preventDefault();stopPresentation();}
        if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();presentationStep(1);}
        if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();presentationStep(-1);}
        return;
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}
      if(event.key==='Escape'&&mapTool!=='select')setMapTool('select');
    });
  }

  async function init() {
    bindEvents();
    try {
      projects = await dbAll();
      if (projects.length) project = validateProject(projects[0]);
      else { await dbPut(project); projects = await dbAll(); }
      setSaveStatus('saved');
    } catch (error) {
      console.warn(error);
      setSaveStatus('error');
      toast('O armazenamento local está indisponível. Exporte o projeto JSON para guardar seu trabalho.', 6000);
    }
    render();
    loadCountries();
  }

  init();
})();

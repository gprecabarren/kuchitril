import { Upload } from 'tus-js-client';

type Kind = 'works' | 'team' | 'testimonials';
type Tab = Kind | 'overview' | 'video' | 'settings';
type Content = Record<string, unknown> & { id: string; published: boolean; deleted_at?: string | null; sort_order: number };
type Settings = Record<string, unknown>;
type UploadTicket = { id: string; signedUrl: string; path: string; token: string; bucket: string; tusEndpoint: string; apikey: string };
const app = document.querySelector<HTMLElement>('#admin-app');

if (app) {
  const labels: Record<Tab, string> = { overview: 'Vista general', works: 'Trabajos', team: 'Equipo', testimonials: 'Testimonios', video: 'Video', settings: 'SEO y redes' };
  const nouns: Record<Kind, string> = { works: 'trabajo', team: 'integrante', testimonials: 'testimonio' };
  const emptyText: Record<Kind, string> = { works: 'Agrega fotografías y cuenta qué hiciste para cada marca.', team: 'Agrega a las personas del equipo y su especialidad.', testimonials: 'Agrega las palabras de tus clientes cuando tengas su autorización.' };
  const store: Record<Kind, Content[]> = { works: [], team: [], testimonials: [] };
  const loaded = new Set<Kind>();
  let settings: Settings = {};
  let editorKind: Kind = 'works';
  let editorId: string | null = null;
  let uploads = 0;
  let editorDirty = false;
  const dirtySettings = new Set<HTMLFormElement>();
  const status = document.querySelector<HTMLElement>('#admin-status')!;
  const editor = document.querySelector<HTMLDialogElement>('#admin-editor')!;
  const contentForm = document.querySelector<HTMLFormElement>('#admin-content-form')!;
  const cropDialog = document.querySelector<HTMLDialogElement>('#admin-cropper')!;
  const confirmDialog = document.querySelector<HTMLDialogElement>('#admin-confirm')!;
  let confirmResolve: ((confirmed: boolean) => void) | null = null;
  const cropCanvas = document.querySelector<HTMLCanvasElement>('#admin-crop-canvas')!;
  const cropRatio = document.querySelector<HTMLSelectElement>('#admin-crop-ratio')!;
  const cropZoom = document.querySelector<HTMLInputElement>('#admin-crop-zoom')!;
  let cropImage: HTMLImageElement | null = null;
  let cropX = 0;
  let cropY = 0;
  let cropResolve: ((file: File | null) => void) | null = null;
  let cropFilename = 'fotografia';

  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const value = (row: Content | Settings, key: string) => String(row[key] ?? '');
  const safeUrl = (candidate: unknown) => {
    if (typeof candidate !== 'string' || !candidate.trim()) return '';
    try {
      const url = new URL(candidate.trim(), window.location.origin);
      return url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === window.location.protocol) ? url.href : '';
    } catch { return ''; }
  };
  function message(text: string, mode: 'success' | 'error' | 'loading' = 'success') {
    status.textContent = text;
    status.classList.toggle('is-error', mode === 'error');
    status.classList.toggle('is-loading', mode === 'loading');
  }
  function confirmAction(title: string, text: string, action: string): Promise<boolean> {
    if (confirmResolve) return Promise.resolve(false);
    document.querySelector('#admin-confirm-title')!.textContent = title;
    document.querySelector('#admin-confirm-message')!.textContent = text;
    document.querySelector('#admin-confirm-accept')!.textContent = action;
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmDialog.showModal();
      document.querySelector<HTMLButtonElement>('#admin-confirm-cancel')!.focus();
    });
  }
  function finishConfirmation(confirmed: boolean) {
    confirmDialog.close();
    confirmResolve?.(confirmed);
    confirmResolve = null;
  }
  confirmDialog.querySelectorAll('[data-cancel-confirm]').forEach((button) => button.addEventListener('click', () => finishConfirmation(false)));
  document.querySelector('#admin-confirm-accept')!.addEventListener('click', () => finishConfirmation(true));
  confirmDialog.addEventListener('cancel', (event) => { event.preventDefault(); finishConfirmation(false); });
  async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/admin/${path}`, { method, credentials: 'same-origin', headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let result: { error?: string; data?: T } & T;
    try { result = await response.json(); } catch { throw new Error('No pudimos completar la solicitud. Vuelve a intentarlo.'); }
    if (response.status === 401) { window.location.assign('/admin'); throw new Error('Tu sesión terminó. Inicia sesión de nuevo.'); }
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'No pudimos guardar los cambios. Inténtalo de nuevo.');
    return ('data' in result && result.data !== undefined ? result.data : result) as T;
  }
  function changeTab(tab: Tab) {
    if (!Object.hasOwn(labels, tab)) return;
    document.querySelectorAll<HTMLElement>('[data-section]').forEach((section) => { section.hidden = section.dataset.section !== tab; });
    document.querySelectorAll<HTMLButtonElement>('.admin-nav [data-tab]').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    document.querySelector('#admin-page-title')!.textContent = labels[tab];
    history.replaceState(null, '', `/admin#${tab}`);
    status.textContent = '';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function renderMetrics() {
    document.querySelector('#admin-metrics')!.innerHTML = (Object.keys(store) as Kind[]).map((kind) => {
      const active = store[kind].filter((row) => !row.deleted_at);
      const published = active.filter((row) => row.published).length;
      return `<button type="button" class="admin-metric" data-tab="${kind}"><span>${labels[kind]}</span><strong>${loaded.has(kind) ? published : '—'}</strong><small>${loaded.has(kind) ? `${active.length - published} en borrador · ${active.length} en total` : 'No se pudo cargar'}</small></button>`;
    }).join('');
  }
  function renderList(kind: Kind) {
    const container = document.querySelector<HTMLElement>(`[data-list="${kind}"]`)!;
    if (!loaded.has(kind)) { container.innerHTML = '<div class="admin-empty"><span aria-hidden="true">↻</span><h3>No pudimos cargar estos contenidos.</h3><p>Comprueba tu conexión y vuelve a intentarlo. Tus contenidos siguen guardados.</p><button type="button" class="admin-button admin-button--dark" data-reload>Volver a cargar</button></div>'; return; }
    const showArchived = document.querySelector<HTMLInputElement>(`[data-show-archived="${kind}"]`)!.checked;
    const rows = [...store[kind]].filter((row) => showArchived || !row.deleted_at).sort((a, b) => a.sort_order - b.sort_order);
    if (!rows.length) {
      container.innerHTML = `<div class="admin-empty"><span aria-hidden="true">${kind === 'works' ? '▧' : kind === 'team' ? '◎' : '❞'}</span><h3>${showArchived ? 'No hay contenidos aquí.' : `Tu próximo ${nouns[kind]} empieza aquí.`}</h3><p>${emptyText[kind]}</p><button type="button" class="admin-button admin-button--dark" data-create="${kind}">Agregar ${nouns[kind]} ＋</button></div>`;
      return;
    }
    container.innerHTML = rows.map((row) => {
      const title = value(row, kind === 'works' ? 'title' : 'name') || `Sin ${kind === 'works' ? 'título' : 'nombre'}`;
      const description = value(row, kind === 'works' ? 'description' : kind === 'team' ? 'role' : 'quote');
      const picture = safeUrl(row[kind === 'works' ? 'image_url' : 'photo_url']);
      const metadata = kind === 'works' ? value(row, 'client') : kind === 'testimonials' ? value(row, 'company') : row.exclude_name_from_index ? 'Nombre protegido de indexación' : 'Integrante del equipo';
      const archived = Boolean(row.deleted_at);
      const badge = archived ? 'Archivado' : row.published ? 'Publicado' : 'Borrador';
      const background = kind === 'testimonials' && /^#[0-9a-f]{6}$/i.test(value(row, 'background_color')) ? value(row, 'background_color') : '';
      return `<article class="admin-content-card${archived ? ' is-archived' : ''}"><div class="admin-content-card__media"${background ? ` style="background:${escape(background)}"` : ''}>${picture ? `<img src="${escape(picture)}" alt="" loading="lazy" />` : `<span aria-hidden="true">${kind === 'testimonials' ? '❞' : kind === 'team' ? '◎' : '✳'}</span>`}<div class="admin-content-card__badge${row.published && !archived ? ' is-published' : ''}">${badge}${kind === 'works' && row.featured && !archived ? ' · Destacado' : ''}</div></div><div class="admin-content-card__body"><div class="admin-content-card__meta"><span>${escape(metadata)}</span><span>Orden ${escape(row.sort_order)}</span></div><h3>${escape(title)}</h3><p>${escape(description.length > 180 ? `${description.slice(0, 180)}…` : description)}</p></div><div class="admin-content-card__actions"><button type="button" data-edit="${kind}" data-id="${escape(row.id)}">Editar ↗</button>${archived ? `<button type="button" data-restore="${kind}" data-id="${escape(row.id)}">Recuperar</button>` : `<button type="button" data-archive="${kind}" data-id="${escape(row.id)}">Archivar</button>`}</div></article>`;
    }).join('');
  }
  function input(label: string, name: string, row: Content | Settings, options: { type?: string; required?: boolean; max?: number; help?: string; placeholder?: string } = {}) {
    return `<label class="admin-field">${label}<input name="${name}" type="${options.type || 'text'}" value="${escape(value(row, name))}"${options.required ? ' required' : ''}${options.max ? ` maxlength="${options.max}"` : ''}${options.placeholder ? ` placeholder="${escape(options.placeholder)}"` : ''}${options.type === 'number' ? ' min="0" max="9999" step="1"' : ''} />${options.help ? `<small>${options.help}</small>` : ''}</label>`;
  }
  function textarea(label: string, name: string, row: Content | Settings, max: number, required = false) {
    return `<label class="admin-field">${label}<textarea name="${name}" maxlength="${max}" rows="4"${required ? ' required' : ''}>${escape(value(row, name))}</textarea></label>`;
  }
  function check(label: string, name: string, row: Content | Settings, help?: string) {
    return `<label class="admin-check"><input type="checkbox" name="${name}"${row[name] ? ' checked' : ''} />${label}${help ? `<small>${help}</small>` : ''}</label>`;
  }
  function mediaField(name: string, row: Content | Settings, kind: string) {
    const url = safeUrl(row[name]);
    return `<div class="admin-field"><span>Fotografía</span><div class="admin-media-field" data-media-field="${kind}"><div class="admin-media-preview" data-media-preview>${url ? `<img src="${escape(url)}" alt="Vista previa" />` : '<span>Sin fotografía</span>'}</div><div class="admin-upload-actions"><label class="admin-button admin-button--outline">Elegir y recortar<input type="file" accept="image/jpeg,image/png,image/webp" data-media-input="${kind}" hidden /></label><button class="admin-button admin-button--text" type="button" data-clear-media="${kind}">Quitar fotografía</button></div><input type="hidden" name="${name}" value="${escape(value(row, name))}" /><progress class="admin-upload-progress" data-upload-progress max="100" value="0" hidden></progress><p class="admin-upload-note" data-upload-note aria-live="polite">JPG, PNG o WebP. Hasta 10 MB.</p></div></div>`;
  }
  function openEditor(kind: Kind, id?: string) {
    if (!loaded.has(kind)) { message('Espera a que se carguen los contenidos o vuelve a cargar la página.', 'error'); return; }
    if (uploads) { message('Espera a que termine la carga del archivo.', 'error'); return; }
    editorKind = kind;
    editorId = id || null;
    const row = id ? store[kind].find((item) => item.id === id)! : { id: '', published: false, sort_order: store[kind].filter((item) => !item.deleted_at).length + 1, featured: true, background_color: '#d9f0d5', text_color: '#173e35' };
    if (!row) return;
    document.querySelector('#admin-editor-title')!.textContent = `${id ? 'Editar' : 'Agregar'} ${nouns[kind]}`;
    document.querySelector('#admin-editor-kicker')!.textContent = labels[kind];
    let html = '';
    if (kind === 'works') html = input('Nombre del trabajo', 'title', row, { required: true, max: 140, placeholder: 'Nombre de la campaña o proyecto' }) + `<div class="admin-form-grid">${input('Marca o cliente', 'client', row, { max: 140 })}${input('Servicio o categoría', 'category', row, { max: 100, placeholder: 'Branding, audiovisual…' })}</div>` + textarea('Descripción', 'description', row, 4000) + mediaField('image_url', row, kind) + input('Describe la fotografía', 'image_alt', row, { max: 240, help: 'Una frase breve para personas que usan lectores de pantalla.' }) + input('Enlace del trabajo (opcional)', 'link_url', row, { type: 'url', max: 2048, placeholder: 'https://…' }) + check('Destacar en el inicio', 'featured', row, 'Publica y destaca entre 4 y 5 trabajos para mantener el inicio claro.');
    if (kind === 'team') {
      const protectedName = /^\s*genaro\s+piedra/i.test(value(row, 'name'));
      const privacy = check('Proteger este nombre de la indexación', 'exclude_name_from_index', row, protectedName ? 'Esta protección se mantiene activa para este integrante.' : 'El nombre se muestra en un espacio separado que solicita a Google no indexarlo.');
      html = input('Nombre y apellido', 'name', row, { required: true, max: 140 }) + input('Cargo o especialidad', 'role', row, { required: true, max: 240, placeholder: 'Diseño y dirección de arte' }) + mediaField('photo_url', row, kind) + input('Describe la fotografía', 'photo_alt', row, { max: 240, help: 'Para nombres protegidos utiliza una descripción del cargo.' }) + (protectedName ? privacy.replace('name="exclude_name_from_index"', 'name="exclude_name_from_index" disabled') : privacy);
    }
    if (kind === 'testimonials') html = textarea('Testimonio', 'quote', row, 2000, true) + `<div class="admin-form-grid">${input('Nombre del cliente', 'name', row, { required: true, max: 140 })}${input('Marca o empresa', 'company', row, { max: 160 })}</div>` + mediaField('photo_url', row, kind) + `<div class="admin-form-grid">${input('Color de fondo', 'background_color', row, { type: 'color' })}${input('Color del texto', 'text_color', row, { type: 'color' })}</div><p class="admin-alert">Usa testimonios y fotografías con autorización. Elige colores con buen contraste para que el texto se lea con facilidad.</p>`;
    html += `<div class="admin-form-grid">${input('Orden en el sitio', 'sort_order', row, { type: 'number', required: true })}<div>${check('Publicado', 'published', row, 'Si lo desactivas, se guarda como borrador.')}</div></div>`;
    document.querySelector('#admin-editor-fields')!.innerHTML = html;
    editorDirty = false;
    editor.showModal();
  }
  function formData(form: HTMLFormElement): Settings {
    const result: Settings = {};
    new FormData(form).forEach((entry, key) => { if (typeof entry === 'string') result[key] = entry.trim(); });
    form.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((checkbox) => { result[checkbox.name] = checkbox.checked; });
    form.querySelectorAll<HTMLInputElement>('input[type=number]').forEach((number) => { result[number.name] = Number(number.value); });
    return result;
  }
  function populateSettings() {
    for (const selector of ['#admin-video-form', '#admin-seo-form']) {
      const form = document.querySelector<HTMLFormElement>(selector)!;
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name],textarea[name]').forEach((field) => {
        if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = Boolean(settings[field.name]);
        else field.value = String(settings[field.name] ?? '');
      });
      form.querySelectorAll<HTMLElement>('[data-media-field]').forEach((field) => {
        const hidden = field.querySelector<HTMLInputElement>('input[type=hidden]');
        const url = hidden && safeUrl(hidden.value || (field.dataset.mediaField === 'founder' ? '/assets/fundador.webp' : ''));
        const preview = field.querySelector<HTMLElement>('[data-media-preview]')!;
        if (url) preview.innerHTML = field.dataset.mediaField === 'video' ? `<video controls preload="metadata" src="${escape(url)}" aria-label="Vista previa del video"></video>` : `<img src="${escape(url)}" alt="Vista previa" />`;
        else preview.innerHTML = `<span>${field.dataset.mediaField === 'video' ? 'Tu video aparecerá aquí' : 'Sin imagen'}</span>`;
      });
    }
    updateSeoPreview();
  }
  function updateSeoPreview() {
    const form = document.querySelector<HTMLFormElement>('#admin-seo-form')!;
    document.querySelector('#seo-preview-title')!.textContent = form.querySelector<HTMLInputElement>('[name=home_title]')!.value || 'Kuchitril · Agencia de publicidad';
    document.querySelector('#seo-preview-description')!.textContent = form.querySelector<HTMLTextAreaElement>('[name=home_description]')!.value || 'La descripción de tu agencia aparecerá aquí.';
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-counter]').forEach((field) => {
      const counter = form.querySelector(`[data-count-for="${field.name}"]`);
      if (counter) counter.textContent = `${field.value.length} de ${field.dataset.counter} caracteres`;
    });
  }
  function toggleSubmitting(form: HTMLFormElement, disabled: boolean) { form.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((button) => { button.disabled = disabled || uploads > 0; }); }
  async function mutateArchive(kind: Kind, id: string, restore: boolean) {
    const row = store[kind].find((item) => item.id === id);
    if (!row) return;
    if (!restore && !await confirmAction(`Archivar ${nouns[kind]}`, 'Se ocultará del sitio y seguirá guardado en el panel. Puedes recuperarlo después desde “Mostrar archivados”.', 'Archivar')) return;
    message(restore ? 'Recuperando contenido…' : 'Archivando contenido…', 'loading');
    try {
      await api(`content/${kind}/${encodeURIComponent(id)}`, restore ? 'PATCH' : 'DELETE', restore ? { deleted_at: null, published: false } : undefined);
      store[kind] = await api<Content[]>(`content/${kind}`);
      renderList(kind); renderMetrics();
      message(restore ? 'Contenido recuperado como borrador. Edítalo cuando quieras publicarlo.' : 'Contenido archivado. Puedes recuperarlo en “Mostrar archivados”.');
    } catch (error) { message(error instanceof Error ? error.message : 'No pudimos actualizar el contenido.', 'error'); }
  }
  app.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button[data-tab],button[data-create],button[data-edit],button[data-archive],button[data-restore],button[data-clear-media],button[data-reload]') : null;
    if (!target) return;
    if (target.dataset.tab) changeTab(target.dataset.tab as Tab);
    if (target.dataset.create) openEditor(target.dataset.create as Kind);
    if (target.dataset.edit) openEditor(target.dataset.edit as Kind, target.dataset.id);
    if (target.dataset.archive) void mutateArchive(target.dataset.archive as Kind, target.dataset.id!, false);
    if (target.dataset.restore) void mutateArchive(target.dataset.restore as Kind, target.dataset.id!, true);
    if (target.dataset.clearMedia) clearMedia(target);
    if (target.hasAttribute('data-reload')) window.location.reload();
  });
  editor.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-close-dialog],[data-clear-media]') : null;
    if (target?.hasAttribute('data-close-dialog')) void closeEditor();
    if (target?.dataset.clearMedia) clearMedia(target);
  });
  async function closeEditor() {
    if (uploads) { message('Espera a que termine la carga del archivo.', 'error'); return; }
    if (editorDirty && !await confirmAction('Cerrar sin guardar', 'Los cambios del editor no se han guardado. Puedes cancelar para seguir editando o cerrar y descartarlos.', 'Cerrar sin guardar')) return;
    editorDirty = false;
    editor.close();
  }
  editor.addEventListener('cancel', (event) => { event.preventDefault(); void closeEditor(); });
  document.querySelectorAll<HTMLInputElement>('[data-show-archived]').forEach((input) => input.addEventListener('change', () => renderList(input.dataset.showArchived as Kind)));
  contentForm.addEventListener('input', () => { editorDirty = true; });
  contentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploads || !contentForm.reportValidity()) return;
    toggleSubmitting(contentForm, true);
    const payload = formData(contentForm);
    if (editorKind === 'testimonials' && contrast(String(payload.background_color), String(payload.text_color)) < 4.5) { message('Estos colores tienen poco contraste. Elige texto más claro u oscuro para que el testimonio se lea bien.', 'error'); toggleSubmitting(contentForm, false); return; }
    try {
      await api(`content/${editorKind}${editorId ? `/${encodeURIComponent(editorId)}` : ''}`, editorId ? 'PATCH' : 'POST', payload);
      store[editorKind] = await api<Content[]>(`content/${editorKind}`);
      renderList(editorKind); renderMetrics();
      editorDirty = false; editor.close();
      message(payload.published ? 'Cambios guardados y publicados en el sitio.' : 'Borrador guardado. Puedes publicarlo cuando esté listo.');
    } catch (error) { message(error instanceof Error ? error.message : 'No pudimos guardar el contenido.', 'error'); }
    finally { toggleSubmitting(contentForm, false); }
  });
  for (const selector of ['#admin-video-form', '#admin-seo-form']) {
    const form = document.querySelector<HTMLFormElement>(selector)!;
    form.addEventListener('input', () => { dirtySettings.add(form); if (selector === '#admin-seo-form') updateSeoPreview(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (uploads || !form.reportValidity()) return;
      const payload = formData(form);
      if (payload.instagram_url && !/^https:\/\/(www\.)?instagram\.com\//i.test(String(payload.instagram_url))) { message('Usa el enlace completo de tu perfil: https://www.instagram.com/tu_agencia/', 'error'); return; }
      toggleSubmitting(form, true);
      try { await api('content/settings/1', 'PATCH', payload); settings = { ...settings, ...payload }; dirtySettings.delete(form); message('Cambios guardados. Ya puedes revisarlos en el sitio.'); }
      catch (error) { message(error instanceof Error ? error.message : 'No pudimos guardar la configuración.', 'error'); }
      finally { toggleSubmitting(form, false); }
    });
  }
  function clearMedia(button: HTMLElement) {
    if (uploads) return;
    const field = button.closest<HTMLElement>('[data-media-field]');
    field?.querySelectorAll<HTMLInputElement>('input[type=hidden]').forEach((input) => { input.value = ''; });
    const preview = field?.querySelector('[data-media-preview]');
    if (preview) preview.innerHTML = field?.dataset.mediaField === 'founder' ? '<img src="/assets/fundador.webp" alt="Vista previa de la fotografía original" />' : '<span>Sin archivo</span>';
    const form = field?.closest<HTMLFormElement>('form');
    if (form === contentForm) editorDirty = true; else if (form) dirtySettings.add(form);
  }
  document.addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-media-input]') || !input.files?.[0]) return;
    const field = input.closest<HTMLElement>('[data-media-field]')!;
    const kind = input.dataset.mediaInput!;
    const note = field.querySelector<HTMLElement>('[data-upload-note]')!;
    const original = input.files[0];
    input.value = '';
    note.classList.remove('is-error');
    const video = kind === 'video';
    const accepted = video ? ['video/mp4', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(original.type)) { note.textContent = video ? 'Elige un video MP4 o WebM.' : 'Elige una fotografía JPG, PNG o WebP.'; note.classList.add('is-error'); return; }
    if (original.size > (video ? 50 : 10) * 1024 * 1024) { note.textContent = `El archivo supera el límite de ${video ? 50 : 10} MB. Exporta una versión más liviana.`; note.classList.add('is-error'); return; }
    try {
      const file = video ? original : await crop(original, kind === 'team' || kind === 'founder' ? '0.8' : kind === 'works' ? '1.3333333333333333' : kind === 'social' ? '1.9047619047619047' : kind === 'poster' ? '1.7777777777777777' : '1');
      if (!file) return;
      await uploadMedia(file, field, video);
    } catch (error) { note.textContent = error instanceof Error ? error.message : 'No pudimos cargar el archivo. Inténtalo de nuevo.'; note.classList.add('is-error'); }
  });
  async function uploadMedia(file: File, field: HTMLElement, video: boolean) {
    const note = field.querySelector<HTMLElement>('[data-upload-note]')!;
    const progress = field.querySelector<HTMLProgressElement>('[data-upload-progress]');
    const buttons = field.querySelectorAll<HTMLButtonElement>('button');
    uploads++;
    document.querySelectorAll<HTMLInputElement>('[data-media-input]').forEach((input) => { input.disabled = true; });
    document.querySelectorAll<HTMLFormElement>('.admin-settings-form,#admin-content-form').forEach((form) => toggleSubmitting(form, true));
    buttons.forEach((button) => { button.disabled = true; });
    if (progress) { progress.hidden = false; progress.value = 0; }
    note.textContent = 'Preparando una carga segura…';
    try {
      const ticket = await api<UploadTicket>('media', 'POST', { filename: file.name, mime: file.type, size: file.size });
      if (video || file.size > 6 * 1024 * 1024) {
        await new Promise<void>((resolve, reject) => {
          const upload = new Upload(file, { endpoint: ticket.tusEndpoint, headers: { 'x-signature': ticket.token, apikey: ticket.apikey }, metadata: { bucketName: ticket.bucket, objectName: ticket.path, contentType: file.type, cacheControl: '86400' }, chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, storeFingerprintForResuming: false, onProgress(bytes, total) { const percent = Math.round(bytes / total * 100); if (progress) progress.value = percent; note.textContent = `Subiendo ${video ? 'video' : 'fotografía'}… ${percent}%`; }, onError() { reject(new Error('La carga se interrumpió. Comprueba tu conexión e inténtalo de nuevo.')); }, onSuccess() { resolve(); } });
          upload.start();
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('PUT', ticket.signedUrl);
          request.setRequestHeader('Content-Type', file.type);
          request.setRequestHeader('Cache-Control', 'max-age=86400');
          request.upload.onprogress = (event) => { if (event.lengthComputable) { const percent = Math.round(event.loaded / event.total * 100); if (progress) progress.value = percent; note.textContent = `Subiendo fotografía… ${percent}%`; } };
          request.onerror = () => reject(new Error('La carga se interrumpió. Comprueba tu conexión e inténtalo de nuevo.'));
          request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('No pudimos subir el archivo. Inténtalo de nuevo.'));
          request.send(file);
        });
      }
      note.textContent = 'Revisando el archivo…';
      const completed = await api<{ publicUrl: string }>(`media/${encodeURIComponent(ticket.id)}/complete`, 'POST', {});
      const hidden = field.querySelector<HTMLInputElement>('input[type=hidden]')!;
      hidden.value = completed.publicUrl;
      const mimeField = field.querySelector<HTMLInputElement>('[name=video_mime]');
      if (mimeField) mimeField.value = file.type;
      field.querySelector('[data-media-preview]')!.innerHTML = video ? `<video src="${escape(safeUrl(completed.publicUrl))}" controls preload="metadata" aria-label="Vista previa del video"></video>` : `<img src="${escape(safeUrl(completed.publicUrl))}" alt="Vista previa del recorte" />`;
      note.textContent = 'Archivo cargado. Guarda los cambios para mostrarlo en el sitio.';
      const form = field.closest<HTMLFormElement>('form');
      if (form === contentForm) editorDirty = true; else if (form) dirtySettings.add(form);
    } finally {
      uploads--;
      document.querySelectorAll<HTMLInputElement>('[data-media-input]').forEach((input) => { input.disabled = uploads > 0; });
      document.querySelectorAll<HTMLFormElement>('.admin-settings-form,#admin-content-form').forEach((form) => toggleSubmitting(form, false));
      buttons.forEach((button) => { button.disabled = false; });
      if (progress) progress.hidden = true;
    }
  }
  function drawCrop() {
    if (!cropImage) return;
    const ratio = Number(cropRatio.value);
    cropCanvas.width = ratio >= 1 ? 1200 : Math.round(1200 * ratio);
    cropCanvas.height = ratio >= 1 ? Math.round(1200 / ratio) : 1200;
    const ctx = cropCanvas.getContext('2d')!;
    const scale = Math.max(cropCanvas.width / cropImage.naturalWidth, cropCanvas.height / cropImage.naturalHeight) * Number(cropZoom.value);
    const width = cropImage.naturalWidth * scale;
    const height = cropImage.naturalHeight * scale;
    const maxX = Math.max(0, (width - cropCanvas.width) / 2);
    const maxY = Math.max(0, (height - cropCanvas.height) / 2);
    cropX = Math.max(-maxX, Math.min(maxX, cropX));
    cropY = Math.max(-maxY, Math.min(maxY, cropY));
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(cropImage, (cropCanvas.width - width) / 2 + cropX, (cropCanvas.height - height) / 2 + cropY, width, height);
  }
  async function crop(file: File, ratio: string): Promise<File | null> {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try { image.src = objectUrl; await image.decode(); } catch { throw new Error('No pudimos leer esta fotografía. Prueba con otro archivo.'); } finally { URL.revokeObjectURL(objectUrl); }
    cropImage = image; cropRatio.value = ratio; cropZoom.value = '1'; cropZoom.setAttribute('aria-valuetext', '100%'); cropX = 0; cropY = 0;
    cropFilename = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'fotografia';
    document.querySelector<HTMLElement>('#admin-crop-error')!.hidden = true;
    drawCrop(); cropDialog.showModal();
    return new Promise((resolve) => { cropResolve = resolve; });
  }
  function cancelCrop() { cropDialog.close(); cropResolve?.(null); cropResolve = null; cropImage = null; }
  cropDialog.addEventListener('cancel', (event) => { event.preventDefault(); cancelCrop(); });
  cropDialog.querySelectorAll('[data-cancel-crop]').forEach((button) => button.addEventListener('click', cancelCrop));
  cropRatio.addEventListener('change', () => { cropX = 0; cropY = 0; drawCrop(); });
  cropZoom.addEventListener('input', () => { cropZoom.setAttribute('aria-valuetext', `${Math.round(Number(cropZoom.value) * 100)}%`); drawCrop(); });
  document.querySelector('#admin-crop-reset')!.addEventListener('click', () => { cropZoom.value = '1'; cropZoom.setAttribute('aria-valuetext', '100%'); cropX = 0; cropY = 0; drawCrop(); });
  cropDialog.querySelectorAll<HTMLElement>('[data-pan]').forEach((button) => button.addEventListener('click', () => { const step = 40; cropX += button.dataset.pan === 'left' ? -step : button.dataset.pan === 'right' ? step : 0; cropY += button.dataset.pan === 'up' ? -step : button.dataset.pan === 'down' ? step : 0; drawCrop(); }));
  let drag: { x: number; y: number; pointer: number } | null = null;
  cropCanvas.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId }; cropCanvas.setPointerCapture(event.pointerId); });
  cropCanvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const bounds = cropCanvas.getBoundingClientRect();
    cropX += (event.clientX - drag.x) * cropCanvas.width / bounds.width;
    cropY += (event.clientY - drag.y) * cropCanvas.height / bounds.height;
    drag.x = event.clientX; drag.y = event.clientY; drawCrop();
  });
  cropCanvas.addEventListener('pointerup', () => { drag = null; });
  cropCanvas.addEventListener('pointercancel', () => { drag = null; });
  cropCanvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    cropX += event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    cropY += event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    drawCrop();
  });
  document.querySelector('#admin-crop-apply')!.addEventListener('click', () => {
    cropCanvas.toBlob((blob) => {
      if (!blob) { const error = document.querySelector<HTMLElement>('#admin-crop-error')!; error.textContent = 'No pudimos crear el recorte. Prueba con otra fotografía.'; error.hidden = false; return; }
      const extension = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
      cropDialog.close(); cropResolve?.(new File([blob], `${cropFilename}.${extension}`, { type: blob.type })); cropResolve = null; cropImage = null;
    }, 'image/webp', 0.9);
  });
  function contrast(first: string, second: string) {
    const luminance = (hex: string) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0;
      const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  window.addEventListener('beforeunload', (event) => { if (uploads || editorDirty || dirtySettings.size > 0) event.preventDefault(); });
  async function load() {
    const settingsForms = document.querySelectorAll<HTMLFormElement>('.admin-settings-form');
    settingsForms.forEach((form) => form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input,textarea,button').forEach((field) => { field.disabled = true; }));
    const results = await Promise.allSettled([api<Content[]>('content/works'), api<Content[]>('content/team'), api<Content[]>('content/testimonials'), api<Settings>('content/settings')]);
    const kinds: Kind[] = ['works', 'team', 'testimonials'];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') { if (index < 3) { store[kinds[index]] = result.value as Content[]; loaded.add(kinds[index]); } else { settings = result.value as Settings; settingsForms.forEach((form) => form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input,textarea,button').forEach((field) => { field.disabled = false; })); } }
    });
    kinds.forEach(renderList); renderMetrics(); populateSettings();
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') message(failed.reason instanceof Error ? failed.reason.message : 'No pudimos cargar todos los contenidos. Recarga la página.', 'error');
  }
  const initial = window.location.hash.slice(1);
  if (Object.hasOwn(labels, initial)) changeTab(initial as Tab);
  void load();
}

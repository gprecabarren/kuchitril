import { readProjects, resetProjects, saveProjects } from '../lib/portfolio';
import type { Project, Service } from '../data/projects';

const by = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

export function initAdmin(): void {
  const list = by<HTMLElement>('[data-admin-list]');
  const dialog = by<HTMLDialogElement>('#project-editor');
  const form = by<HTMLFormElement>('#project-form');
  const title = by<HTMLElement>('#editor-title');
  const error = by<HTMLElement>('[data-form-error]');
  const toast = by<HTMLElement>('[data-admin-toast]');
  if (!list || !dialog || !form || !title || !error || !toast) return;

  let currentImage = '';
  let toastTimer: number | undefined;
  const announce = (message: string) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3500);
  };
  const showError = (message: string) => { error.textContent = message; error.hidden = false; };
  const clearError = () => { error.textContent = ''; error.hidden = true; };

  const render = () => {
    const projects = readProjects();
    by<HTMLElement>('[data-total-count]')!.textContent = String(projects.length);
    by<HTMLElement>('[data-featured-count]')!.textContent = String(projects.filter((p) => p.featured).length);
    list.replaceChildren();
    if (projects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'admin-empty';
      empty.textContent = 'Todavía no hay proyectos. Crea el primero con el botón de arriba.';
      list.append(empty);
    }
    projects.forEach((project, index) => {
      const row = document.createElement('article');
      row.className = 'admin-project';
      const thumb = document.createElement('div');
      thumb.className = `admin-project__thumb tone-${project.tone}`;
      if (project.image) {
        const img = document.createElement('img');
        img.src = project.image;
        img.alt = '';
        thumb.append(img);
      } else thumb.textContent = '✳';

      const info = document.createElement('div');
      info.className = 'admin-project__info';
      const name = document.createElement('h3');
      name.textContent = project.title;
      const detail = document.createElement('p');
      detail.textContent = `${project.service} · ${project.demo ? 'Muestra' : 'Proyecto'}`;
      info.append(name, detail);

      const actions = document.createElement('div');
      actions.className = 'admin-project__actions';
      const feature = document.createElement('button');
      feature.type = 'button';
      feature.className = `admin-feature ${project.featured ? 'is-featured' : ''}`;
      feature.textContent = project.featured ? '★ Destacado' : '☆ Destacar';
      feature.setAttribute('aria-label', `${project.featured ? 'Quitar de' : 'Agregar a'} destacados: ${project.title}`);
      feature.addEventListener('click', () => {
        const next = readProjects();
        if (!project.featured && next.filter((p) => p.featured).length >= 5) return announce('Puedes destacar un máximo de cinco proyectos.');
        next.find((p) => p.id === project.id)!.featured = !project.featured;
        saveProjects(next); render(); announce('Selección de portada actualizada.');
      });
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'admin-icon-button'; up.textContent = '↑'; up.disabled = index === 0;
      up.setAttribute('aria-label', `Subir ${project.title}`);
      up.addEventListener('click', () => move(index, -1));
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'admin-icon-button'; down.textContent = '↓'; down.disabled = index === projects.length - 1;
      down.setAttribute('aria-label', `Bajar ${project.title}`);
      down.addEventListener('click', () => move(index, 1));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'admin-edit'; edit.textContent = 'Editar';
      edit.addEventListener('click', () => openEditor(project));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'admin-remove'; remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => {
        if (!confirm(`¿Eliminar “${project.title}” del prototipo?`)) return;
        saveProjects(readProjects().filter((p) => p.id !== project.id));
        render(); announce('Proyecto eliminado.');
      });
      actions.append(feature, up, down, edit, remove);
      row.append(thumb, info, actions);
      list.append(row);
    });
  };

  const move = (index: number, delta: number) => {
    const projects = readProjects();
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    [projects[index], projects[target]] = [projects[target], projects[index]];
    projects.forEach((project, position) => project.order = position + 1);
    saveProjects(projects); render(); announce('Orden actualizado.');
  };

  const openEditor = (project?: Project) => {
    form.reset(); clearError();
    currentImage = project?.image ?? '';
    title.textContent = project ? 'Editar proyecto' : 'Nuevo proyecto';
    (form.elements.namedItem('id') as HTMLInputElement).value = project?.id ?? '';
    (form.elements.namedItem('title') as HTMLInputElement).value = project?.title ?? '';
    (form.elements.namedItem('service') as HTMLSelectElement).value = project?.service ?? 'Branding';
    (form.elements.namedItem('tone') as HTMLSelectElement).value = project?.tone ?? 'mint';
    (form.elements.namedItem('description') as HTMLTextAreaElement).value = project?.description ?? '';
    (form.elements.namedItem('demo') as HTMLInputElement).checked = project?.demo ?? true;
    (form.elements.namedItem('featured') as HTMLInputElement).checked = project?.featured ?? false;
    dialog.showModal();
  };

  by<HTMLButtonElement>('[data-add-project]')?.addEventListener('click', () => openEditor());
  document.querySelectorAll<HTMLButtonElement>('[data-close-editor]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  by<HTMLButtonElement>('[data-reset-projects]')?.addEventListener('click', () => {
    if (!confirm('¿Restaurar los proyectos de muestra? Se perderán los cambios guardados en este navegador.')) return;
    resetProjects(); render(); announce('Ejemplos restaurados.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); clearError();
    const fd = new FormData(form);
    const id = String(fd.get('id') || crypto.randomUUID());
    const titleValue = String(fd.get('title') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const service = String(fd.get('service')) as Service;
    const tone = String(fd.get('tone')) as Project['tone'];
    const featured = fd.get('featured') === 'on';
    const demo = fd.get('demo') === 'on';
    if (!titleValue || !description) return showError('Completa el título y la descripción.');
    const projects = readProjects();
    if (featured && !projects.find((p) => p.id === id)?.featured && projects.filter((p) => p.featured).length >= 5) return showError('Puedes destacar un máximo de cinco proyectos.');

    let image = currentImage;
    const url = String(fd.get('image') || '').trim();
    if (url) image = url;
    const file = fd.get('file');
    if (file instanceof File && file.size > 0) {
      try { image = await imageToDataUrl(file); }
      catch { return showError('No se pudo procesar la imagen. Prueba con un archivo JPG, PNG o WebP.'); }
    }
    const existing = projects.find((p) => p.id === id);
    const item: Project = { id, title: titleValue, description, service, tone, image, featured, demo, order: existing?.order ?? projects.length + 1 };
    const next = existing ? projects.map((p) => p.id === id ? item : p) : [...projects, item];
    try { saveProjects(next); }
    catch { return showError('El almacenamiento local está lleno. Usa una imagen más pequeña o una URL.'); }
    dialog.close(); render(); announce(existing ? 'Proyecto actualizado.' : 'Proyecto creado.');
  });

  render();
}

async function imageToDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Formato no compatible');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.72);
}

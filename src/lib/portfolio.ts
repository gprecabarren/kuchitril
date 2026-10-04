import { starterProjects, type Project, type Service } from '../data/projects';

const STORAGE_KEY = 'kuchitril-prototype-projects-v1';
const allowedServices = new Set<Service>(['Branding', 'Marketing digital', 'Desarrollo web', 'Audiovisual']);
const allowedTones = new Set<Project['tone']>(['mint', 'orange', 'cream', 'teal', 'dark']);

export function readProjects(): Project[] {
  if (typeof window === 'undefined') return starterProjects;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(starterProjects);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return structuredClone(starterProjects);
    return parsed.filter((item): item is Project => {
      if (!item || typeof item !== 'object') return false;
      const p = item as Partial<Project>;
      return typeof p.id === 'string' && typeof p.title === 'string' &&
        typeof p.description === 'string' && typeof p.image === 'string' &&
        typeof p.order === 'number' && typeof p.featured === 'boolean' &&
        typeof p.demo === 'boolean' && allowedServices.has(p.service as Service) &&
        allowedTones.has(p.tone as Project['tone']);
    }).sort((a, b) => a.order - b.order);
  } catch {
    return structuredClone(starterProjects);
  }
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  window.dispatchEvent(new CustomEvent('portfolio:change'));
}

export function resetProjects(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('portfolio:change'));
}

export function cardElement(project: Project, index: number): HTMLElement {
  const article = document.createElement('article');
  article.className = `project-card tone-${project.tone}`;
  article.dataset.projectId = project.id;
  article.style.setProperty('--card-index', String(index));

  const media = document.createElement('div');
  media.className = 'project-card__media';
  if (project.image) {
    const img = document.createElement('img');
    img.src = project.image;
    img.alt = project.demo ? 'Imagen referencial del prototipo' : project.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    media.append(img);
  } else {
    const glyph = document.createElement('span');
    glyph.className = 'project-card__glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = project.service === 'Desarrollo web' ? '</>' : '✳';
    media.append(glyph);
  }
  const number = document.createElement('span');
  number.className = 'project-card__number';
  number.textContent = String(index + 1).padStart(2, '0');
  media.append(number);

  const content = document.createElement('div');
  content.className = 'project-card__content';
  const meta = document.createElement('div');
  meta.className = 'project-card__meta';
  const category = document.createElement('span');
  category.textContent = project.service;
  const status = document.createElement('span');
  status.textContent = project.demo ? 'Vista de muestra' : 'Proyecto';
  meta.append(category, status);
  const title = document.createElement('h3');
  title.textContent = project.title;
  const description = document.createElement('p');
  description.textContent = project.description;
  content.append(meta, title, description);
  article.append(media, content);
  return article;
}

export function renderProjectGrid(container: HTMLElement, featuredOnly = false): void {
  const projects = readProjects().filter((project) => !featuredOnly || project.featured)
    .sort((a, b) => a.order - b.order);
  container.replaceChildren(...projects.map(cardElement));
  if (projects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'portfolio-empty';
    empty.textContent = featuredOnly
      ? 'Selecciona proyectos destacados en el panel para verlos aquí.'
      : 'Todavía no hay proyectos. Puedes agregar el primero desde el panel.';
    container.append(empty);
  }
}

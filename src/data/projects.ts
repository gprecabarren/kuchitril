export type Service = 'Branding' | 'Marketing digital' | 'Desarrollo web' | 'Audiovisual';

export type Project = {
  id: string;
  title: string;
  service: Service;
  description: string;
  image: string;
  tone: 'mint' | 'orange' | 'cream' | 'teal' | 'dark';
  featured: boolean;
  order: number;
  demo: boolean;
};

export const starterProjects: Project[] = [
  {
    id: 'identidad',
    title: 'Una marca con personalidad',
    service: 'Branding',
    description: 'Exploración de identidad visual a partir del material compartido para el prototipo.',
    image: '/assets/referencia-color.webp',
    tone: 'mint',
    featured: true,
    order: 1,
    demo: true,
  },
  {
    id: 'historia',
    title: 'Historias que conectan',
    service: 'Audiovisual',
    description: 'Un espacio para mostrar dirección, grabación y edición de contenido real.',
    image: '/assets/fundador.webp',
    tone: 'orange',
    featured: true,
    order: 2,
    demo: true,
  },
  {
    id: 'digital',
    title: 'Ideas en pantalla',
    service: 'Desarrollo web',
    description: 'Sitios que convierten una primera visita en una relación con la marca.',
    image: '',
    tone: 'teal',
    featured: true,
    order: 3,
    demo: true,
  },
  {
    id: 'presencia',
    title: 'Presencia que se nota',
    service: 'Marketing digital',
    description: 'Contenido y estrategia para que las buenas ideas lleguen más lejos.',
    image: '',
    tone: 'cream',
    featured: true,
    order: 4,
    demo: true,
  },
  {
    id: 'territorio',
    title: 'Un nuevo territorio',
    service: 'Branding',
    description: 'Dirección visual que le da una voz propia a cada punto de contacto.',
    image: '/assets/kuchitril-referencia.webp',
    tone: 'dark',
    featured: false,
    order: 5,
    demo: true,
  },
];

export const services: Service[] = ['Marketing digital', 'Desarrollo web', 'Audiovisual', 'Branding'];

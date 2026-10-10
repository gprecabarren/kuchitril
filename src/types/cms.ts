export interface AuditFields {
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CollectionFields extends AuditFields {
  id: string;
  published: boolean;
  sort_order: number;
  deleted_at: string | null;
}

export interface Work extends CollectionFields {
  title: string;
  description: string;
  client: string;
  category: string;
  image_url: string;
  image_alt: string;
  link_url: string;
  featured: boolean;
}

export interface TeamMember extends CollectionFields {
  name: string;
  role: string;
  photo_url: string;
  photo_alt: string;
  exclude_name_from_index: boolean;
}

export interface Testimonial extends CollectionFields {
  quote: string;
  name: string;
  company: string;
  photo_url: string;
  background_color: string;
  text_color: string;
}

export interface SiteSettings extends AuditFields {
  id: number;
  home_title: string;
  home_description: string;
  og_image_url: string;
  instagram_url: string;
  portfolio_url: string;
  video_url: string;
  video_poster_url: string;
  video_mime: '' | 'video/mp4' | 'video/webm';
  video_autoplay: boolean;
  founder_photo_url: string;
}

export interface CmsMedia {
  id: string;
  staging_path: string;
  public_path: string | null;
  bucket: 'cms-images' | 'cms-videos';
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';
  size_bytes: number;
  status: 'pending' | 'ready' | 'rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SiteContent {
  works: Work[];
  team: TeamMember[];
  testimonials: Testimonial[];
  settings: SiteSettings;
  /** False when configuration is absent or the data request fails. */
  configured: boolean;
}

type Table<Row, RequiredInsert extends keyof Row = never> = {
  Row: { [K in keyof Row]: Row[K] };
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      works: Table<Work, 'title'>;
      team_members: Table<TeamMember, 'name' | 'role'>;
      testimonials: Table<Testimonial, 'quote' | 'name'>;
      site_settings: Table<SiteSettings>;
      cms_media: Table<CmsMedia, 'staging_path' | 'bucket' | 'mime_type' | 'size_bytes' | 'created_by'>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ProfileRole = "student" | "admin";

export type ProfileBannerPreset =
  | "nebula"
  | "aurora"
  | "midnight_grid"
  | "sunset_code"
  | "emerald_matrix"
  | "cyber_ocean";

export type ProfileAccentTheme =
  | "violet"
  | "cyan"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo";

export type ProfileAvatarFrame =
  | "none"
  | "glow"
  | "pixel"
  | "gradient"
  | "emerald";

export type OctopyCompanionMood =
  | "default"
  | "coding"
  | "headphones"
  | "happy";

export type SandboxLanguage =
  | "html_css_js"
  | "html"
  | "css"
  | "javascript"
  | "typescript"
  | "python"
  | "react"
  | "nodejs"
  | "java"
  | "csharp"
  | "cpp"
  | "go"
  | "rust"
  | "sql"
  | "php";

export type SandboxRuntimeTarget =
  | "client_iframe"
  | "client_pyodide"
  | "remote_judge0"
  | "remote_piston";

export type SandboxVisibility = "private" | "unlisted" | "public_portfolio";

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: ProfileRole;
  bio: string | null;
  github_username: string | null;
  headline: string | null;
  location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  banner_preset: ProfileBannerPreset;
  accent_theme: ProfileAccentTheme;
  avatar_frame: ProfileAvatarFrame;
  octopy_companion: OctopyCompanionMood;
  skills: string[];
  show_email: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string | null;
  role?: ProfileRole;
  bio?: string | null;
  github_username?: string | null;
  headline?: string | null;
  location?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  banner_preset?: ProfileBannerPreset;
  accent_theme?: ProfileAccentTheme;
  avatar_frame?: ProfileAvatarFrame;
  octopy_companion?: OctopyCompanionMood;
  skills?: string[];
  show_email?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = {
  email?: string;
  full_name?: string;
  avatar_url?: string | null;
  role?: ProfileRole;
  bio?: string | null;
  github_username?: string | null;
  headline?: string | null;
  location?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  banner_preset?: ProfileBannerPreset;
  accent_theme?: ProfileAccentTheme;
  avatar_frame?: ProfileAvatarFrame;
  octopy_companion?: OctopyCompanionMood;
  skills?: string[];
  show_email?: boolean;
  updated_at?: string;
};

export type SandboxProjectRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  primary_language: SandboxLanguage;
  runtime_target: SandboxRuntimeTarget;
  source_code: string;
  visibility: SandboxVisibility;
  share_slug: string | null;
  is_pinned: boolean;
  tags: string[];
  repository_url: string | null;
  live_url: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SandboxProjectInsert = {
  id?: string;
  user_id: string;
  title: string;
  description?: string | null;
  primary_language?: SandboxLanguage;
  runtime_target?: SandboxRuntimeTarget;
  source_code?: string;
  visibility?: SandboxVisibility;
  share_slug?: string | null;
  is_pinned?: boolean;
  tags?: string[];
  repository_url?: string | null;
  live_url?: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SandboxProjectUpdate = {
  title?: string;
  description?: string | null;
  primary_language?: SandboxLanguage;
  runtime_target?: SandboxRuntimeTarget;
  source_code?: string;
  visibility?: SandboxVisibility;
  share_slug?: string | null;
  is_pinned?: boolean;
  tags?: string[];
  repository_url?: string | null;
  live_url?: string | null;
  version?: number;
  updated_at?: string;
  deleted_at?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      sandbox_projects: {
        Row: SandboxProjectRow;
        Insert: SandboxProjectInsert;
        Update: SandboxProjectUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_sandbox_projects_user_id";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

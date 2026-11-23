export type ProfileRole = "student" | "admin";

export type SandboxLanguage =
  | "html_css_js"
  | "python"
  | "javascript"
  | "typescript";

export type SandboxRuntimeTarget =
  | "client_iframe"
  | "client_pyodide"
  | "remote_judge0"
  | "remote_piston";

export type SandboxVisibility =
  | "private"
  | "friends"
  | "unlisted"
  | "public_portfolio";

export type FriendshipStatus = "pending" | "accepted";

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  role: ProfileRole;
  bio: string | null;
  github_username: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  email: string;
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
  role?: ProfileRole;
  bio?: string | null;
  github_username?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = {
  email?: string;
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
  role?: ProfileRole;
  bio?: string | null;
  github_username?: string | null;
  updated_at?: string;
};

export type PublicProfileRow = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  github_username: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProfileInsert = {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  github_username?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PublicProfileUpdate = {
  username?: string;
  full_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  github_username?: string | null;
  updated_at?: string;
};

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
};

export type FriendshipInsert = {
  id?: string;
  requester_id: string;
  addressee_id: string;
  status?: FriendshipStatus;
  created_at?: string;
  updated_at?: string;
  accepted_at?: string | null;
};

export type FriendshipUpdate = {
  status?: FriendshipStatus;
  updated_at?: string;
  accepted_at?: string | null;
};

export type ProjectLikeRow = {
  project_id: string;
  user_id: string;
  created_at: string;
};

export type ProjectLikeInsert = {
  project_id: string;
  user_id: string;
  created_at?: string;
};

export type ProjectLikeUpdate = {
  created_at?: string;
};

export type ProjectCommentRow = {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type ProjectCommentInsert = {
  id?: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at?: string;
  updated_at?: string;
};

export type ProjectCommentUpdate = {
  content?: string;
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
      public_profiles: {
        Row: PublicProfileRow;
        Insert: PublicProfileInsert;
        Update: PublicProfileUpdate;
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friendships: {
        Row: FriendshipRow;
        Insert: FriendshipInsert;
        Update: FriendshipUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_friendships_requester_id";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_friendships_addressee_id";
            columns: ["addressee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_likes: {
        Row: ProjectLikeRow;
        Insert: ProjectLikeInsert;
        Update: ProjectLikeUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_project_likes_project_id";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "sandbox_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_project_likes_user_id";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_comments: {
        Row: ProjectCommentRow;
        Insert: ProjectCommentInsert;
        Update: ProjectCommentUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_project_comments_project_id";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "sandbox_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_project_comments_user_id";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
    Functions: {
      get_profile_friend_count: {
        Args: {
          p_user_id: string;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

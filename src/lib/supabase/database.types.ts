export type ProfileRole = "student" | "admin";

export type AppColorMode = "system" | "light" | "dark";

export type AppThemeId =
  | "original"
  | "ocean_circuit"
  | "amber_terminal"
  | "forest_syntax"
  | "nordic_frost"
  | "mono_graphite";

export type WallpaperPresetId =
  | "original"
  | "blueprint_grid"
  | "circuit_traces"
  | "topographic_flow"
  | "constellation_nodes"
  | "isometric_matrix"
  | "aurora_mesh"
  | "minimal_paper";

export type WallpaperIntensity = "subtle" | "balanced" | "vivid";

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

export type SandboxVisibility =
  | "private"
  | "friends"
  | "unlisted"
  | "public_portfolio";

export type FriendshipStatus = "pending" | "accepted";

export type ChatConversationKind = "direct" | "group";

export type ChatMemberRole = "owner" | "member";

export type ChatMessageType = "text" | "system";

export type NotificationCategory =
  | "message"
  | "voice_call"
  | "project_like"
  | "project_comment"
  | "friend_request"
  | "friend_accepted"
  | "group_invite";

export type NotificationPreferencesJson = {
  mute_all?: boolean;
  toast_enabled?: boolean;
  sound_enabled?: boolean;
  browser_push_enabled?: boolean;
  categories?: {
    messages?: boolean;
    voice_calls?: boolean;
    project_likes?: boolean;
    project_comments?: boolean;
    friend_requests?: boolean;
    friend_accepted?: boolean;
    group_invites?: boolean;
  };
  muted_conversation_ids?: string[];
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  username: string;
  username_changed_at: string | null;
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
  color_mode?: AppColorMode;
  app_theme?: AppThemeId;
  wallpaper_preset?: WallpaperPresetId;
  wallpaper_intensity?: WallpaperIntensity;
  notification_prefs?: NotificationPreferencesJson;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  email: string;
  full_name?: string;
  username?: string;
  username_changed_at?: string | null;
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
  color_mode?: AppColorMode;
  app_theme?: AppThemeId;
  wallpaper_preset?: WallpaperPresetId;
  wallpaper_intensity?: WallpaperIntensity;
  notification_prefs?: NotificationPreferencesJson;
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
  color_mode?: AppColorMode;
  app_theme?: AppThemeId;
  wallpaper_preset?: WallpaperPresetId;
  wallpaper_intensity?: WallpaperIntensity;
  notification_prefs?: NotificationPreferencesJson;
  updated_at?: string;
};

export type PublicProfileRow = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
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
  headline?: string | null;
  location?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  banner_preset?: ProfileBannerPreset;
  accent_theme?: ProfileAccentTheme;
  avatar_frame?: ProfileAvatarFrame;
  octopy_companion?: OctopyCompanionMood;
  skills?: string[];
  created_at?: string;
  updated_at?: string;
};

export type PublicProfileUpdate = {
  username?: string;
  full_name?: string;
  avatar_url?: string | null;
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

export type ChatConversationRow = {
  id: string;
  kind: ChatConversationKind;
  title: string | null;
  created_by: string;
  direct_pair_key: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatConversationInsert = {
  id?: string;
  kind: ChatConversationKind;
  title?: string | null;
  created_by: string;
  direct_pair_key?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ChatConversationUpdate = {
  title?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  updated_at?: string;
};

export type ChatConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  role: ChatMemberRole;
  added_by: string | null;
  joined_at: string;
  left_at: string | null;
  last_read_at: string;
  updated_at: string;
};

export type ChatConversationMemberInsert = {
  conversation_id: string;
  user_id: string;
  role?: ChatMemberRole;
  added_by?: string | null;
  joined_at?: string;
  left_at?: string | null;
  last_read_at?: string;
  updated_at?: string;
};

export type ChatConversationMemberUpdate = {
  role?: ChatMemberRole;
  added_by?: string | null;
  left_at?: string | null;
  last_read_at?: string;
  updated_at?: string;
};

export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: ChatMessageType;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChatMessageInsert = {
  id?: string;
  conversation_id: string;
  sender_id: string;
  message_type?: ChatMessageType;
  content: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ChatMessageUpdate = {
  deleted_at?: string | null;
  updated_at?: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link_href: string | null;
  entity_key: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationInsert = {
  id?: string;
  recipient_id: string;
  actor_id?: string | null;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  link_href?: string | null;
  entity_key?: string | null;
  read_at?: string | null;
  created_at?: string;
};

export type NotificationUpdate = {
  read_at?: string | null;
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
      chat_conversations: {
        Row: ChatConversationRow;
        Insert: ChatConversationInsert;
        Update: ChatConversationUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_chat_conversations_created_by";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_conversation_members: {
        Row: ChatConversationMemberRow;
        Insert: ChatConversationMemberInsert;
        Update: ChatConversationMemberUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_chat_members_conversation_id";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_chat_members_user_id";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: ChatMessageInsert;
        Update: ChatMessageUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_chat_messages_conversation_id";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_chat_messages_sender_id";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
        Relationships: [
          {
            foreignKeyName: "fk_notifications_recipient_id";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_notifications_actor_id";
            columns: ["actor_id"];
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
      are_users_friends: {
        Args: {
          p_user_a: string;
          p_user_b: string;
        };
        Returns: boolean;
      };
      can_send_chat_message: {
        Args: {
          p_conversation_id: string;
        };
        Returns: boolean;
      };
      get_or_create_direct_conversation: {
        Args: {
          p_friend_id: string;
        };
        Returns: string;
      };
      create_group_conversation: {
        Args: {
          p_title: string;
          p_member_ids: string[];
        };
        Returns: string;
      };
      add_group_conversation_members: {
        Args: {
          p_conversation_id: string;
          p_member_ids: string[];
        };
        Returns: number;
      };
      remove_or_leave_group_member: {
        Args: {
          p_conversation_id: string;
          p_target_user_id?: string;
        };
        Returns: boolean;
      };
      rename_group_conversation: {
        Args: {
          p_conversation_id: string;
          p_title: string;
        };
        Returns: boolean;
      };
      mark_conversation_read: {
        Args: {
          p_conversation_id: string;
        };
        Returns: boolean;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      clear_read_notifications: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_permissions: {
        Row: {
          created_at: string
          description_ckb: string
          module: string
          permission: string
        }
        Insert: {
          created_at?: string
          description_ckb: string
          module: string
          permission: string
        }
        Update: {
          created_at?: string
          description_ckb?: string
          module?: string
          permission?: string
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          created_at: string
          description_ckb: string
          is_system: boolean
          label_ckb: string
          label_en: string
          merchant_category: string | null
          role: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_ckb?: string
          is_system?: boolean
          label_ckb: string
          label_en: string
          merchant_category?: string | null
          role: string
          sort_order: number
        }
        Update: {
          created_at?: string
          description_ckb?: string
          is_system?: boolean
          label_ckb?: string
          label_en?: string
          merchant_category?: string | null
          role?: string
          sort_order?: number
        }
        Relationships: []
      }
      catalog_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_ar: string | null
          name_ckb: string
          name_en: string | null
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_ckb: string
          name_en?: string | null
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_ckb?: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rule_events: {
        Row: {
          actor_user_id: string
          created_at: string
          event_type: string
          id: string
          new_values: Json | null
          previous_values: Json | null
          reason: string
          rule_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          event_type: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          reason: string
          rule_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          reason?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rule_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          amount_iqd: number | null
          basis_points: number | null
          calculation_basis: string
          calculation_method: string
          charge_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          rule_key: string
          scope_type: string
          store_id: string | null
        }
        Insert: {
          amount_iqd?: number | null
          basis_points?: number | null
          calculation_basis: string
          calculation_method: string
          charge_type: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          rule_key: string
          scope_type: string
          store_id?: string | null
        }
        Update: {
          amount_iqd?: number | null
          basis_points?: number | null
          calculation_basis?: string
          calculation_method?: string
          charge_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          rule_key?: string
          scope_type?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line: string
          city: string
          created_at: string
          customer_id: string
          delivery_notes: string | null
          district: string
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          phone: string
          recipient_name: string
          updated_at: string
        }
        Insert: {
          address_line: string
          city: string
          created_at?: string
          customer_id: string
          delivery_notes?: string | null
          district: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          phone: string
          recipient_name: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          city?: string
          created_at?: string
          customer_id?: string
          delivery_notes?: string | null
          district?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string
          recipient_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          cancelled_at: string | null
          captain_user_id: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          id: string
          merchant_user_id: string
          order_id: string
          order_store_id: string
          picked_up_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          cancelled_at?: string | null
          captain_user_id?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          id?: string
          merchant_user_id: string
          order_id: string
          order_store_id: string
          picked_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          cancelled_at?: string | null
          captain_user_id?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          id?: string
          merchant_user_id?: string
          order_id?: string
          order_store_id?: string
          picked_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_order_store_id_fkey"
            columns: ["order_store_id"]
            isOneToOne: true
            referencedRelation: "order_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_location_updates: {
        Row: {
          accuracy_meters: number | null
          assignment_id: string
          captain_user_id: string
          customer_id: string
          heading_degrees: number | null
          id: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at: string
          speed_meters_per_second: number | null
        }
        Insert: {
          accuracy_meters?: number | null
          assignment_id: string
          captain_user_id: string
          customer_id: string
          heading_degrees?: number | null
          id?: string
          latitude: number
          longitude: number
          order_id: string
          recorded_at?: string
          speed_meters_per_second?: number | null
        }
        Update: {
          accuracy_meters?: number | null
          assignment_id?: string
          captain_user_id?: string
          customer_id?: string
          heading_degrees?: number | null
          id?: string
          latitude?: number
          longitude?: number
          order_id?: string
          recorded_at?: string
          speed_meters_per_second?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_location_updates_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_location_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          base_fee_iqd: number
          city: string
          created_at: string
          district: string | null
          id: string
          is_active: boolean
          maximum_distance_km: number | null
          maximum_fee_iqd: number | null
          minimum_fee_iqd: number
          name_ckb: string
          per_km_fee_iqd: number
          updated_at: string
        }
        Insert: {
          base_fee_iqd?: number
          city: string
          created_at?: string
          district?: string | null
          id?: string
          is_active?: boolean
          maximum_distance_km?: number | null
          maximum_fee_iqd?: number | null
          minimum_fee_iqd?: number
          name_ckb: string
          per_km_fee_iqd?: number
          updated_at?: string
        }
        Update: {
          base_fee_iqd?: number
          city?: string
          created_at?: string
          district?: string | null
          id?: string
          is_active?: boolean
          maximum_distance_km?: number | null
          maximum_fee_iqd?: number | null
          minimum_fee_iqd?: number
          name_ckb?: string
          per_km_fee_iqd?: number
          updated_at?: string
        }
        Relationships: []
      }
      merchant_applications: {
        Row: {
          address_line: string
          applicant_id: string
          business_name: string
          city: string
          contact_person: string
          created_at: string
          description: string | null
          district: string
          id: string
          merchant_category: string
          phone: string
          proposed_slug: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          address_line: string
          applicant_id?: string
          business_name: string
          city: string
          contact_person: string
          created_at?: string
          description?: string | null
          district: string
          id?: string
          merchant_category: string
          phone: string
          proposed_slug?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          applicant_id?: string
          business_name?: string
          city?: string
          contact_person?: string
          created_at?: string
          description?: string | null
          district?: string
          id?: string
          merchant_category?: string
          phone?: string
          proposed_slug?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_applications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          commission_per_kg_iqd: number | null
          created_at: string
          customer_id: string
          id: string
          line_total_iqd: number
          merchant_commission_iqd: number
          merchant_user_id: string
          order_id: string
          order_store_id: string
          product_id: string | null
          product_snapshot: Json
          quantity: number
          store_id: string
          unit: string
          unit_price_iqd: number
          weight_kg: number | null
        }
        Insert: {
          commission_per_kg_iqd?: number | null
          created_at?: string
          customer_id: string
          id?: string
          line_total_iqd: number
          merchant_commission_iqd?: number
          merchant_user_id: string
          order_id: string
          order_store_id: string
          product_id?: string | null
          product_snapshot: Json
          quantity: number
          store_id: string
          unit: string
          unit_price_iqd: number
          weight_kg?: number | null
        }
        Update: {
          commission_per_kg_iqd?: number | null
          created_at?: string
          customer_id?: string
          id?: string
          line_total_iqd?: number
          merchant_commission_iqd?: number
          merchant_user_id?: string
          order_id?: string
          order_store_id?: string
          product_id?: string | null
          product_snapshot?: Json
          quantity?: number
          store_id?: string
          unit?: string
          unit_price_iqd?: number
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_store_id_fkey"
            columns: ["order_store_id"]
            isOneToOne: false
            referencedRelation: "order_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          customer_id: string
          id: string
          merchant_user_id: string | null
          new_status: string
          note: string | null
          order_id: string
          order_store_id: string | null
          previous_status: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          merchant_user_id?: string | null
          new_status: string
          note?: string | null
          order_id: string
          order_store_id?: string | null
          previous_status?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          merchant_user_id?: string | null
          new_status?: string
          note?: string | null
          order_id?: string
          order_store_id?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_events_order_store_id_fkey"
            columns: ["order_store_id"]
            isOneToOne: false
            referencedRelation: "order_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stores: {
        Row: {
          commission_snapshot: Json
          created_at: string
          customer_id: string
          id: string
          items_subtotal_iqd: number
          merchant_commission_iqd: number
          merchant_user_id: string
          order_id: string
          status: string
          store_id: string
          store_name_snapshot: string
          updated_at: string
        }
        Insert: {
          commission_snapshot?: Json
          created_at?: string
          customer_id: string
          id?: string
          items_subtotal_iqd: number
          merchant_commission_iqd?: number
          merchant_user_id: string
          order_id: string
          status?: string
          store_id: string
          store_name_snapshot: string
          updated_at?: string
        }
        Update: {
          commission_snapshot?: Json
          created_at?: string
          customer_id?: string
          id?: string
          items_subtotal_iqd?: number
          merchant_commission_iqd?: number
          merchant_user_id?: string
          order_id?: string
          status?: string
          store_id?: string
          store_name_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_stores_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          address_snapshot: Json
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          delivered_at: string | null
          delivery_fee_iqd: number
          delivery_zone_id: string | null
          discount_iqd: number
          distance_km: number | null
          id: string
          idempotency_key: string
          items_subtotal_iqd: number
          order_number: string
          payment_method: string
          payment_status: string
          placed_at: string
          status: string
          tax_iqd: number
          total_iqd: number
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          address_snapshot: Json
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_fee_iqd?: number
          delivery_zone_id?: string | null
          discount_iqd?: number
          distance_km?: number | null
          id?: string
          idempotency_key: string
          items_subtotal_iqd: number
          order_number?: string
          payment_method: string
          payment_status?: string
          placed_at?: string
          status?: string
          tax_iqd?: number
          total_iqd: number
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_fee_iqd?: number
          delivery_zone_id?: string | null
          discount_iqd?: number
          distance_km?: number | null
          id?: string
          idempotency_key?: string
          items_subtotal_iqd?: number
          order_number?: string
          payment_method?: string
          payment_status?: string
          placed_at?: string
          status?: string
          tax_iqd?: number
          total_iqd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      post_audit_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at: string
          id: string
          new_status: string
          post_id: string
          previous_status: string | null
          title_snapshot: string
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at?: string
          id?: string
          new_status: string
          post_id: string
          previous_status?: string | null
          title_snapshot: string
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          new_status?: string
          post_id?: string
          previous_status?: string | null
          title_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_audit_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_user_id: string
          body: string
          category: string
          cover_image_url: string | null
          created_at: string
          excerpt: string
          id: string
          published_at: string | null
          product_id: string | null
          slug: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          category?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt: string
          id?: string
          published_at?: string | null
          product_id?: string | null
          slug: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          category?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published_at?: string | null
          product_id?: string | null
          slug?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_moderation_events: {
        Row: {
          actor_role: string
          actor_user_id: string
          created_at: string
          id: string
          new_status: string
          previous_status: string
          product_id: string
          reason: string
          reviewed_updated_at: string
          store_id: string
        }
        Insert: {
          actor_role: string
          actor_user_id: string
          created_at?: string
          id?: string
          new_status: string
          previous_status: string
          product_id: string
          reason: string
          reviewed_updated_at: string
          store_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string
          product_id?: string
          reason?: string
          reviewed_updated_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_moderation_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_moderation_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          compare_at_price_iqd: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          max_order_quantity: number | null
          min_order_quantity: number
          name: string
          price_iqd: number
          quantity_step: number
          sku: string | null
          status: string
          stock_quantity: number | null
          store_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          compare_at_price_iqd?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_order_quantity?: number | null
          min_order_quantity?: number
          name: string
          price_iqd: number
          quantity_step?: number
          sku?: string | null
          status?: string
          stock_quantity?: number | null
          store_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          compare_at_price_iqd?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_order_quantity?: number | null
          min_order_quantity?: number
          name?: string
          price_iqd?: number
          quantity_step?: number
          sku?: string | null
          status?: string
          stock_quantity?: number | null
          store_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          preferred_locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_assignment_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_role: string
          previous_role: string | null
          reason: string
          target_user_id: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_role: string
          previous_role?: string | null
          reason: string
          target_user_id: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_role?: string
          previous_role?: string | null
          reason?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignment_events_new_role_fkey"
            columns: ["new_role"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["role"]
          },
          {
            foreignKeyName: "role_assignment_events_previous_role_fkey"
            columns: ["previous_role"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["role"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          permission?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["permission"]
          },
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["role"]
          },
        ]
      }
      store_moderation_events: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          new_status: string
          note: string
          previous_status: string
          store_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          new_status: string
          note: string
          previous_status: string
          store_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          new_status?: string
          note?: string
          previous_status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_moderation_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address_line: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          description: string | null
          district: string | null
          id: string
          is_platform_store: boolean
          logo_url: string | null
          merchant_category: string | null
          name: string
          owner_id: string | null
          phone: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          is_platform_store?: boolean
          logo_url?: string | null
          merchant_category?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          is_platform_store?: boolean
          logo_url?: string | null
          merchant_category?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallet_accounts: {
        Row: {
          account_key: string
          account_type: string
          created_at: string
          id: string
          status: string
          store_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_key: string
          account_type: string
          created_at?: string
          id?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_key?: string
          account_type?: string
          created_at?: string
          id?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger_entries: {
        Row: {
          amount_iqd: number
          created_at: string
          entry_type: string
          id: string
          memo: string | null
          owner_user_id: string | null
          store_id: string | null
          transaction_id: string
          wallet_account_id: string
        }
        Insert: {
          amount_iqd: number
          created_at?: string
          entry_type: string
          id?: string
          memo?: string | null
          owner_user_id?: string | null
          store_id?: string | null
          transaction_id: string
          wallet_account_id: string
        }
        Update: {
          amount_iqd?: number
          created_at?: string
          entry_type?: string
          id?: string
          memo?: string | null
          owner_user_id?: string | null
          store_id?: string | null
          transaction_id?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_entries_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_entries_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallet_balances"
            referencedColumns: ["wallet_account_id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_iqd: number
          created_at: string
          created_by_user_id: string | null
          currency: string
          external_reference: string | null
          id: string
          idempotency_key: string
          metadata: Json
          owner_user_id: string | null
          posted_at: string | null
          source_order_id: string | null
          status: string
          transaction_type: string
        }
        Insert: {
          amount_iqd: number
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          owner_user_id?: string | null
          posted_at?: string | null
          source_order_id?: string | null
          status?: string
          transaction_type: string
        }
        Update: {
          amount_iqd?: number
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          owner_user_id?: string | null
          posted_at?: string | null
          source_order_id?: string | null
          status?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      wallet_balances: {
        Row: {
          account_key: string | null
          account_type: string | null
          balance_iqd: number | null
          ledger_entry_count: number | null
          status: string | null
          store_id: string | null
          user_id: string | null
          wallet_account_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_list_captain_scopes_v1: {
        Args: never
        Returns: {
          email: string | null
          email_confirmed: boolean
          full_name: string
          is_active: boolean
          scope_type: string
          user_id: string
          zone_ids: string[]
        }[]
      }
      admin_manage_captain_scope_v1: {
        Args: {
          p_captain_user_id: string
          p_is_active: boolean
          p_scope_type: string
          p_zone_ids: string[]
        }
        Returns: Json
      }
      admin_assign_delivery_captain_v1: {
        Args: { p_assignment_id: string; p_captain_user_id: string }
        Returns: Json
      }
      admin_list_available_captains_v1: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      admin_set_product_status_v1: {
        Args: {
          p_expected_updated_at: string
          p_new_status: string
          p_product_id: string
          p_reason: string
        }
        Returns: Json
      }
      approve_merchant_application: {
        Args: {
          p_application_id: string
          p_review_note?: string
          p_reviewer_id: string
        }
        Returns: {
          applicant_id: string
          merchant_category: string
          store_id: string
        }[]
      }
      calculate_delivery_split: {
        Args: { p_delivery_fee_iqd: number }
        Returns: {
          captain_fee_iqd: number
          platform_fee_iqd: number
        }[]
      }
      calculate_merchant_commission: {
        Args: {
          p_goods_subtotal_iqd: number
          p_store_id: string
          p_weight_kg: number
        }
        Returns: number
      }
      captain_update_delivery_status_v1: {
        Args: { p_assignment_id: string; p_new_status: string; p_note?: string }
        Returns: Json
      }
      create_order_v1: {
        Args: {
          p_address_id: string
          p_customer_note?: string
          p_idempotency_key: string
          p_items: Json
          p_payment_method?: string
        }
        Returns: Json
      }
      current_app_role: { Args: never; Returns: string }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      manage_delivery_zone_v1: {
        Args: {
          p_base_fee_iqd: number
          p_city: string
          p_district: string
          p_is_active: boolean
          p_maximum_distance_km: number
          p_maximum_fee_iqd: number
          p_minimum_fee_iqd: number
          p_name_ckb: string
          p_per_km_fee_iqd: number
          p_zone_id: string
        }
        Returns: {
          base_fee_iqd: number
          city: string
          created_at: string
          district: string | null
          id: string
          is_active: boolean
          maximum_distance_km: number | null
          maximum_fee_iqd: number | null
          minimum_fee_iqd: number
          name_ckb: string
          per_km_fee_iqd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_zones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merchant_update_order_store_status_v1: {
        Args: {
          p_new_status: string
          p_note?: string
          p_order_store_id: string
        }
        Returns: Json
      }
      moderate_merchant_store: {
        Args: {
          p_actor_id: string
          p_new_status: string
          p_note: string
          p_store_id: string
        }
        Returns: {
          new_status: string
          previous_status: string
          store_id: string
        }[]
      }
      post_wallet_transaction: {
        Args: { p_entries: Json; p_transaction_id: string }
        Returns: {
          status: string
          total_debits_iqd: number
          transaction_id: string
        }[]
      }
      set_commission_rule: {
        Args: {
          p_amount_iqd: number
          p_basis_points: number
          p_calculation_basis: string
          p_calculation_method: string
          p_charge_type: string
          p_reason: string
          p_scope_type: string
          p_store_id: string
        }
        Returns: string
      }
      set_default_customer_address_v1: {
        Args: { p_address_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

-- M01: one-time bootstrap for the first verified Super Admin.
alter table public.role_assignment_events alter column actor_user_id drop not null;
alter table public.role_assignment_events add column actor_type text not null default 'user'
check(actor_type in ('user','bootstrap','system'));
alter table public.role_assignment_events add constraint role_assignment_actor_consistency
check ((actor_type='user' and actor_user_id is not null) or (actor_type in ('bootstrap','system') and actor_user_id is null));

create or replace function private.bootstrap_first_super_admin(p_user_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user auth.users%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
 if char_length(v_reason)<10 or char_length(v_reason)>1200 then
  raise exception 'invalid_bootstrap_reason' using errcode='22023';
 end if;
 if exists(select 1 from auth.users where raw_app_meta_data->>'role'='super_admin') then
  raise exception 'super_admin_already_bootstrapped' using errcode='P0001';
 end if;
 select * into v_user from auth.users where id=p_user_id and email_confirmed_at is not null for update;
 if not found then raise exception 'verified_user_not_found' using errcode='P0002'; end if;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role','super_admin') where id=p_user_id;
 insert into public.role_assignment_events(target_user_id,actor_user_id,actor_type,previous_role,new_role,reason)
 values(p_user_id,null,'bootstrap',null,'super_admin',v_reason);
end;
$$;
revoke all on function private.bootstrap_first_super_admin(uuid,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.bootstrap_first_super_admin(uuid,text) to service_role;
comment on function private.bootstrap_first_super_admin(uuid,text) is
'One-time project-owner bootstrap for the first verified super_admin; callable only with service_role.';

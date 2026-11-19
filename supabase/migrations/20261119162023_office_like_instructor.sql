-- Kontoret er som en lærer (aftalt 19. nov. 2026): kontoret planlægger (kalender, fravær), har elever og hold,
-- lokaler og køretøjer og beskeder. Godkendelser (registreringer), lønperioder, ferie-afgørelser, lærere og
-- roller, lærernes egne satser, ændringsloggen og oprydning i delte materialer og quizzer er nu kun for admin.

CREATE FUNCTION "private"."is_admin_for_person"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.school_members target
    join public.school_members me on me.school_id = target.school_id
    where target.user_id = p_user
      and me.user_id = (select auth.uid())
      and me.active
      and me.role = 'admin'
  );
$$;

DROP POLICY "Opret registrering" ON "public"."registrations";
CREATE POLICY "Opret registrering" ON "public"."registrations" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Ret registrering" ON "public"."registrations";
CREATE POLICY "Ret registrering" ON "public"."registrations" FOR UPDATE TO "authenticated" USING (("private"."is_admin"("school_id") OR (("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids")) AND ("status" = ANY (ARRAY['pending'::"public"."approval_status", 'rejected'::"public"."approval_status"]))))) WITH CHECK (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Se registreringer" ON "public"."registrations";
CREATE POLICY "Se registreringer" ON "public"."registrations" FOR SELECT TO "authenticated" USING (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Slet registrering" ON "public"."registrations";
CREATE POLICY "Slet registrering" ON "public"."registrations" FOR DELETE TO "authenticated" USING (("private"."is_admin"("school_id") OR (("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids")) AND ("status" = 'pending'::"public"."approval_status"))));


DROP POLICY "Kontoret opretter lønperioder" ON "public"."pay_periods";
CREATE POLICY "Kontoret opretter lønperioder" ON "public"."pay_periods" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"("school_id"));


DROP POLICY "Kontoret retter lønperioder" ON "public"."pay_periods";
CREATE POLICY "Kontoret retter lønperioder" ON "public"."pay_periods" FOR UPDATE TO "authenticated" USING ("private"."is_admin"("school_id")) WITH CHECK ("private"."is_admin"("school_id"));


DROP POLICY "Opret ferieanmodning" ON "public"."holidays";
CREATE POLICY "Opret ferieanmodning" ON "public"."holidays" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Ret ferie" ON "public"."holidays";
CREATE POLICY "Ret ferie" ON "public"."holidays" FOR UPDATE TO "authenticated" USING (("private"."is_admin"("school_id") OR (("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids")) AND ("status" = 'pending'::"public"."approval_status")))) WITH CHECK (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Slet ferie" ON "public"."holidays";
CREATE POLICY "Slet ferie" ON "public"."holidays" FOR DELETE TO "authenticated" USING (("private"."is_admin"("school_id") OR (("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids")) AND ("status" = 'pending'::"public"."approval_status"))));


DROP POLICY "Kontoret og læreren selv retter" ON "public"."instructors";
CREATE POLICY "Kontoret og læreren selv retter" ON "public"."instructors" FOR UPDATE TO "authenticated" USING (("private"."is_admin"("school_id") OR ("id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids")))) WITH CHECK (("private"."is_admin"("school_id") OR ("id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Kontoret opretter lærere" ON "public"."instructors";
CREATE POLICY "Kontoret opretter lærere" ON "public"."instructors" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"("school_id"));


DROP POLICY "Kontoret sletter lærere" ON "public"."instructors";
CREATE POLICY "Kontoret sletter lærere" ON "public"."instructors" FOR DELETE TO "authenticated" USING ("private"."is_admin"("school_id"));


DROP POLICY "Kontoret og læreren selv ser egne priser" ON "public"."instructor_prices";
CREATE POLICY "Kontoret og læreren selv ser egne priser" ON "public"."instructor_prices" FOR SELECT TO "authenticated" USING (("private"."is_admin"("school_id") OR ("instructor_id" IN ( SELECT "private"."my_instructor_ids"() AS "my_instructor_ids"))));


DROP POLICY "Kontoret ser skolens ændringslog" ON "public"."audit_log";
CREATE POLICY "Kontoret ser skolens ændringslog" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("private"."is_admin"("school_id"));


DROP POLICY "Ejeren retter, admin og kontor rydder op" ON "public"."materials";
CREATE POLICY "Ejeren retter, admin og kontor rydder op" ON "public"."materials" FOR UPDATE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("folder_id" IS NOT NULL) AND "private"."is_admin"("school_id")))) WITH CHECK ("private"."is_member"("school_id"));


DROP POLICY "Ejeren sletter, admin og kontor rydder op" ON "public"."materials";
CREATE POLICY "Ejeren sletter, admin og kontor rydder op" ON "public"."materials" FOR DELETE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("folder_id" IS NOT NULL) AND "private"."is_admin"("school_id"))));


DROP POLICY "Ejeren retter, admin og kontor rydder op" ON "public"."quizzes";
CREATE POLICY "Ejeren retter, admin og kontor rydder op" ON "public"."quizzes" FOR UPDATE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("shared" AND "private"."is_admin"("school_id")))) WITH CHECK ("private"."is_member"("school_id"));


DROP POLICY "Ejeren sletter, admin og kontor rydder op" ON "public"."quizzes";
CREATE POLICY "Ejeren sletter, admin og kontor rydder op" ON "public"."quizzes" FOR DELETE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("shared" AND "private"."is_admin"("school_id"))));


DROP POLICY "Opret medlemskab" ON "public"."school_members";
CREATE POLICY "Opret medlemskab" ON "public"."school_members" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_admin"("school_id") OR ( SELECT "private"."is_platform_owner"() AS "is_platform_owner")));


DROP POLICY "Ret medlemskab" ON "public"."school_members";
CREATE POLICY "Ret medlemskab" ON "public"."school_members" FOR UPDATE TO "authenticated" USING (("private"."is_admin"("school_id") OR ( SELECT "private"."is_platform_owner"() AS "is_platform_owner"))) WITH CHECK (("private"."is_admin"("school_id") OR ( SELECT "private"."is_platform_owner"() AS "is_platform_owner")));


DROP POLICY "Slet medlemskab" ON "public"."school_members";
CREATE POLICY "Slet medlemskab" ON "public"."school_members" FOR DELETE TO "authenticated" USING (("private"."is_admin"("school_id") OR ( SELECT "private"."is_platform_owner"() AS "is_platform_owner")));


DROP POLICY "Kontoret retter profiler på egne skoler" ON "public"."profiles";
CREATE POLICY "Kontoret retter profiler på egne skoler" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("private"."is_admin_for_person"("id")) WITH CHECK ("private"."is_admin_for_person"("id"));


CREATE OR REPLACE FUNCTION "private"."guard_registration_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_content_changed boolean := tg_op = 'UPDATE' and (
    new.service_id is distinct from old.service_id
    or new.lesson_count is distinct from old.lesson_count
    or new.start_time is distinct from old.start_time
    or new.lesson_date is distinct from old.lesson_date
    or new.instructor_id is distinct from old.instructor_id);
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Låst pris.
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status <> 'approved'
       or new.service_id is distinct from old.service_id
       or new.instructor_id is distinct from old.instructor_id
       or new.lesson_date is distinct from old.lesson_date then
      new.locked_unit_price_ore := public.unit_price_on(new.instructor_id, new.service_id, new.lesson_date);
      if new.locked_unit_price_ore is null then
        raise exception 'Ydelsen har ingen pris på lektionens dato, så lektionen kan ikke godkendes.'
          using errcode = 'check_violation';
      end if;
    else
      new.locked_unit_price_ore := old.locked_unit_price_ore;
    end if;
  else
    new.locked_unit_price_ore := null;
  end if;

  -- Hvem og hvornår.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    else
      new.decided_by := null;
      new.decided_at := null;
    end if;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;

  if new.status = 'rejected' and coalesce(btrim(new.decision_comment), '') = '' then
    raise exception 'Skriv en kommentar til læreren.' using errcode = 'check_violation';
  end if;

  -- Kontoret har rettet indholdet (læreren kan ikke sætte dette; se guard_registration).
  -- (En admin, der også underviser og retter sin egen lektion i lærer-appen, er ikke "kontoret".)
  if v_content_changed and private.is_admin(new.school_id)
     and new.instructor_id not in (select private.my_instructor_ids()) then
    new.office_edited_by := (select auth.uid());
    new.office_edited_at := now();
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."guard_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.lesson_date > (now() at time zone 'Europe/Copenhagen')::date then
    raise exception 'En registrering kan kun laves for i dag eller tidligere.'
      using errcode = 'check_violation';
  end if;

  if current_user = 'authenticated' and not private.is_admin(new.school_id) then
    if tg_op = 'UPDATE' and old.status = 'approved' then
      raise exception 'En godkendt registrering kan kun rettes af admin.'
        using errcode = 'insufficient_privilege';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.locked_unit_price_ore := null;
    if tg_op = 'INSERT' then
      new.decision_comment := null;
      new.office_edited_by := null;
      new.office_edited_at := null;
    else
      new.office_edited_by := old.office_edited_by;
      new.office_edited_at := old.office_edited_at;
    end if;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."guard_holiday"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user = 'authenticated' and not private.is_admin(new.school_id) then
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."guard_instructor_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  allowed text[] := array[
    'email', 'address', 'postal_code', 'city',
    'next_of_kin_name', 'next_of_kin_relation', 'next_of_kin_phone', 'updated_at'
  ];
begin
  if current_user = 'authenticated' and not private.is_admin(new.school_id)
     and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Du kan kun rette dine kontakt- og pårørendeoplysninger.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."can_edit_quiz"("p_quiz" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (q.owner_id = (select auth.uid()) or (q.shared and private.is_admin(q.school_id)))
  );
$$;

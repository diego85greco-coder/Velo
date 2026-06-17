-- Server-side account deletion
-- SECURITY DEFINER lets this function delete from auth.users (client cannot do this directly)
CREATE OR REPLACE FUNCTION public.delete_my_account(p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID;
  _email TEXT;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = uid;

  -- Save deletion record
  BEGIN
    INSERT INTO public.deleted_accounts (user_id, email, reason, deleted_at)
    VALUES (uid, _email, p_reason, NOW());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Remove all user data
  DELETE FROM public.user_favorites      WHERE user_id = uid;
  DELETE FROM public.user_favorites      WHERE fav_id  = uid;
  DELETE FROM public.guardian_presence   WHERE user_id = uid;
  DELETE FROM public.direct_messages     WHERE from_id = uid OR to_id = uid;
  DELETE FROM public.guardian_requests   WHERE seeker_id = uid OR guardian_id = uid;
  DELETE FROM public.help_posts          WHERE user_id = uid;
  DELETE FROM public.happy_posts         WHERE user_id = uid;
  DELETE FROM public.daily_responses     WHERE user_id = uid;
  DELETE FROM public.mood_entries        WHERE user_id = uid;
  DELETE FROM public.profiles            WHERE id = uid;

  -- Delete the auth user
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(TEXT) TO authenticated;

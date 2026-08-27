-- Migration: update notify_waitlist_entry() with project-specific URL fallback
-- Phase 7: Waitlist + WhatsApp
--
-- Supabase hosted does not allow ALTER DATABASE SET via migration runner.
-- This migration re-creates the trigger function with the actual project URL
-- and anon key hardcoded as the COALESCE fallback values.

CREATE OR REPLACE FUNCTION public.notify_waitlist_entry()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_url  text;
  v_key  text;
BEGIN
  -- Only fire when status transitions TO 'notified' (not on repeated updates)
  IF NEW.status = 'notified' AND (OLD.status IS DISTINCT FROM 'notified') THEN
    -- Use DB settings if configured; fall back to hardcoded project values
    v_url := COALESCE(
      current_setting('app.supabase_url', true),
      'https://shsrhxleopmovzpzqmex.supabase.co'
    ) || '/functions/v1/send-waitlist-notification';

    v_key := COALESCE(
      current_setting('app.supabase_anon_key', true),
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoc3JoeGxlb3Btb3Z6cHpxbWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTI3MDIsImV4cCI6MjA5MTc4ODcwMn0.loXkiAJXugCa28lMrdZSDMiy3srwtdS5G9czmHmOGRo'
    );

    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object('entryId', NEW.id::text),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.notify_waitlist_entry() CASCADE;
-- COMMIT;

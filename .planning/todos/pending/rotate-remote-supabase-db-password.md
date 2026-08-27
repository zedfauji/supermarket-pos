---
title: Rotate remote Supabase database password
date: 2026-08-27
priority: high
---

# Rotate remote Supabase DB password

The remote project (`mkvinyekkyennyegfoxq`, `taj-house-of-spice-supermarket-pos-backend`) database
password was pasted directly into a Claude Code chat session on 2026-08-27 to run `supabase link` /
`supabase db push` for the initial 180-migration schema bootstrap.

Rotate it from the Supabase dashboard → Project Settings → Database → Reset database password, as
hygiene — independent of whether anything went wrong. Update any local `supabase link` state
afterward (re-run `supabase link --project-ref mkvinyekkyennyegfoxq` with the new password when next
needed).

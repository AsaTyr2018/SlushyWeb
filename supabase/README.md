# SlushyWeb Supabase setup

1. Link the local folder with `supabase link --project-ref <project-ref>`.
2. Apply the schema with `supabase db push`.
3. Deploy the guest endpoint with `supabase functions deploy submit-comment`.
4. Set `RATE_LIMIT_SALT` and, when enabled, `TURNSTILE_SECRET_KEY` with
   `supabase secrets set NAME=value`.
5. Create the moderator account in Supabase Authentication, then bootstrap it once
   in the SQL editor:

```sql
insert into public.moderators (user_id)
select id from auth.users where email = 'moderator@example.com';
```

The browser receives only the project URL and publishable key. Never expose a
secret key, service-role key, database password, or personal access token.

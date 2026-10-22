DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['settings', 'tasks', 'conversations', 'chat_history', 'activities', 'sleep_logs', 'transactions', 'files'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.settings, public.tasks, public.conversations, public.chat_history, public.activities, public.sleep_logs, public.transactions, public.files FROM anon';
        EXECUTE 'REVOKE ALL ON SEQUENCE public.tasks_id_seq, public.conversations_id_seq, public.chat_history_id_seq, public.activities_id_seq, public.sleep_logs_id_seq, public.transactions_id_seq, public.files_id_seq FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.settings, public.tasks, public.conversations, public.chat_history, public.activities, public.sleep_logs, public.transactions, public.files FROM authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE public.tasks_id_seq, public.conversations_id_seq, public.chat_history_id_seq, public.activities_id_seq, public.sleep_logs_id_seq, public.transactions_id_seq, public.files_id_seq FROM authenticated';
    END IF;
END $$;

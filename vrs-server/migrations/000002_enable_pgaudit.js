exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        DO $$
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pgaudit;
        EXCEPTION
            WHEN undefined_file THEN
                RAISE NOTICE 'pg_audit extension is not installed in this Postgres image; skipping extension creation.';
        END
        $$;
    `);
};

exports.down = pgm => {
    pgm.sql('DROP EXTENSION IF EXISTS pgaudit');
};

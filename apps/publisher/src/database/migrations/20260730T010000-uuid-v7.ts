import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    /*
     * MIT License - Copyright (c) 2023-2024 Fabio Lima
     * Source: https://gist.githubusercontent.com/fabiolimace/515a0440e3e40efeb234e12644a6a346/
     */
    CREATE OR REPLACE FUNCTION gen_uuid_v7() RETURNS uuid AS $$
    DECLARE
      v_time numeric := extract(epoch from clock_timestamp());
      v_unix_t numeric;
      v_rand_a numeric;
      v_rand_b numeric;
      v_output_bytes bytea;
    BEGIN
      v_unix_t := trunc(v_time * 1000);
      v_rand_a := ((v_time * 1000000) - (v_unix_t * 1000)) * 4.096;
      v_rand_b := random()::numeric * 2^62::numeric;
      v_output_bytes := decode(
        lpad(to_hex(v_unix_t::bigint), 12, '0') ||
        lpad(to_hex((v_rand_a::bigint::bit(64) | x'0000000000007000')::bigint), 4, '0') ||
        lpad(to_hex((v_rand_b::bigint::bit(64) | x'8000000000000000')::bigint), 16, '0'),
        'hex'
      );
      RETURN encode(v_output_bytes, 'hex')::uuid;
    END
    $$ LANGUAGE plpgsql VOLATILE;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS gen_uuid_v7()`.execute(db);
}

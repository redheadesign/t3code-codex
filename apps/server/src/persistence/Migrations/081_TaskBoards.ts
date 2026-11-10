import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE task_boards (
      project_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    )
  `;
});

import { SingleConnectionRuntime } from "@malloydata/malloy";
import { DuckDBConnection } from "@malloydata/db-duckdb";
const conn = new DuckDBConnection("duckdb", ":memory:", process.cwd());
const runtime = new SingleConnectionRuntime({ connection: conn, urlReader: { readURL: async () => "" } as any });
const src = `##! experimental.access_modifiers
source: base is duckdb.sql("select 1 as id, 'x' as status, 2 as qty") include {
  #(doc) Order status, one of x or y
  status
  *
} extend {
  #(doc) Sum of qty
  measure: q is qty.sum()
}
source: child is base extend { dimension: s2 is status }
`;
const model = await runtime.loadModel(src).getModel();
for (const name of ["base", "child"]) {
  const s: any = (model as any)._modelDef.contents[name];
  for (const f of s.fields) console.log(name, f.name, JSON.stringify(f.annotations ?? f.annotation ?? null));
}

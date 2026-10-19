import { buildOntology } from "../packages/app/src/ontology/build";
const API = "http://localhost:4000/api/v0", env = "examples";
const get = (p: string) => fetch(`${API}${p}`).then((r) => r.json());
const pkg = process.argv[2], show = process.argv.slice(3);
const list = (await get(`/environments/${env}/packages/${pkg}/models`)) as Array<{ path: string }>;
const models = await Promise.all(list.map(async (m) => { const d = await get(`/environments/${env}/packages/${pkg}/models/${encodeURIComponent(m.path)}`); return { path: m.path, modelDef: d.modelDef, sourceText: d.sourceText, givens: d.givens }; }));
const o = buildOntology({ environmentName: env, packageName: pkg, models, content: [] });
for (const e of o.entities.values()) {
  if (e.kind === "dimension" && !e.excerpt) continue;
  if (!e.uses.length && !e.usedBy.length) console.log("ISOLATED", e.kind, e.id);
}
for (const id of show) { const e = o.entities.get(id)!; console.log(id, "\n uses:", e.uses.join(", "), "\n usedBy:", e.usedBy.join(", ")); }

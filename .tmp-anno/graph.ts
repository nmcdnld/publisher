import { buildOntology } from "../packages/app/src/ontology/build";

const API = "http://localhost:4000/api/v0";
const env = "examples";
const get = (p: string) => fetch(`${API}${p}`).then((r) => r.json());

const focus = process.argv[2];
const pkgs = (await get(`/environments/${env}/packages`)) as Array<{ name: string }>;
for (const { name } of pkgs) {
   const list = (await get(`/environments/${env}/packages/${name}/models`)) as Array<{ path: string }>;
   const models = await Promise.all(
      list.map(async (m) => {
         const d = await get(`/environments/${env}/packages/${name}/models/${encodeURIComponent(m.path)}`);
         return { path: m.path, modelDef: d.modelDef, sourceText: d.sourceText, givens: d.givens };
      }),
   );
   const o = buildOntology({ environmentName: env, packageName: name, models, content: [] });
   const all = [...o.entities.values()].filter((e) => !(e.kind === "dimension" && !e.excerpt));
   const lonely = all.filter((e) => !e.uses.length && !e.usedBy.length);
   const noUses = all.filter((e) => !e.uses.length);
   const noUsedBy = all.filter((e) => !e.usedBy.length);
   const edges = all.reduce((n, e) => n + e.uses.length, 0);
   console.log(
      `${name}: ${all.length} entities (excl. raw columns), ${edges} edges, no-uses ${noUses.length}, no-usedBy ${noUsedBy.length}, isolated ${lonely.length}`,
   );
   if (focus) {
      for (const e of all) {
         if (!e.id.includes(focus)) continue;
         console.log(`  ${e.id}\n    uses:   ${e.uses.join(", ")}\n    usedBy: ${e.usedBy.join(", ")}`);
      }
   }
}

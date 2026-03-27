import readline from "readline";
import { GraphDB } from "./graph.js";
import { generateCypher, explainSymbol } from "./llm.js";

const HELP = `
Commands:
  ask <question>          — query the graph in plain English (LLM → Cypher → results)
  explain class <name>    — explain what a class does
  explain method <name>   — explain what a method does
  cypher <query>          — run a raw Cypher query
  quit                    — exit
`.trim();

function ollamaError(err: any) {
  if (err?.cause?.code === "ECONNREFUSED") {
    console.warn("[LLM unavailable] Ollama is not running. Start it with: ollama serve");
    console.warn(`Then pull a model if needed: ollama pull ${process.env.OLLAMA_MODEL ?? "llama3"}`);
  } else {
    console.warn("[LLM error]", err?.message ?? err);
  }
}

async function chat() {
  const graph = new GraphDB();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () =>
    new Promise<string>(resolve => rl.question("\n> ", resolve));

  console.log("Connected to Neo4j. Chat with your Java code graph.\n");
  console.log(HELP);

  while (true) {
    const raw = (await prompt()).trim();

    if (!raw) continue;

    if (raw === "quit" || raw === "exit") {
      console.log("Bye!");
      break;
    }

    if (raw === "help") {
      console.log(HELP);
      continue;
    }

    try {
      // ── ask <question> ─────────────────────────────────────────────────────
      if (raw.toLowerCase().startsWith("ask ")) {
        const question = raw.slice(4).trim();
        console.log("\nGenerating Cypher...");
        let cypher: string;
        try {
          cypher = await generateCypher(question);
        } catch (err: any) {
          ollamaError(err);
          continue;
        }
        console.log(`Cypher: ${cypher}\n`);
        const rows = await graph.runQuery(cypher);
        if (rows.length === 0) {
          console.log("No results.");
        } else {
          rows.forEach(r => console.log(JSON.stringify(r)));
        }
        continue;
      }

      // ── explain class / method ──────────────────────────────────────────────
      if (raw.toLowerCase().startsWith("explain ")) {
        const parts = raw.slice(8).trim().split(/\s+/);
        const type = parts[0]?.toLowerCase();
        const name = parts.slice(1).join(" ");

        if ((type !== "class" && type !== "method") || !name) {
          console.log("Usage: explain class <name>  OR  explain method <name>");
          continue;
        }

        console.log(`\nFetching relationships for "${name}"...`);
        const rels = await graph.getRelationships(name);
        console.log(`\nAsking LLM to explain...`);
        let explanation: string;
        try {
          explanation = await explainSymbol(name, type, rels);
        } catch (err: any) {
          ollamaError(err);
          continue;
        }
        console.log("\n" + explanation);
        continue;
      }

      // ── cypher <query> ──────────────────────────────────────────────────────
      if (raw.toLowerCase().startsWith("cypher ")) {
        const cypher = raw.slice(7).trim();
        const rows = await graph.runQuery(cypher);
        if (rows.length === 0) {
          console.log("No results.");
        } else {
          rows.forEach(r => console.log(JSON.stringify(r)));
        }
        continue;
      }

      console.log('Unknown command. Type "help" to see available commands.');

    } catch (err: any) {
      console.error("Error:", err?.message ?? err);
    }
  }

  rl.close();
  await graph.close();
}

chat();

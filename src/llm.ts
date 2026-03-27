import Ollama from "ollama";

const MODEL = process.env.OLLAMA_MODEL ?? "llama3";

const SCHEMA = `
Neo4j graph schema:
- (:Class  { name, kind: "class"|"interface"|"abstract", modifiers: [], annotations: [] })
- (:Method { name, returnType, params: ["name:type",...], modifiers: [], annotations: [] })
- (:Field  { name, type, modifiers: [] })
- (:Module { name })       — imported package or module path
- (:Exception { name })   — thrown exception type

Relationships:
- (:Class)-[:DECLARES]->(:Method)
- (:Class)-[:EXTENDS]->(:Class)
- (:Class)-[:IMPLEMENTS]->(:Class)
- (:Class)-[:HAS_FIELD]->(:Field)
- (:Class)-[:IMPORTS]->(:Module)
- (:Method)-[:CALLS]->(:Method)
- (:Method)-[:THROWS]->(:Exception)
`.trim();

export async function generateCypher(question: string): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          `You are a Neo4j Cypher expert. Given the schema below and a natural language question, ` +
          `output ONLY a valid Cypher query — no explanation, no markdown, no code fences.\n\n${SCHEMA}`,
      },
      { role: "user", content: question },
    ],
  });

  // Strip accidental code fences the model may still emit
  return response.message.content
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

export async function summarizeCodebase(
  classes: string[],
  methods: string[]
): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a software engineer. Given the module/class names and function/method names from a code repository, " +
          "write a concise (3-5 sentence) summary of what the codebase likely does.",
      },
      {
        role: "user",
        content: `Modules/Classes: ${classes.join(", ")}\nFunctions/Methods: ${methods.join(", ")}`,
      },
    ],
  });
  return response.message.content.trim();
}

export async function explainSymbol(
  name: string,
  type: "class" | "method",
  relationships: string[]
): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a software engineer explaining Java code. " +
          "Given a symbol name and its graph relationships, explain what it likely does in 2-4 sentences.",
      },
      {
        role: "user",
        content:
          `${type === "class" ? "Class" : "Method"}: "${name}"\n` +
          `Relationships:\n${relationships.length ? relationships.join("\n") : "(none)"}`,
      },
    ],
  });
  return response.message.content.trim();
}
